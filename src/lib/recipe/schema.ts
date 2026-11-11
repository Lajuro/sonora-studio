import { z } from "zod"
import { noteToFrequency } from "./notes"

z.config(z.locales.ptBR())

/* -------------------------------------------------------------------------- */
/*                                   Limites                                  */
/* -------------------------------------------------------------------------- */

export const MAX_DURATION = 60
export const MAX_LAYERS = 48
export const SAMPLE_RATES = [22050, 32000, 44100, 48000, 96000] as const

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

function toNumber(v: unknown) {
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".")
    if (s !== "" && !Number.isNaN(Number(s))) return Number(s)
  }
  return v
}

/** Número com valor padrão, aceitando string numérica e limitando ao intervalo. */
const num = (def: number, min: number, max: number) =>
  z
    .preprocess(toNumber, z.number({ error: "Esperava um número" }).transform((v) => clamp(v, min, max)))
    .default(def)

/** Número opcional (sem padrão), limitado ao intervalo. */
const optNum = (min: number, max: number) =>
  z
    .preprocess(toNumber, z.number({ error: "Esperava um número" }).transform((v) => clamp(v, min, max)))
    .optional()

const bool = (def: boolean) =>
  z
    .preprocess((v) => {
      if (v === "true" || v === 1) return true
      if (v === "false" || v === 0) return false
      return v
    }, z.boolean({ error: "Esperava true ou false" }))
    .default(def)

const squash = (s: string) => s.trim().toLowerCase().replace(/[\s_\-.]+/g, "")

/** Enum tolerante: ignora maiúsculas, hífens, espaços e aceita apelidos. */
function aliasEnum<const T extends readonly [string, ...string[]]>(
  values: T,
  aliases: Record<string, T[number]> = {},
  label = "valor",
) {
  return z.preprocess(
    (v) => {
      if (typeof v !== "string") return v
      const k = squash(v)
      for (const val of values) if (squash(val) === k) return val
      return aliases[k] ?? v
    },
    z.enum(values, {
      error: (iss) =>
        iss.code === "invalid_value"
          ? `${label} inválido: ${JSON.stringify(iss.input)}. Use: ${values.join(", ")}`
          : undefined,
    }),
  )
}

/** Renomeia chaves alternativas que a IA costuma usar (ex.: "freq" → "frequency"). */
function keyAliases(aliases: Record<string, string>) {
  return (v: unknown) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) return v
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const target = aliases[k] ?? aliases[squash(k)]
      if (target && !(target in (v as Record<string, unknown>))) out[target] = val
      else out[k] = val
    }
    return out
  }
}

const asArray = (v: unknown) => (v === undefined || v === null ? v : Array.isArray(v) ? v : [v])

/* -------------------------------------------------------------------------- */
/*                                 Primitivos                                 */
/* -------------------------------------------------------------------------- */

export const WAVEFORMS = ["sine", "square", "sawtooth", "triangle"] as const
export const Waveform = aliasEnum(
  WAVEFORMS,
  {
    sin: "sine",
    sinewave: "sine",
    seno: "sine",
    senoidal: "sine",
    saw: "sawtooth",
    sawwave: "sawtooth",
    serra: "sawtooth",
    dentedeserra: "sawtooth",
    sqr: "square",
    pulse: "square",
    quadrada: "square",
    tri: "triangle",
    triangular: "triangle",
  },
  "Forma de onda",
)
export type Waveform = (typeof WAVEFORMS)[number]

export const Curve = aliasEnum(
  ["linear", "exponential"],
  { exp: "exponential", lin: "linear", log: "exponential", exponencial: "exponential" },
  "Curva",
)
export type Curve = "linear" | "exponential"

/** Frequência: número em Hz ou nota musical ("A4", "C#5", "Eb3"). */
export const Pitch = z
  .union([z.number(), z.string()], {
    error: 'Use frequência em Hz (ex.: 440) ou nota (ex.: "A4", "C#5")',
  })
  .transform((v, ctx) => {
    const f = typeof v === "number" ? v : noteToFrequency(v)
    if (f === null || !Number.isFinite(f)) {
      ctx.issues.push({
        code: "custom",
        message: `Nota ou frequência inválida: ${JSON.stringify(v)}. Use Hz (ex.: 440) ou nota (ex.: "A4", "C#5")`,
        input: v,
      })
      return z.NEVER
    }
    return clamp(f, 0, 24000)
  })

const PlainValue = z.preprocess(toNumber, z.number({ error: "Esperava um número" }))

/* --------------------------- Parâmetros automatizáveis -------------------- */

export type ParamSpec =
  | { kind: "static"; value: number }
  | { kind: "ramp"; from: number; to: number; curve: Curve; time?: number; delay: number }
  | { kind: "points"; points: { time: number; value: number }[]; curve: Curve }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeParam(value: z.ZodType<number, any>, defaultCurve: Curve) {
  const point = z.preprocess(
    (p) => (Array.isArray(p) ? { time: p[0], value: p[1] } : keyAliases({ t: "time", at: "time", v: "value" })(p)),
    z.strictObject({ time: num(0, 0, 10_000), value }),
  )
  const stat = z.strictObject({ kind: z.literal("static"), value })
  const ramp = z.strictObject({
    kind: z.literal("ramp"),
    from: value,
    to: value,
    curve: Curve.default(defaultCurve),
    time: optNum(0.0001, 10_000),
    delay: num(0, 0, 10_000),
  })
  const points = z.strictObject({
    kind: z.literal("points"),
    points: z.array(point).min(1, "Informe pelo menos um ponto"),
    curve: Curve.default("linear"),
  })

  return z.preprocess(
    (raw) => {
      if (typeof raw === "number" || typeof raw === "string") return { kind: "static", value: raw }
      if (Array.isArray(raw)) return { kind: "points", points: raw }
      if (raw && typeof raw === "object") {
        const o = keyAliases({
          start: "from",
          begin: "from",
          end: "to",
          target: "to",
          duration: "time",
          length: "time",
          type: "curve",
          shape: "curve",
          automation: "points",
          keyframes: "points",
        })(raw) as Record<string, unknown>
        if ("points" in o) return { ...o, kind: "points" }
        if ("from" in o || "to" in o) return { ...o, kind: "ramp" }
        if ("value" in o) return { kind: "static", value: o.value }
      }
      return raw
    },
    z.discriminatedUnion("kind", [stat, ramp, points], {
      error: (iss) =>
        iss.code === "invalid_union" || iss.code === "invalid_type"
          ? 'Use um valor fixo, { "from", "to" } para uma rampa ou { "points": [[tempo, valor], ...] }'
          : undefined,
    }),
  ) as unknown as z.ZodType<ParamSpec, unknown>
}

export const FreqParam = makeParam(Pitch, "exponential")
export const ValueParam = makeParam(PlainValue, "linear")

const staticParam = (value: number): ParamSpec => ({ kind: "static", value })

/* -------------------------------------------------------------------------- */
/*                                  Envelope                                  */
/* -------------------------------------------------------------------------- */

export const ENVELOPE_PRESETS = {
  percussive: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.05, curve: "exponential" },
  pluck: { attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.15, curve: "exponential" },
  pad: { attack: 0.6, decay: 0.4, sustain: 0.8, release: 1.2, curve: "linear" },
  organ: { attack: 0.01, decay: 0.05, sustain: 0.9, release: 0.08, curve: "linear" },
  swell: { attack: 1.2, decay: 0.2, sustain: 0.9, release: 0.6, curve: "linear" },
  click: { attack: 0.0005, decay: 0.02, sustain: 0, release: 0.01, curve: "exponential" },
  sustain: { attack: 0.01, decay: 0.05, sustain: 1, release: 0.1, curve: "linear" },
} as const

export const Envelope = z.preprocess(
  (v) => {
    if (typeof v === "string") {
      const preset = ENVELOPE_PRESETS[squash(v) as keyof typeof ENVELOPE_PRESETS]
      return preset ?? v
    }
    return keyAliases({ a: "attack", d: "decay", s: "sustain", r: "release", shape: "curve" })(v)
  },
  z.strictObject(
    {
      attack: num(0.005, 0, 30),
      decay: num(0.1, 0, 30),
      sustain: num(0.7, 0, 1),
      release: num(0.2, 0, 30),
      curve: Curve.default("exponential"),
    },
    {
      error: (iss) =>
        iss.code === "invalid_type"
          ? `Use { "attack", "decay", "sustain", "release" } ou um preset: ${Object.keys(ENVELOPE_PRESETS).join(", ")}`
          : undefined,
    },
  ),
)
export type Envelope = z.output<typeof Envelope>

/* -------------------------------------------------------------------------- */
/*                                   Filtro                                   */
/* -------------------------------------------------------------------------- */

export const FILTER_TYPES = [
  "lowpass",
  "highpass",
  "bandpass",
  "notch",
  "peaking",
  "lowshelf",
  "highshelf",
  "allpass",
] as const

const FilterType = aliasEnum(
  FILTER_TYPES,
  {
    lp: "lowpass",
    lpf: "lowpass",
    low: "lowpass",
    passabaixa: "lowpass",
    hp: "highpass",
    hpf: "highpass",
    high: "highpass",
    passaalta: "highpass",
    bp: "bandpass",
    bpf: "bandpass",
    band: "bandpass",
    passabanda: "bandpass",
    peak: "peaking",
    bell: "peaking",
    ls: "lowshelf",
    hs: "highshelf",
    ap: "allpass",
    bandreject: "notch",
    bandstop: "notch",
  },
  "Tipo de filtro",
)

const filterFields = {
  frequency: FreqParam.default(staticParam(1000)),
  Q: num(0.7, 0.0001, 40),
  gain: num(0, -40, 40),
}
const filterShape = { type: FilterType.default("lowpass"), ...filterFields }
const filterAliases = {
  freq: "frequency",
  cutoff: "frequency",
  q: "Q",
  resonance: "Q",
  res: "Q",
  filterType: "type",
  mode: "type",
}

export const Filter = z.preprocess(
  (v) => (typeof v === "string" ? { type: v } : keyAliases(filterAliases)(v)),
  z.strictObject(filterShape),
)
export type Filter = z.output<typeof Filter>

const FilterList = z.preprocess(asArray, z.array(Filter).max(8, "Máximo de 8 filtros"))

/* -------------------------------------------------------------------------- */
/*                                     LFO                                    */
/* -------------------------------------------------------------------------- */

export const LFO_TARGETS = ["pitch", "gain", "pan", "filter"] as const
const LfoTarget = aliasEnum(
  LFO_TARGETS,
  {
    vibrato: "pitch",
    frequency: "pitch",
    freq: "pitch",
    detune: "pitch",
    tremolo: "gain",
    volume: "gain",
    amplitude: "gain",
    amp: "gain",
    autopan: "pan",
    cutoff: "filter",
    wah: "filter",
    filterfrequency: "filter",
  },
  "Alvo do LFO",
)

export const Lfo = z.preprocess(
  (v) => {
    const o = keyAliases({
      frequency: "rate",
      freq: "rate",
      speed: "rate",
      hz: "rate",
      amount: "depth",
      intensity: "depth",
      wave: "waveform",
      shape: "waveform",
      destination: "target",
      param: "target",
    })(v) as Record<string, unknown>
    if (o && typeof o === "object" && "type" in o) {
      const { type, ...rest } = o
      const isWave = typeof type === "string" && Waveform.safeParse(type).success
      if (isWave && !("waveform" in rest)) return { ...rest, waveform: type }
      if (!isWave && !("target" in rest)) return { ...rest, target: type }
    }
    return o
  },
  z.strictObject({
    target: LfoTarget.default("pitch"),
    rate: num(5, 0.01, 200),
    depth: optNum(0, 20_000),
    waveform: Waveform.default("sine"),
    delay: num(0, 0, 30),
    fadeIn: num(0, 0, 30),
  }),
)
export type Lfo = z.output<typeof Lfo>

const LfoList = z.preprocess(asArray, z.array(Lfo).max(6, "Máximo de 6 LFOs"))

/* -------------------------------------------------------------------------- */
/*                                   Efeitos                                  */
/* -------------------------------------------------------------------------- */

export const EFFECT_TYPES = [
  "reverb",
  "delay",
  "distortion",
  "bitcrush",
  "chorus",
  "phaser",
  "tremolo",
  "filter",
  "compressor",
  "eq",
] as const
export type EffectType = (typeof EFFECT_TYPES)[number]

const EFFECT_ALIASES: Record<string, EffectType> = {
  verb: "reverb",
  room: "reverb",
  hall: "reverb",
  reverberacao: "reverb",
  reverberação: "reverb",
  echo: "delay",
  eco: "delay",
  pingpong: "delay",
  drive: "distortion",
  overdrive: "distortion",
  fuzz: "distortion",
  saturation: "distortion",
  saturacao: "distortion",
  distorcao: "distortion",
  distorção: "distortion",
  waveshaper: "distortion",
  bitcrusher: "bitcrush",
  crusher: "bitcrush",
  lofi: "bitcrush",
  flanger: "chorus",
  ensemble: "chorus",
  comp: "compressor",
  compression: "compressor",
  limiter: "compressor",
  equalizer: "eq",
  equalizador: "eq",
  eq3: "eq",
  autopan: "tremolo",
  lowpass: "filter",
  highpass: "filter",
  bandpass: "filter",
}

const mix = (def: number) => num(def, 0, 1)

const EffectSchemas = [
  z.strictObject({
    type: z.literal("reverb"),
    decay: num(1.5, 0.05, 12),
    preDelay: num(0.01, 0, 0.5),
    mix: mix(0.3),
    tone: num(0.5, 0, 1),
  }),
  z.strictObject({
    type: z.literal("delay"),
    time: num(0.25, 0.005, 2),
    feedback: num(0.35, 0, 0.95),
    mix: mix(0.3),
    pingPong: bool(false),
    tone: num(5000, 200, 20000),
  }),
  z.strictObject({
    type: z.literal("distortion"),
    amount: num(0.4, 0, 1),
    mix: mix(1),
    tone: num(0.7, 0, 1),
  }),
  z.strictObject({
    type: z.literal("bitcrush"),
    bits: num(6, 1, 16),
    mix: mix(1),
  }),
  z.strictObject({
    type: z.literal("chorus"),
    rate: num(1.2, 0.01, 20),
    depth: num(0.5, 0, 1),
    mix: mix(0.5),
  }),
  z.strictObject({
    type: z.literal("phaser"),
    rate: num(0.5, 0.01, 20),
    depth: num(0.7, 0, 1),
    stages: num(4, 2, 12),
    feedback: num(0.5, 0, 0.9),
    frequency: num(1000, 50, 10000),
    mix: mix(0.5),
  }),
  z.strictObject({
    type: z.literal("tremolo"),
    rate: num(6, 0.01, 50),
    depth: num(0.5, 0, 1),
    waveform: Waveform.default("sine"),
    stereo: bool(false),
  }),
  z.strictObject({ type: z.literal("filter"), filterType: FilterType.default("lowpass"), ...filterFields }),
  z.strictObject({
    type: z.literal("compressor"),
    threshold: num(-18, -100, 0),
    ratio: num(4, 1, 20),
    attack: num(0.005, 0, 1),
    release: num(0.15, 0, 1),
    knee: num(6, 0, 40),
    makeup: num(0, -24, 24),
  }),
  z.strictObject({
    type: z.literal("eq"),
    low: num(0, -24, 24),
    mid: num(0, -24, 24),
    high: num(0, -24, 24),
    lowFreq: num(250, 20, 2000),
    midFreq: num(1000, 100, 8000),
    highFreq: num(4000, 1000, 18000),
  }),
] as const

export const Effect = z.preprocess(
  (v) => {
    if (typeof v === "string") v = { type: v }
    if (!v || typeof v !== "object" || Array.isArray(v)) return v
    const o = keyAliases({ kind: "type", effect: "type", name: "type", wet: "mix", drywet: "mix" })(v) as Record<
      string,
      unknown
    >
    if (typeof o.type !== "string") return o
    const k = squash(o.type)
    const resolved = (EFFECT_TYPES as readonly string[]).includes(k) ? k : EFFECT_ALIASES[k]
    if (!resolved) return o
    const out: Record<string, unknown> = { ...o, type: resolved }
    // "type": "lowpass" como efeito vira filtro passa-baixa
    if (resolved === "filter" && k !== "filter" && !("filterType" in out)) out.filterType = k
    if (resolved === "delay" && k === "pingpong" && !("pingPong" in out)) out.pingPong = true
    if (resolved === "filter") return keyAliases({ ...filterAliases, type: "type", mode: "filterType", filterType: "filterType" })(out)
    if (resolved === "reverb") Object.assign(out, keyAliases({ size: "decay", time: "decay", length: "decay" })(out))
    if (resolved === "delay") Object.assign(out, keyAliases({ delay: "time", repeats: "feedback" })(out))
    if (resolved === "distortion") Object.assign(out, keyAliases({ drive: "amount", gain: "amount" })(out))
    return out
  },
  z.discriminatedUnion("type", EffectSchemas, {
    error: (iss) =>
      iss.code === "invalid_union"
        ? `Efeito desconhecido. Use: ${EFFECT_TYPES.join(", ")}`
        : iss.code === "invalid_type"
          ? `Cada efeito deve ser um objeto com "type" (${EFFECT_TYPES.join(", ")})`
          : undefined,
  }),
)
export type Effect = z.output<typeof Effect>

const EffectList = z.preprocess(asArray, z.array(Effect).max(12, "Máximo de 12 efeitos por cadeia"))

/* -------------------------------------------------------------------------- */
/*                               Peças de camadas                             */
/* -------------------------------------------------------------------------- */

const Unison = z.preprocess(
  (v) => (typeof v === "number" ? { voices: v } : keyAliases({ count: "voices", width: "spread" })(v)),
  z.strictObject({
    voices: num(3, 1, 8),
    detune: num(12, 0, 1200),
    spread: num(0.6, 0, 1),
  }),
)

const Repeat = z.preprocess(
  (v) =>
    typeof v === "number"
      ? { count: v }
      : keyAliases({
          times: "count",
          repeats: "count",
          every: "interval",
          spacing: "interval",
          gap: "interval",
          decay: "gainDecay",
          fade: "gainDecay",
          transpose: "pitchStep",
          semitones: "pitchStep",
        })(v),
  z.strictObject({
    count: num(2, 1, 64),
    interval: optNum(0.001, MAX_DURATION),
    gainDecay: num(1, 0, 2),
    pitchStep: num(0, -24, 24),
  }),
)

const Modulator = z.preprocess(
  keyAliases({ harmonicity: "ratio", depth: "index", amount: "index", modIndex: "index", wave: "waveform" }),
  z.strictObject({
    ratio: num(2, 0.01, 32),
    index: num(3, 0, 100),
    waveform: Waveform.default("sine"),
    envelope: Envelope.optional(),
  }),
)

export const DRUM_KINDS = ["kick", "snare", "hihat", "openhat", "clap", "tom", "rim", "cowbell", "crash"] as const
export type DrumKind = (typeof DRUM_KINDS)[number]
export const DrumKind = aliasEnum(
  DRUM_KINDS,
  {
    bd: "kick",
    bassdrum: "kick",
    bumbo: "kick",
    sd: "snare",
    caixa: "snare",
    hh: "hihat",
    hat: "hihat",
    closedhat: "hihat",
    closedhihat: "hihat",
    chh: "hihat",
    oh: "openhat",
    openhihat: "openhat",
    ohh: "openhat",
    cp: "clap",
    handclap: "clap",
    palma: "clap",
    rimshot: "rim",
    sidestick: "rim",
    cb: "cowbell",
    cymbal: "crash",
    prato: "crash",
    ride: "crash",
  },
  "Tipo de bateria",
)

export const NOISE_COLORS = ["white", "pink", "brown"] as const
const NoiseColor = aliasEnum(
  NOISE_COLORS,
  { branco: "white", rosa: "pink", marrom: "brown", red: "brown", brownian: "brown" },
  "Cor de ruído",
)

const PanParam = makeParam(PlainValue, "linear")

const LAYER_KEY_ALIASES = {
  offset: "start",
  at: "start",
  startTime: "start",
  delay: "start",
  time: "start",
  length: "duration",
  dur: "duration",
  volume: "gain",
  amplitude: "gain",
  level: "gain",
  fx: "effects",
  effect: "effects",
  filters: "filter",
  lfos: "lfo",
  env: "envelope",
  adsr: "envelope",
  amp: "envelope",
  freq: "frequency",
  pitch: "frequency",
  note: "frequency",
  wave: "waveform",
  shape: "waveform",
  oscillator: "waveform",
  osc: "waveform",
  loop: "repeat",
  repeats: "repeat",
  mod: "modulator",
  fm: "modulator",
  noise: "color",
  noiseType: "color",
  drum: "kind",
  instrument: "voice",
  synth: "voice",
  pattern: "notes",
  steps: "notes",
  events: "notes",
  muted: "mute",
  label: "name",
  title: "name",
}

const common = {
  name: z.string().max(80).optional(),
  start: num(0, 0, MAX_DURATION),
  gain: num(0.5, 0, 2),
  pan: PanParam.optional(),
  mute: bool(false),
  filter: FilterList.optional(),
  lfo: LfoList.optional(),
  effects: EffectList.optional(),
  repeat: Repeat.optional(),
}

const toneFields = {
  waveform: Waveform.default("sine"),
  frequency: FreqParam.default(staticParam(440)),
  detune: num(0, -4800, 4800),
  unison: Unison.optional(),
  harmonics: z.array(num(0, 0, 1)).max(64, "Máximo de 64 harmônicos").optional(),
  envelope: Envelope.optional(),
}
const noiseFields = { color: NoiseColor.default("white"), envelope: Envelope.optional() }
const fmFields = {
  waveform: Waveform.default("sine"),
  frequency: FreqParam.default(staticParam(440)),
  detune: num(0, -4800, 4800),
  modulator: Modulator.default({ ratio: 2, index: 3, waveform: "sine" }),
  envelope: Envelope.optional(),
}
const pluckFields = {
  frequency: FreqParam.default(staticParam(220)),
  damping: num(0.4, 0, 1),
  brightness: num(0.7, 0, 1),
  envelope: Envelope.optional(),
}
const drumFields = {
  kind: DrumKind.default("kick"),
  pitch: optNum(20, 12000),
  decay: optNum(0.005, 10),
  tone: num(0.5, 0, 1),
}

export const LAYER_TYPES = ["tone", "noise", "fm", "pluck", "drum", "sequence"] as const
export type LayerType = (typeof LAYER_TYPES)[number]

const LAYER_TYPE_ALIASES: Record<string, LayerType> = {
  oscillator: "tone",
  osc: "tone",
  synth: "tone",
  sine: "tone",
  square: "tone",
  sawtooth: "tone",
  saw: "tone",
  triangle: "tone",
  wave: "tone",
  beep: "tone",
  ruido: "noise",
  ruído: "noise",
  whitenoise: "noise",
  pinknoise: "noise",
  brownnoise: "noise",
  fmsynth: "fm",
  bell: "fm",
  sino: "fm",
  string: "pluck",
  karplus: "pluck",
  karplusstrong: "pluck",
  guitar: "pluck",
  corda: "pluck",
  percussion: "drum",
  percussao: "drum",
  percussão: "drum",
  drums: "drum",
  bateria: "drum",
  kick: "drum",
  snare: "drum",
  hihat: "drum",
  clap: "drum",
  seq: "sequence",
  sequencer: "sequence",
  melody: "sequence",
  melodia: "sequence",
  pattern: "sequence",
  arpeggio: "sequence",
  notes: "sequence",
  sequencia: "sequence",
  sequência: "sequence",
}

function normalizeType(v: unknown, fallback: LayerType) {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v
  const o = keyAliases(LAYER_KEY_ALIASES)(v) as Record<string, unknown>
  const t = typeof o.type === "string" ? squash(o.type) : undefined
  let type: string | undefined = t
  if (t && !(LAYER_TYPES as readonly string[]).includes(t)) type = LAYER_TYPE_ALIASES[t] ?? (o.type as string)
  if (!t)
    type =
      "notes" in o
        ? "sequence"
        : "kind" in o
          ? "drum"
          : "color" in o
            ? "noise"
            : "modulator" in o
              ? "fm"
              : "damping" in o
                ? "pluck"
                : fallback
  const out: Record<string, unknown> = { ...o, type }
  // Em bateria, "pitch" é um campo próprio (afinação), não um apelido de "frequency".
  if (type === "drum" && "frequency" in out && !("pitch" in out) && "pitch" in (v as object)) {
    out.pitch = out.frequency
    delete out.frequency
  }
  // "type": "square" vira tone com waveform square
  if (type === "tone" && t && (WAVEFORMS as readonly string[]).includes(t) && !("waveform" in out)) out.waveform = t
  if (type === "tone" && t === "saw" && !("waveform" in out)) out.waveform = "sawtooth"
  if (type === "noise" && t && /^(white|pink|brown)noise$/.test(t) && !("color" in out)) out.color = t.replace("noise", "")
  if (type === "drum" && t && DrumKind.safeParse(t).success && !("kind" in out)) out.kind = t
  return out
}

/* ------------------------------ Voz da sequência ------------------------- */

const voiceCommon = {
  gain: num(1, 0, 2),
  filter: FilterList.optional(),
  lfo: LfoList.optional(),
}

const VoiceSchema = z.preprocess(
  (v) => normalizeType(v ?? {}, "tone"),
  z.discriminatedUnion(
    "type",
    [
      z.strictObject({ type: z.literal("tone"), ...voiceCommon, ...omit(toneFields, "frequency") }),
      z.strictObject({ type: z.literal("noise"), ...voiceCommon, ...noiseFields }),
      z.strictObject({ type: z.literal("fm"), ...voiceCommon, ...omit(fmFields, "frequency") }),
      z.strictObject({ type: z.literal("pluck"), ...voiceCommon, ...omit(pluckFields, "frequency") }),
      z.strictObject({ type: z.literal("drum"), ...voiceCommon, ...omit(drumFields, "kind", "pitch") }),
    ],
    {
      error: (iss) =>
        iss.code === "invalid_union" ? 'Tipo de voz inválido. Use: tone, fm, pluck, drum ou noise' : undefined,
    },
  ),
)
export type Voice = z.output<typeof VoiceSchema>

function omit<T extends Record<string, unknown>, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> {
  const out = { ...obj }
  for (const k of keys) delete out[k]
  return out
}

const NoteValue = z.union([z.number(), z.string()])

const NoteSchema = z.preprocess(
  (v) => {
    if (typeof v === "string" || typeof v === "number") return { note: v }
    return keyAliases({
      pitch: "note",
      notes: "note",
      chord: "note",
      freq: "note",
      frequency: "note",
      start: "time",
      at: "time",
      t: "time",
      beat: "time",
      length: "duration",
      dur: "duration",
      vel: "velocity",
      gain: "velocity",
      volume: "velocity",
      drum: "kind",
      type: "kind",
    })(v)
  },
  z.strictObject({
    note: z.union([NoteValue, z.array(NoteValue).max(8, "Máximo de 8 notas por acorde")]).optional(),
    time: num(0, 0, 10_000),
    duration: optNum(0.001, 10_000),
    velocity: num(0.8, 0, 1),
    kind: z.string().optional(),
  }),
)

export type ResolvedNote = {
  time: number
  duration?: number
  velocity: number
  pitches: number[]
  kind?: DrumKind
}

const VOICE_KEYS = [
  "waveform",
  "envelope",
  "unison",
  "modulator",
  "damping",
  "brightness",
  "harmonics",
  "color",
  "detune",
  "kind",
  "tone",
  "decay",
]

const SequenceSchema = z
  .strictObject({
    type: z.literal("sequence"),
    ...common,
    bpm: optNum(20, 400),
    voice: VoiceSchema.default({ type: "tone", gain: 1, waveform: "sine", detune: 0 }),
    notes: z.array(NoteSchema).min(1, "A sequência precisa de pelo menos uma nota").max(1024),
  })
  .transform((seq, ctx) => {
    const resolved: ResolvedNote[] = []
    seq.notes.forEach((n, i) => {
      const r: ResolvedNote = { time: n.time, duration: n.duration, velocity: n.velocity, pitches: [] }
      if (seq.voice.type === "drum") {
        const raw = n.kind ?? (typeof n.note === "string" ? n.note : undefined)
        const kind = DrumKind.safeParse(raw ?? "kick")
        if (!kind.success) {
          ctx.issues.push({
            code: "custom",
            message: `Peça de bateria inválida: ${JSON.stringify(raw)}. Use: ${DRUM_KINDS.join(", ")}`,
            path: ["notes", i, n.kind !== undefined ? "kind" : "note"],
            input: raw,
          })
          return
        }
        r.kind = kind.data
        if (typeof n.note === "number") r.pitches = [n.note]
      } else {
        const list = n.note === undefined ? [] : Array.isArray(n.note) ? n.note : [n.note]
        if (list.length === 0) {
          ctx.issues.push({
            code: "custom",
            message: 'Informe "note" (ex.: "C5" ou 523.25) ou um acorde: ["C4","E4","G4"]',
            path: ["notes", i],
            input: n,
          })
          return
        }
        for (const [j, p] of list.entries()) {
          const parsed = Pitch.safeParse(p)
          if (!parsed.success) {
            ctx.issues.push({
              code: "custom",
              message: parsed.error.issues[0]?.message ?? "Nota inválida",
              path: ["notes", i, "note", ...(Array.isArray(n.note) ? [j] : [])],
              input: p,
            })
            return
          }
          r.pitches.push(parsed.data)
        }
      }
      resolved.push(r)
    })
    return { ...seq, notes: resolved }
  })

const LayerSchema = z.preprocess(
  (v) => {
    const o = normalizeType(v, "tone") as Record<string, unknown>
    if (o && typeof o === "object" && o.type === "sequence" && !("voice" in o)) {
      // A IA às vezes coloca os parâmetros da voz direto na camada: movemos para "voice".
      const voice: Record<string, unknown> = {}
      for (const k of VOICE_KEYS) {
        if (k in o) {
          voice[k] = o[k]
          delete o[k]
        }
      }
      if ("kind" in voice) voice.type = "drum"
      if ("voiceType" in o) {
        voice.type = o.voiceType
        delete o.voiceType
      }
      if (Object.keys(voice).length) o.voice = voice
    }
    if (o && typeof o === "object" && o.type === "sequence" && typeof o.voice === "string") {
      o.voice = { type: o.voice }
    }
    return o
  },
  z.discriminatedUnion(
    "type",
    [
      z.strictObject({ type: z.literal("tone"), ...common, duration: num(1, 0.001, MAX_DURATION), ...toneFields }),
      z.strictObject({ type: z.literal("noise"), ...common, duration: num(1, 0.001, MAX_DURATION), ...noiseFields }),
      z.strictObject({ type: z.literal("fm"), ...common, duration: num(1, 0.001, MAX_DURATION), ...fmFields }),
      z.strictObject({ type: z.literal("pluck"), ...common, duration: num(1.5, 0.001, MAX_DURATION), ...pluckFields }),
      z.strictObject({ type: z.literal("drum"), ...common, duration: optNum(0.005, MAX_DURATION), ...drumFields }),
      SequenceSchema,
    ],
    {
      error: (iss) =>
        iss.code === "invalid_union"
          ? `Tipo de camada desconhecido. Use: ${LAYER_TYPES.join(", ")}`
          : iss.code === "invalid_type"
            ? 'Cada camada deve ser um objeto com "type"'
            : undefined,
    },
  ),
)
export type Layer = z.output<typeof LayerSchema>
export type SequenceLayer = Extract<Layer, { type: "sequence" }>

/* -------------------------------------------------------------------------- */
/*                                   Receita                                  */
/* -------------------------------------------------------------------------- */

const Master = z.preprocess(
  keyAliases({ volume: "gain", fx: "effects", effect: "effects", normalise: "normalize", fade: "fadeOut" }),
  z.strictObject({
    gain: num(1, 0, 4),
    normalize: bool(true),
    normalizeTo: num(-1, -30, 0),
    fadeIn: num(0, 0, 30),
    fadeOut: num(0.01, 0, 30),
    effects: EffectList.optional(),
  }),
)

export const RecipeSchema = z.preprocess(
  keyAliases({
    title: "name",
    nome: "name",
    tracks: "layers",
    sounds: "layers",
    voices: "layers",
    camadas: "layers",
    length: "duration",
    tempo: "bpm",
    rate: "sampleRate",
    sample_rate: "sampleRate",
    samplerate: "sampleRate",
    output: "master",
    mix: "master",
  }),
  z.strictObject({
    $schema: z.string().optional(),
    version: z.union([z.number(), z.string()]).optional(),
    name: z.string().max(120).default("Som sem nome"),
    description: z.string().max(4000).optional(),
    tags: z.array(z.string().max(40)).max(16).optional(),
    category: z.string().max(60).optional(),
    sampleRate: z
      .preprocess(toNumber, z.number({ error: "Esperava um número (ex.: 44100)" }))
      .transform((v) => SAMPLE_RATES.reduce((best, sr) => (Math.abs(sr - v) < Math.abs(best - v) ? sr : best), 44100))
      .default(44100),
    channels: z
      .preprocess(
        (v) => (v === "mono" ? 1 : v === "stereo" || v === "estéreo" || v === "estereo" ? 2 : toNumber(v)),
        z.number().transform((v) => (v <= 1 ? 1 : 2)),
      )
      .default(2),
    duration: optNum(0.05, MAX_DURATION),
    seed: num(1, 0, 2 ** 31).transform((v) => Math.floor(v)),
    bpm: optNum(20, 400),
    master: Master.default({ gain: 1, normalize: true, normalizeTo: -1, fadeIn: 0, fadeOut: 0.01 }),
    layers: z
      .array(LayerSchema, { error: 'Esperava uma lista de camadas em "layers"' })
      .min(1, 'A receita precisa de pelo menos uma camada em "layers"')
      .max(MAX_LAYERS, `Máximo de ${MAX_LAYERS} camadas`),
  }),
)

export type Recipe = z.output<typeof RecipeSchema>
export type RecipeInput = z.input<typeof RecipeSchema>
