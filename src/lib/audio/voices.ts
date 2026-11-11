import type { DrumKind, Envelope, Filter, Lfo, ParamSpec, Waveform } from "@/lib/recipe/schema"
import { generateNoise, karplusStrong, type NoiseColor } from "./dsp"
import { initialValue, scheduleEnvelope, scheduleParam } from "./params"

type Ctx = BaseAudioContext

export const DEFAULT_ENVELOPE: Envelope = { attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.2, curve: "exponential" }
export const PLUCK_ENVELOPE: Envelope = { attack: 0.001, decay: 0, sustain: 1, release: 0.08, curve: "exponential" }
const GATE_ENVELOPE: Envelope = { attack: 0.0005, decay: 0, sustain: 1, release: 0.004, curve: "linear" }

export const DRUM_DEFAULTS: Record<DrumKind, { duration: number; decay: number; pitch: number }> = {
  kick: { duration: 0.6, decay: 0.45, pitch: 50 },
  snare: { duration: 0.3, decay: 0.2, pitch: 185 },
  hihat: { duration: 0.12, decay: 0.06, pitch: 40 },
  openhat: { duration: 0.6, decay: 0.4, pitch: 40 },
  clap: { duration: 0.4, decay: 0.25, pitch: 1200 },
  tom: { duration: 0.6, decay: 0.4, pitch: 120 },
  rim: { duration: 0.1, decay: 0.05, pitch: 1700 },
  cowbell: { duration: 0.5, decay: 0.35, pitch: 540 },
  crash: { duration: 2.2, decay: 1.8, pitch: 40 },
}

export const LFO_DEFAULT_DEPTH = { pitch: 20, gain: 0.5, pan: 0.7, filter: 600 } as const

export type VoiceTiming = {
  t0: number
  dur: number
  peak: number
  pitchRatio: number
  seed: number
}

export type ChainSpec = {
  envelope: Envelope
  filters?: Filter[]
  lfos?: Lfo[]
}

type VoiceChain = {
  input: GainNode
  pitchLfos: AudioNode[]
}

function makeLfo(ctx: Ctx, l: Lfo, t0: number, dur: number) {
  const depth = l.depth ?? LFO_DEFAULT_DEPTH[l.target]
  const osc = ctx.createOscillator()
  osc.type = l.waveform
  osc.frequency.value = l.rate
  const g = ctx.createGain()
  const start = t0 + l.delay
  g.gain.setValueAtTime(0, t0)
  if (l.fadeIn > 0) {
    g.gain.setValueAtTime(0, start)
    g.gain.linearRampToValueAtTime(depth, start + l.fadeIn)
  } else g.gain.setValueAtTime(depth, start)
  osc.connect(g)
  osc.start(t0)
  osc.stop(t0 + dur + 0.1)
  return g
}

/**
 * Cadeia de uma voz: fontes → filtros → envelope (amp) → tremolo → pan do LFO → saída.
 */
export function buildChain(ctx: Ctx, out: AudioNode, spec: ChainSpec, timing: VoiceTiming): VoiceChain {
  const { t0, dur, peak } = timing
  const input = ctx.createGain()
  let node: AudioNode = input

  const filterNodes: BiquadFilterNode[] = []
  for (const f of spec.filters ?? []) {
    const bq = ctx.createBiquadFilter()
    bq.type = f.type
    bq.Q.value = f.Q
    bq.gain.value = f.gain
    scheduleParam(bq.frequency, f.frequency, t0, dur, { min: 10, max: ctx.sampleRate / 2 - 1 })
    node.connect(bq)
    node = bq
    filterNodes.push(bq)
  }

  const amp = ctx.createGain()
  amp.gain.value = 0
  scheduleEnvelope(amp.gain, spec.envelope, t0, dur, peak)
  node.connect(amp)
  node = amp

  const pitchLfos: AudioNode[] = []
  for (const l of spec.lfos ?? []) {
    const lfo = makeLfo(ctx, l, t0, dur)
    if (l.target === "pitch") pitchLfos.push(lfo)
    else if (l.target === "filter") filterNodes.forEach((f) => lfo.connect(f.frequency))
    else if (l.target === "gain") {
      const trem = ctx.createGain()
      const depth = Math.min(1, l.depth ?? LFO_DEFAULT_DEPTH.gain)
      trem.gain.value = 1 - depth / 2
      const scaled = ctx.createGain()
      scaled.gain.value = 0.5
      lfo.connect(scaled).connect(trem.gain)
      node.connect(trem)
      node = trem
    } else if (l.target === "pan") {
      const pan = ctx.createStereoPanner()
      pan.pan.value = 0
      lfo.connect(pan.pan)
      node.connect(pan)
      node = pan
    }
  }

  node.connect(out)
  return { input, pitchLfos }
}

/* --------------------------------- Tone ----------------------------------- */

export type ToneParams = ChainSpec & {
  waveform: Waveform
  frequency: ParamSpec
  detune: number
  unison?: { voices: number; detune: number; spread: number }
  harmonics?: number[]
}

const waveCache = new WeakMap<Ctx, Map<string, PeriodicWave>>()
function periodicWave(ctx: Ctx, harmonics: number[]) {
  let map = waveCache.get(ctx)
  if (!map) waveCache.set(ctx, (map = new Map()))
  const key = harmonics.join(",")
  let wave = map.get(key)
  if (!wave) {
    const real = new Float32Array(harmonics.length + 1)
    const imag = new Float32Array(harmonics.length + 1)
    harmonics.forEach((h, i) => (imag[i + 1] = h))
    wave = ctx.createPeriodicWave(real, imag)
    map.set(key, wave)
  }
  return wave
}

export function playTone(ctx: Ctx, out: AudioNode, p: ToneParams, timing: VoiceTiming) {
  const { t0, dur, pitchRatio } = timing
  const chain = buildChain(ctx, out, p, timing)
  const voices = Math.max(1, Math.round(p.unison?.voices ?? 1))
  const spreadCents = p.unison?.detune ?? 0
  const width = p.unison?.spread ?? 0
  const wave = p.harmonics?.length ? periodicWave(ctx, p.harmonics) : null
  const norm = 1 / Math.sqrt(voices)

  for (let i = 0; i < voices; i++) {
    const osc = ctx.createOscillator()
    if (wave) osc.setPeriodicWave(wave)
    else osc.type = p.waveform
    scheduleParam(osc.frequency, p.frequency, t0, dur, { scale: pitchRatio, min: 0, max: ctx.sampleRate / 2 })
    const pos = voices > 1 ? (i / (voices - 1)) * 2 - 1 : 0
    osc.detune.setValueAtTime(p.detune + (pos * spreadCents) / 2, t0)
    chain.pitchLfos.forEach((l) => l.connect(osc.detune))
    const g = ctx.createGain()
    g.gain.value = norm
    osc.connect(g)
    if (voices > 1 && width > 0) {
      const pan = ctx.createStereoPanner()
      pan.pan.value = pos * width
      g.connect(pan).connect(chain.input)
    } else g.connect(chain.input)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }
}

/* --------------------------------- Noise ---------------------------------- */

export function playNoise(ctx: Ctx, out: AudioNode, p: ChainSpec & { color: NoiseColor }, timing: VoiceTiming) {
  const { t0, dur, seed } = timing
  const chain = buildChain(ctx, out, p, timing)
  const length = Math.ceil((dur + 0.05) * ctx.sampleRate)
  const data = generateNoise(length, p.color, seed)
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(chain.input)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

/* ---------------------------------- FM ------------------------------------ */

export type FmParams = ChainSpec & {
  waveform: Waveform
  frequency: ParamSpec
  detune: number
  modulator: { ratio: number; index: number; waveform: Waveform; envelope?: Envelope }
}

export function playFm(ctx: Ctx, out: AudioNode, p: FmParams, timing: VoiceTiming) {
  const { t0, dur, pitchRatio } = timing
  const chain = buildChain(ctx, out, p, timing)
  const nyq = ctx.sampleRate / 2

  const carrier = ctx.createOscillator()
  carrier.type = p.waveform
  scheduleParam(carrier.frequency, p.frequency, t0, dur, { scale: pitchRatio, min: 0, max: nyq })
  carrier.detune.setValueAtTime(p.detune, t0)

  const mod = ctx.createOscillator()
  mod.type = p.modulator.waveform
  scheduleParam(mod.frequency, p.frequency, t0, dur, { scale: pitchRatio * p.modulator.ratio, min: 0, max: nyq })
  mod.detune.setValueAtTime(p.detune, t0)

  // Profundidade (Hz) = índice × frequência do modulador
  const depth = ctx.createGain()
  depth.gain.value = 0
  scheduleParam(depth.gain, p.frequency, t0, dur, { scale: pitchRatio * p.modulator.ratio * p.modulator.index })
  const indexEnv = ctx.createGain()
  indexEnv.gain.value = 0
  scheduleEnvelope(indexEnv.gain, p.modulator.envelope ?? p.envelope, t0, dur, 1)

  mod.connect(depth).connect(indexEnv).connect(carrier.frequency)
  chain.pitchLfos.forEach((l) => {
    l.connect(carrier.detune)
    l.connect(mod.detune)
  })
  carrier.connect(chain.input)
  carrier.start(t0)
  mod.start(t0)
  carrier.stop(t0 + dur + 0.02)
  mod.stop(t0 + dur + 0.02)
}

/* --------------------------------- Pluck ---------------------------------- */

export type PluckParams = ChainSpec & { frequency: ParamSpec; damping: number; brightness: number }

export function playPluck(ctx: Ctx, out: AudioNode, p: PluckParams, timing: VoiceTiming) {
  const { t0, dur, pitchRatio, seed } = timing
  const chain = buildChain(ctx, out, p, timing)
  const freq = initialValue(p.frequency) * pitchRatio
  const data = karplusStrong(ctx.sampleRate, freq, dur + 0.05, p.damping, p.brightness, seed)
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate)
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  chain.pitchLfos.forEach((l) => l.connect(src.detune))
  src.connect(chain.input)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

/* --------------------------------- Drums ---------------------------------- */

export type DrumParams = {
  kind: DrumKind
  pitch?: number
  decay?: number
  tone: number
  filters?: Filter[]
  lfos?: Lfo[]
}

function noiseSource(ctx: Ctx, seconds: number, seed: number, color: NoiseColor = "white") {
  const length = Math.max(1, Math.ceil(seconds * ctx.sampleRate))
  const buf = ctx.createBuffer(1, length, ctx.sampleRate)
  buf.copyToChannel(generateNoise(length, color, seed) as Float32Array<ArrayBuffer>, 0)
  const src = ctx.createBufferSource()
  src.buffer = buf
  return src
}

function percEnv(param: AudioParam, t0: number, peak: number, decay: number, attack = 0.0008) {
  param.setValueAtTime(0, t0)
  param.linearRampToValueAtTime(peak, t0 + attack)
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + Math.max(0.005, decay))
  param.setValueAtTime(0, t0 + attack + Math.max(0.005, decay) + 0.001)
}

function filt(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.7) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = Math.min(freq, ctx.sampleRate / 2 - 1)
  f.Q.value = q
  return f
}

function metallic(ctx: Ctx, base: number, t0: number, stop: number, dest: AudioNode) {
  const ratios = [2, 3, 4.16, 5.43, 6.79, 8.21]
  for (const r of ratios) {
    const o = ctx.createOscillator()
    o.type = "square"
    o.frequency.value = Math.min(base * r, ctx.sampleRate / 2 - 1)
    o.connect(dest)
    o.start(t0)
    o.stop(stop)
  }
}

export function playDrum(ctx: Ctx, out: AudioNode, p: DrumParams, timing: VoiceTiming) {
  const { t0, peak, pitchRatio, seed } = timing
  const def = DRUM_DEFAULTS[p.kind]
  const decay = p.decay ?? def.decay
  const pitch = (p.pitch ?? def.pitch) * pitchRatio
  const tone = p.tone
  const dur = Math.max(timing.dur, decay + 0.02)
  const end = t0 + dur + 0.05

  const chain = buildChain(ctx, out, { envelope: GATE_ENVELOPE, filters: p.filters, lfos: p.lfos }, { ...timing, dur: dur + 0.02, peak: 1 })
  const dest = chain.input

  switch (p.kind) {
    case "kick": {
      const osc = ctx.createOscillator()
      osc.type = "sine"
      osc.frequency.setValueAtTime(pitch * 3.4, t0)
      osc.frequency.exponentialRampToValueAtTime(pitch, t0 + 0.05 + decay * 0.12)
      const amp = ctx.createGain()
      percEnv(amp.gain, t0, peak, decay, 0.0015)
      osc.connect(amp).connect(dest)
      chain.pitchLfos.forEach((l) => l.connect(osc.detune))
      osc.start(t0)
      osc.stop(end)
      const click = noiseSource(ctx, 0.03, seed)
      const ca = ctx.createGain()
      percEnv(ca.gain, t0, peak * (0.15 + tone * 0.5), 0.008)
      click.connect(filt(ctx, "highpass", 1500)).connect(ca).connect(dest)
      click.start(t0)
      break
    }
    case "snare": {
      for (const [mult, lvl] of [
        [1, 0.6],
        [1.78, 0.3],
      ] as const) {
        const o = ctx.createOscillator()
        o.type = "triangle"
        o.frequency.setValueAtTime(pitch * mult * 1.3, t0)
        o.frequency.exponentialRampToValueAtTime(pitch * mult, t0 + 0.03)
        const a = ctx.createGain()
        percEnv(a.gain, t0, peak * lvl, decay * 0.5)
        o.connect(a).connect(dest)
        chain.pitchLfos.forEach((l) => l.connect(o.detune))
        o.start(t0)
        o.stop(end)
      }
      const n = noiseSource(ctx, decay + 0.05, seed)
      const na = ctx.createGain()
      percEnv(na.gain, t0, peak * (0.5 + tone * 0.5), decay)
      n.connect(filt(ctx, "highpass", 900 + tone * 1200)).connect(na).connect(dest)
      n.start(t0)
      break
    }
    case "hihat":
    case "openhat":
    case "crash": {
      const bp = filt(ctx, "bandpass", p.kind === "crash" ? 7000 : 10000, p.kind === "crash" ? 0.5 : 1)
      const hp = filt(ctx, "highpass", (p.kind === "crash" ? 3500 : 6500) + tone * 2500)
      const amp = ctx.createGain()
      percEnv(amp.gain, t0, peak * 0.55, decay, p.kind === "crash" ? 0.002 : 0.0008)
      metallic(ctx, pitch, t0, end, bp)
      bp.connect(hp).connect(amp).connect(dest)
      const n = noiseSource(ctx, decay + 0.05, seed)
      const na = ctx.createGain()
      percEnv(na.gain, t0, peak * (p.kind === "crash" ? 0.5 : 0.25), decay)
      n.connect(filt(ctx, "highpass", 7000)).connect(na).connect(dest)
      n.start(t0)
      break
    }
    case "clap": {
      const n = noiseSource(ctx, decay + 0.1, seed)
      const bp = filt(ctx, "bandpass", pitch * (0.8 + tone * 0.6), 1.4)
      const amp = ctx.createGain()
      amp.gain.setValueAtTime(0, t0)
      for (let i = 0; i < 3; i++) {
        const t = t0 + i * 0.011
        amp.gain.setValueAtTime(peak, t)
        amp.gain.exponentialRampToValueAtTime(peak * 0.1, t + 0.009)
      }
      const tail = t0 + 0.033
      amp.gain.setValueAtTime(peak * 0.9, tail)
      amp.gain.exponentialRampToValueAtTime(0.0001, tail + decay)
      amp.gain.setValueAtTime(0, tail + decay + 0.001)
      n.connect(bp).connect(amp).connect(dest)
      n.start(t0)
      break
    }
    case "tom": {
      const o = ctx.createOscillator()
      o.type = "sine"
      o.frequency.setValueAtTime(pitch * 1.6, t0)
      o.frequency.exponentialRampToValueAtTime(pitch, t0 + 0.08)
      const a = ctx.createGain()
      percEnv(a.gain, t0, peak, decay, 0.002)
      o.connect(a).connect(dest)
      chain.pitchLfos.forEach((l) => l.connect(o.detune))
      o.start(t0)
      o.stop(end)
      const n = noiseSource(ctx, 0.05, seed)
      const na = ctx.createGain()
      percEnv(na.gain, t0, peak * 0.15 * (0.5 + tone), 0.02)
      n.connect(filt(ctx, "bandpass", pitch * 6, 1)).connect(na).connect(dest)
      n.start(t0)
      break
    }
    case "rim": {
      const o = ctx.createOscillator()
      o.type = "triangle"
      o.frequency.value = pitch
      const o2 = ctx.createOscillator()
      o2.type = "square"
      o2.frequency.value = pitch * 0.47
      const bp = filt(ctx, "bandpass", pitch, 3)
      const a = ctx.createGain()
      percEnv(a.gain, t0, peak, decay)
      o.connect(bp)
      o2.connect(bp)
      bp.connect(a).connect(dest)
      for (const x of [o, o2]) {
        x.start(t0)
        x.stop(end)
      }
      break
    }
    case "cowbell": {
      const bp = filt(ctx, "bandpass", pitch * 1.48, 2.5 + tone * 3)
      const a = ctx.createGain()
      a.gain.setValueAtTime(0, t0)
      a.gain.linearRampToValueAtTime(peak, t0 + 0.001)
      a.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.04)
      a.gain.exponentialRampToValueAtTime(0.0001, t0 + decay)
      a.gain.setValueAtTime(0, t0 + decay + 0.001)
      for (const f of [pitch, pitch * 1.48]) {
        const o = ctx.createOscillator()
        o.type = "square"
        o.frequency.value = f
        o.connect(bp)
        o.start(t0)
        o.stop(end)
      }
      bp.connect(a).connect(dest)
      break
    }
  }
}
