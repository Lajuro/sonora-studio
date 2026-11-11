import type { Envelope, Layer, LayerType, Recipe, SequenceLayer } from "@/lib/recipe/schema"
import { MAX_DURATION } from "@/lib/recipe/schema"
import { chainTail, connectChain } from "./effects"
import { scheduleParam } from "./params"
import {
  DEFAULT_ENVELOPE,
  DRUM_DEFAULTS,
  PLUCK_ENVELOPE,
  playDrum,
  playFm,
  playNoise,
  playPluck,
  playTone,
  type VoiceTiming,
} from "./voices"

export type LayerSpan = {
  index: number
  name: string
  type: LayerType
  start: number
  /** fim do som "seco" (sem cauda de efeitos) */
  end: number
  /** fim incluindo a cauda dos efeitos da camada */
  tailEnd: number
  muted: boolean
  events: number
}

export type RenderResult = {
  channels: Float32Array[]
  sampleRate: number
  duration: number
  length: number
  peak: number
  peakDb: number
  rmsDb: number
  spans: LayerSpan[]
  renderMs: number
}

export type RenderOptions = {
  mutedLayers?: ReadonlySet<number>
  soloLayer?: number | null
}

const SEQ_DEFAULT_SECONDS = 0.25

/* ------------------------------------------------------------------------ */
/*                              Linha do tempo                              */
/* ------------------------------------------------------------------------ */

function seqUnit(layer: SequenceLayer, recipe: Recipe) {
  const bpm = layer.bpm ?? recipe.bpm
  return bpm ? 60 / bpm : 1
}

function hasBpm(layer: SequenceLayer, recipe: Recipe) {
  return Boolean(layer.bpm ?? recipe.bpm)
}

/** Duração da nota na unidade da sequência (batidas se houver bpm, senão segundos). */
function seqNoteDuration(layer: SequenceLayer, i: number, recipe: Recipe) {
  const n = layer.notes[i]
  if (n.duration !== undefined) return n.duration
  let next = Infinity
  for (const m of layer.notes) if (m.time > n.time && m.time < next) next = m.time
  if (Number.isFinite(next)) return next - n.time
  return hasBpm(layer, recipe) ? 1 : SEQ_DEFAULT_SECONDS
}

/** Duração (em segundos) de uma passada da camada, sem repetições. */
export function layerPassLength(layer: Layer, recipe: Recipe): number {
  switch (layer.type) {
    case "sequence": {
      const unit = seqUnit(layer, recipe)
      let end = 0
      layer.notes.forEach((n, i) => {
        let d = seqNoteDuration(layer, i, recipe) * unit
        if (layer.voice.type === "drum") {
          const kind = n.kind ?? "kick"
          d = Math.max(d, layer.voice.decay ?? DRUM_DEFAULTS[kind].duration)
        }
        end = Math.max(end, n.time * unit + d)
      })
      return end
    }
    case "drum":
      return layer.duration ?? Math.max(DRUM_DEFAULTS[layer.kind].duration, (layer.decay ?? 0) + 0.05)
    default:
      return layer.duration
  }
}

function repeatInfo(layer: Layer, recipe: Recipe) {
  const count = Math.max(1, Math.round(layer.repeat?.count ?? 1))
  let interval = layer.repeat?.interval
  if (interval === undefined) {
    if (layer.type === "sequence") {
      const unit = seqUnit(layer, recipe)
      if (hasBpm(layer, recipe)) {
        // Em batidas: o padrão fecha no próximo tempo inteiro depois da última nota
        // (ou no fim da nota mais longa, se a duração foi informada).
        let lastStart = 0
        let explicitEnd = 0
        for (const n of layer.notes) {
          lastStart = Math.max(lastStart, n.time)
          if (n.duration !== undefined) explicitEnd = Math.max(explicitEnd, n.time + n.duration)
        }
        interval = Math.max(Math.floor(lastStart + 1e-6) + 1, Math.ceil(explicitEnd - 1e-6)) * unit
      } else {
        let span = 0
        layer.notes.forEach((n, i) => (span = Math.max(span, n.time + seqNoteDuration(layer, i, recipe))))
        interval = span
      }
    } else interval = layerPassLength(layer, recipe)
  }
  return { count, interval: Math.max(0.001, interval) }
}

export function computeSpans(recipe: Recipe, opts: RenderOptions = {}): LayerSpan[] {
  return recipe.layers.map((layer, index) => {
    const { count, interval } = repeatInfo(layer, recipe)
    const pass = layerPassLength(layer, recipe)
    const end = layer.start + (count - 1) * interval + pass
    const muted =
      layer.mute ||
      (opts.mutedLayers?.has(index) ?? false) ||
      (opts.soloLayer !== undefined && opts.soloLayer !== null && opts.soloLayer !== index)
    return {
      index,
      name: layer.name ?? defaultLayerName(layer, index),
      type: layer.type,
      start: layer.start,
      end,
      tailEnd: end + chainTail(layer.effects),
      muted,
      events: count * (layer.type === "sequence" ? layer.notes.length : 1),
    }
  })
}

export function defaultLayerName(layer: Layer, index: number) {
  const labels: Record<LayerType, string> = {
    tone: "Tom",
    noise: "Ruído",
    fm: "FM",
    pluck: "Corda",
    drum: "Bateria",
    sequence: "Sequência",
  }
  const extra = layer.type === "drum" ? ` · ${layer.kind}` : layer.type === "tone" ? ` · ${layer.waveform}` : ""
  return `${labels[layer.type]} ${index + 1}${extra}`
}

export function computeDuration(recipe: Recipe, spans = computeSpans(recipe)): number {
  if (recipe.duration) return Math.min(MAX_DURATION, recipe.duration)
  const active = spans.filter((s) => !s.muted)
  const base = (active.length ? active : spans).reduce((acc, s) => Math.max(acc, s.tailEnd), 0)
  const total = base + chainTail(recipe.master.effects) + 0.05
  return Math.min(MAX_DURATION, Math.max(0.05, total))
}

/* ------------------------------------------------------------------------ */
/*                                 Agendamento                              */
/* ------------------------------------------------------------------------ */

function envelopeFor(type: LayerType, env: Envelope | undefined) {
  if (env) return env
  return type === "pluck" ? PLUCK_ENVELOPE : DEFAULT_ENVELOPE
}

function scheduleLayer(ctx: BaseAudioContext, layer: Layer, out: AudioNode, recipe: Recipe, layerSeed: number) {
  const { count, interval } = repeatInfo(layer, recipe)
  const gainDecay = layer.repeat?.gainDecay ?? 1
  const pitchStep = layer.repeat?.pitchStep ?? 0

  for (let r = 0; r < count; r++) {
    const offset = layer.start + r * interval
    const gainMul = Math.pow(gainDecay, r)
    const pitchRatio = Math.pow(2, (r * pitchStep) / 12)
    if (gainMul <= 0.0001) continue
    const base: VoiceTiming = {
      t0: offset,
      dur: layerPassLength(layer, recipe),
      peak: layer.gain * gainMul,
      pitchRatio,
      seed: layerSeed + r * 7919,
    }

    switch (layer.type) {
      case "tone":
        playTone(ctx, out, { ...layer, envelope: envelopeFor("tone", layer.envelope), filters: layer.filter, lfos: layer.lfo }, base)
        break
      case "noise":
        playNoise(ctx, out, { ...layer, envelope: envelopeFor("noise", layer.envelope), filters: layer.filter, lfos: layer.lfo }, base)
        break
      case "fm":
        playFm(ctx, out, { ...layer, envelope: envelopeFor("fm", layer.envelope), filters: layer.filter, lfos: layer.lfo }, base)
        break
      case "pluck":
        playPluck(ctx, out, { ...layer, envelope: envelopeFor("pluck", layer.envelope), filters: layer.filter, lfos: layer.lfo }, base)
        break
      case "drum":
        playDrum(ctx, out, { ...layer, filters: layer.filter, lfos: layer.lfo }, base)
        break
      case "sequence":
        scheduleSequence(ctx, layer, out, recipe, base)
        break
    }
  }
}

function scheduleSequence(ctx: BaseAudioContext, layer: SequenceLayer, out: AudioNode, recipe: Recipe, base: VoiceTiming) {
  const unit = seqUnit(layer, recipe)
  const v = layer.voice
  layer.notes.forEach((n, i) => {
    const t0 = base.t0 + n.time * unit
    const dur = Math.max(0.005, seqNoteDuration(layer, i, recipe) * unit)
    const pitches = n.pitches.length ? n.pitches : [0]
    const chordNorm = 1 / Math.sqrt(pitches.length)
    pitches.forEach((hz, j) => {
      const timing: VoiceTiming = {
        t0,
        dur,
        peak: base.peak * n.velocity * v.gain * chordNorm,
        pitchRatio: base.pitchRatio,
        seed: base.seed + i * 131 + j * 17,
      }
      const frequency = { kind: "static" as const, value: hz }
      switch (v.type) {
        case "tone":
          playTone(ctx, out, { ...v, frequency, envelope: envelopeFor("tone", v.envelope), filters: v.filter, lfos: v.lfo }, timing)
          break
        case "fm":
          playFm(ctx, out, { ...v, frequency, envelope: envelopeFor("fm", v.envelope), filters: v.filter, lfos: v.lfo }, timing)
          break
        case "pluck":
          playPluck(ctx, out, { ...v, frequency, envelope: envelopeFor("pluck", v.envelope), filters: v.filter, lfos: v.lfo }, timing)
          break
        case "noise":
          playNoise(ctx, out, { ...v, envelope: envelopeFor("noise", v.envelope), filters: v.filter, lfos: v.lfo }, timing)
          break
        case "drum": {
          const kind = n.kind ?? "kick"
          playDrum(
            ctx,
            out,
            { kind, tone: v.tone, decay: v.decay, pitch: hz > 0 ? hz : undefined, filters: v.filter, lfos: v.lfo },
            { ...timing, dur: v.decay ?? DRUM_DEFAULTS[kind].duration },
          )
          break
        }
      }
    })
  })
}

/* ------------------------------------------------------------------------ */
/*                                Renderização                              */
/* ------------------------------------------------------------------------ */

export async function renderRecipe(recipe: Recipe, opts: RenderOptions = {}): Promise<RenderResult> {
  const t = performance.now()
  const spans = computeSpans(recipe, opts)
  const duration = computeDuration(recipe, spans)
  const sr = recipe.sampleRate
  const length = Math.max(1, Math.ceil(duration * sr))
  const ctx = new OfflineAudioContext(recipe.channels, length, sr)

  const masterIn = ctx.createGain()
  connectChain(ctx, recipe.master.effects, masterIn, ctx.destination, { t0: 0, dur: duration, seed: recipe.seed * 3 + 5 })

  recipe.layers.forEach((layer, index) => {
    const span = spans[index]
    if (span.muted) return
    const layerSeed = recipe.seed * 7919 + index * 104729 + 1

    const bus = ctx.createGain()
    let node: AudioNode = bus

    // Em sequências, filtro e LFO da camada valem para a sequência inteira.
    if (layer.type === "sequence") {
      const dur = span.end - span.start
      for (const f of layer.filter ?? []) {
        const bq = ctx.createBiquadFilter()
        bq.type = f.type
        bq.Q.value = f.Q
        bq.gain.value = f.gain
        scheduleParam(bq.frequency, f.frequency, span.start, dur, { min: 10, max: sr / 2 - 1 })
        node.connect(bq)
        node = bq
        for (const l of layer.lfo ?? []) {
          if (l.target !== "filter") continue
          const osc = ctx.createOscillator()
          osc.type = l.waveform
          osc.frequency.value = l.rate
          const g = ctx.createGain()
          g.gain.value = l.depth ?? 600
          osc.connect(g).connect(bq.frequency)
          osc.start(span.start + l.delay)
          osc.stop(span.tailEnd + 0.1)
        }
      }
      for (const l of layer.lfo ?? []) {
        if (l.target === "gain" || l.target === "pan") {
          const osc = ctx.createOscillator()
          osc.type = l.waveform
          osc.frequency.value = l.rate
          const g = ctx.createGain()
          if (l.target === "gain") {
            const depth = Math.min(1, l.depth ?? 0.5)
            const trem = ctx.createGain()
            trem.gain.value = 1 - depth / 2
            g.gain.value = depth / 2
            osc.connect(g).connect(trem.gain)
            node.connect(trem)
            node = trem
          } else {
            const pan = ctx.createStereoPanner()
            g.gain.value = Math.min(1, l.depth ?? 0.7)
            osc.connect(g).connect(pan.pan)
            node.connect(pan)
            node = pan
          }
          osc.start(span.start + l.delay)
          osc.stop(span.tailEnd + 0.1)
        }
      }
    }

    if (layer.pan) {
      const pan = ctx.createStereoPanner()
      scheduleParam(pan.pan, layer.pan, span.start, Math.max(0.01, span.end - span.start), { min: -1, max: 1 })
      node.connect(pan)
      node = pan
    }

    connectChain(ctx, layer.effects, node, masterIn, { t0: span.start, dur: span.tailEnd - span.start, seed: layerSeed + 11 })
    scheduleLayer(ctx, layer, bus, recipe, layerSeed)
  })

  const rendered = await ctx.startRendering()
  const raw: Float32Array[] = []
  for (let c = 0; c < rendered.numberOfChannels; c++) raw.push(rendered.getChannelData(c))

  const { channels, ...stats } = postProcess(raw, sr, recipe)
  return {
    channels,
    sampleRate: sr,
    duration: channels[0].length / sr,
    length: channels[0].length,
    ...stats,
    spans,
    renderMs: performance.now() - t,
  }
}

const TRIM_THRESHOLD = Math.pow(10, -72 / 20)

/**
 * Ganho final, normalização de pico, corte do silêncio no fim (quando a
 * duração não foi fixada na receita), fades e proteção contra clipping.
 */
function postProcess(input: Float32Array[], sr: number, recipe: Recipe) {
  const { master } = recipe
  const fullLen = input[0]?.length ?? 0

  let peak = 0
  for (const ch of input) for (let i = 0; i < fullLen; i++) peak = Math.max(peak, Math.abs(ch[i]))

  let gain = master.gain
  if (master.normalize && peak > 1e-6) gain = (Math.pow(10, master.normalizeTo / 20) / peak) * master.gain

  // Corta a cauda silenciosa (a estimativa das caudas de efeitos é conservadora)
  let len = fullLen
  let trimmed = false
  if (!recipe.duration && peak > 1e-6) {
    const thr = TRIM_THRESHOLD / Math.max(gain, 1e-9)
    let last = 0
    for (const ch of input) {
      for (let i = fullLen - 1; i > last; i--) {
        if (Math.abs(ch[i]) > thr) {
          last = i
          break
        }
      }
    }
    const candidate = Math.min(fullLen, last + Math.round(0.03 * sr))
    if (candidate < fullLen - Math.round(0.02 * sr)) {
      len = Math.max(1, candidate)
      trimmed = true
    }
  }

  const channels = input.map((ch) => new Float32Array(ch.subarray(0, len)))
  const fadeIn = Math.min(len, Math.floor(master.fadeIn * sr))
  const fadeOut = Math.min(len, Math.floor(Math.max(master.fadeOut, trimmed ? 0.025 : 0) * sr))

  let newPeak = 0
  let sumSq = 0
  for (const ch of channels) {
    for (let i = 0; i < len; i++) {
      let v = ch[i] * gain
      if (fadeIn > 0 && i < fadeIn) v *= i / fadeIn
      if (fadeOut > 0 && i >= len - fadeOut) v *= (len - 1 - i) / fadeOut
      // Clipping suave apenas acima de 0,98 (só acontece com normalize desligado)
      const a = Math.abs(v)
      if (a > 0.98) v = Math.sign(v) * (0.98 + 0.02 * Math.tanh((a - 0.98) / 0.02))
      ch[i] = v
      newPeak = Math.max(newPeak, Math.abs(v))
      sumSq += v * v
    }
  }
  const rms = Math.sqrt(sumSq / Math.max(1, len * channels.length))
  const toDb = (x: number) => (x > 1e-9 ? 20 * Math.log10(x) : -Infinity)
  return { channels, peak: newPeak, peakDb: toDb(newPeak), rmsDb: toDb(rms) }
}

/** Instantes (s) em que cada evento da camada começa, para desenhar marcas na linha do tempo. */
export function layerEventTimes(recipe: Recipe, index: number, max = 400): number[] {
  const layer = recipe.layers[index]
  if (!layer) return []
  const { count, interval } = repeatInfo(layer, recipe)
  const out: number[] = []
  for (let r = 0; r < count && out.length < max; r++) {
    const base = layer.start + r * interval
    if (layer.type === "sequence") {
      const unit = seqUnit(layer, recipe)
      for (const n of layer.notes) {
        out.push(base + n.time * unit)
        if (out.length >= max) break
      }
    } else out.push(base)
  }
  return out
}
