import type { Effect } from "@/lib/recipe/schema"
import { bitcrushCurve, reverbImpulse, softClipCurve } from "./dsp"
import { scheduleParam } from "./params"

type Ctx = BaseAudioContext
type Port = { input: AudioNode; output: AudioNode }
type Base = { t0: number; dur: number; seed: number }

/** Divide o sinal em seco/molhado com crossfade de potência constante. */
function wetDry(ctx: Ctx, mix: number, wet: (input: AudioNode) => AudioNode): Port {
  const input = ctx.createGain()
  const output = ctx.createGain()
  const dry = ctx.createGain()
  const wetGain = ctx.createGain()
  dry.gain.value = Math.cos((mix * Math.PI) / 2)
  wetGain.gain.value = Math.sin((mix * Math.PI) / 2)
  input.connect(dry).connect(output)
  wet(input).connect(wetGain).connect(output)
  return { input, output }
}

function lfo(ctx: Ctx, type: OscillatorType, rate: number, depth: number, base: Base) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = rate
  const g = ctx.createGain()
  g.gain.value = depth
  osc.connect(g)
  osc.start(0)
  osc.stop(base.t0 + base.dur + 30)
  return g
}

export function buildEffect(ctx: Ctx, fx: Effect, base: Base): Port {
  switch (fx.type) {
    case "reverb": {
      // O reverb mantém o sinal seco quase intacto e soma a cauda por cima.
      const input = ctx.createGain()
      const output = ctx.createGain()
      const dry = ctx.createGain()
      dry.gain.value = 1 - fx.mix * 0.5
      const conv = ctx.createConvolver()
      const ir = reverbImpulse(ctx.sampleRate, fx.decay, fx.tone, base.seed + 101)
      const buf = ctx.createBuffer(2, ir[0].length, ctx.sampleRate)
      buf.copyToChannel(ir[0] as Float32Array<ArrayBuffer>, 0)
      buf.copyToChannel(ir[1] as Float32Array<ArrayBuffer>, 1)
      conv.buffer = buf
      const pre = ctx.createDelay(1)
      pre.delayTime.value = fx.preDelay
      const wet = ctx.createGain()
      wet.gain.value = fx.mix * 1.2
      input.connect(dry).connect(output)
      input.connect(pre).connect(conv).connect(wet).connect(output)
      return { input, output }
    }

    case "delay": {
      const input = ctx.createGain()
      const output = ctx.createGain()
      const dry = ctx.createGain()
      dry.gain.value = 1 - fx.mix * 0.4
      const wet = ctx.createGain()
      wet.gain.value = fx.mix
      input.connect(dry).connect(output)

      if (fx.pingPong) {
        const left = ctx.createDelay(4)
        const right = ctx.createDelay(4)
        left.delayTime.value = fx.time
        right.delayTime.value = fx.time
        const fb = ctx.createGain()
        fb.gain.value = fx.feedback
        const tone = ctx.createBiquadFilter()
        tone.type = "lowpass"
        tone.frequency.value = fx.tone
        const merger = ctx.createChannelMerger(2)
        const mono = ctx.createGain()
        mono.channelCount = 1
        mono.channelCountMode = "explicit"
        input.connect(mono).connect(left)
        left.connect(tone).connect(right)
        right.connect(fb).connect(left)
        left.connect(merger, 0, 0)
        right.connect(merger, 0, 1)
        merger.connect(wet).connect(output)
      } else {
        const d = ctx.createDelay(4)
        d.delayTime.value = fx.time
        const fb = ctx.createGain()
        fb.gain.value = fx.feedback
        const tone = ctx.createBiquadFilter()
        tone.type = "lowpass"
        tone.frequency.value = fx.tone
        input.connect(d)
        d.connect(tone).connect(fb).connect(d)
        d.connect(wet).connect(output)
      }
      return { input, output }
    }

    case "distortion":
      return wetDry(ctx, fx.mix, (input) => {
        const pre = ctx.createGain()
        pre.gain.value = 1
        const shaper = ctx.createWaveShaper()
        shaper.curve = softClipCurve(fx.amount)
        shaper.oversample = "4x"
        const tone = ctx.createBiquadFilter()
        tone.type = "lowpass"
        tone.frequency.value = 1200 * Math.pow(16, fx.tone)
        const post = ctx.createGain()
        post.gain.value = 0.8
        input.connect(pre).connect(shaper).connect(tone).connect(post)
        return post
      })

    case "bitcrush":
      return wetDry(ctx, fx.mix, (input) => {
        const shaper = ctx.createWaveShaper()
        shaper.curve = bitcrushCurve(fx.bits)
        input.connect(shaper)
        return shaper
      })

    case "chorus":
      return wetDry(ctx, fx.mix, (input) => {
        const merger = ctx.createChannelMerger(2)
        const baseDelay = 0.018
        const depth = 0.0005 + fx.depth * 0.006
        for (let ch = 0; ch < 2; ch++) {
          const d = ctx.createDelay(0.1)
          d.delayTime.value = baseDelay + (ch ? 0.004 : 0)
          const mod = lfo(ctx, "sine", fx.rate * (ch ? 1.07 : 1), ch ? -depth : depth, base)
          mod.connect(d.delayTime)
          input.connect(d)
          d.connect(merger, 0, ch)
        }
        return merger
      })

    case "phaser":
      return wetDry(ctx, fx.mix, (input) => {
        const stages = Math.round(fx.stages)
        const sum = ctx.createGain()
        input.connect(sum)
        let node: AudioNode = sum
        const filters: BiquadFilterNode[] = []
        for (let i = 0; i < stages; i++) {
          const ap = ctx.createBiquadFilter()
          ap.type = "allpass"
          ap.frequency.value = fx.frequency
          ap.Q.value = 0.5
          node.connect(ap)
          node = ap
          filters.push(ap)
        }
        const mod = lfo(ctx, "sine", fx.rate, fx.frequency * 0.9 * fx.depth, base)
        filters.forEach((f) => mod.connect(f.frequency))
        // Todo ciclo no grafo precisa de um DelayNode.
        const fbDelay = ctx.createDelay(0.01)
        fbDelay.delayTime.value = 128 / ctx.sampleRate
        const fb = ctx.createGain()
        fb.gain.value = fx.feedback
        node.connect(fbDelay).connect(fb).connect(sum)
        return node
      })

    case "tremolo": {
      const input = ctx.createGain()
      if (fx.stereo) {
        const pan = ctx.createStereoPanner()
        pan.pan.value = 0
        lfo(ctx, fx.waveform, fx.rate, fx.depth, base).connect(pan.pan)
        input.connect(pan)
        return { input, output: pan }
      }
      const amp = ctx.createGain()
      amp.gain.value = 1 - fx.depth / 2
      lfo(ctx, fx.waveform, fx.rate, fx.depth / 2, base).connect(amp.gain)
      input.connect(amp)
      return { input, output: amp }
    }

    case "filter": {
      const f = ctx.createBiquadFilter()
      f.type = fx.filterType
      f.Q.value = fx.Q
      f.gain.value = fx.gain
      scheduleParam(f.frequency, fx.frequency, base.t0, base.dur, { min: 10, max: ctx.sampleRate / 2 - 1 })
      return { input: f, output: f }
    }

    case "compressor": {
      const c = ctx.createDynamicsCompressor()
      c.threshold.value = fx.threshold
      c.ratio.value = fx.ratio
      c.attack.value = fx.attack
      c.release.value = fx.release
      c.knee.value = fx.knee
      const makeup = ctx.createGain()
      makeup.gain.value = Math.pow(10, fx.makeup / 20)
      c.connect(makeup)
      return { input: c, output: makeup }
    }

    case "eq": {
      const low = ctx.createBiquadFilter()
      low.type = "lowshelf"
      low.frequency.value = fx.lowFreq
      low.gain.value = fx.low
      const mid = ctx.createBiquadFilter()
      mid.type = "peaking"
      mid.frequency.value = fx.midFreq
      mid.Q.value = 0.8
      mid.gain.value = fx.mid
      const high = ctx.createBiquadFilter()
      high.type = "highshelf"
      high.frequency.value = fx.highFreq
      high.gain.value = fx.high
      low.connect(mid).connect(high)
      return { input: low, output: high }
    }
  }
}

/** Quanto tempo o efeito continua soando depois que a fonte para. */
export function effectTail(fx: Effect): number {
  switch (fx.type) {
    case "reverb":
      return fx.preDelay + fx.decay
    case "delay": {
      if (fx.feedback <= 0.001) return fx.time
      const repeats = Math.ceil(Math.log(0.001) / Math.log(fx.feedback))
      return Math.min(8, fx.time * (repeats + 1))
    }
    case "chorus":
    case "phaser":
      return 0.05
    default:
      return 0
  }
}

export function chainTail(effects: Effect[] | undefined) {
  return (effects ?? []).reduce((acc, fx) => acc + effectTail(fx), 0)
}

export function connectChain(ctx: Ctx, effects: Effect[] | undefined, input: AudioNode, output: AudioNode, base: Base) {
  let node = input
  ;(effects ?? []).forEach((fx, i) => {
    const port = buildEffect(ctx, fx, { ...base, seed: base.seed + i * 13 })
    node.connect(port.input)
    node = port.output
  })
  node.connect(output)
}
