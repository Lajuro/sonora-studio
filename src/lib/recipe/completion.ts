import type { CompletionContext, CompletionResult, Completion } from "@codemirror/autocomplete"
import { getLocation, parse, type Segment } from "jsonc-parser"
import { DRUM_KINDS, EFFECT_TYPES, ENVELOPE_PRESETS, FILTER_TYPES, LAYER_TYPES, LFO_TARGETS, NOISE_COLORS, WAVEFORMS } from "./schema"

/**
 * Autocompletar do editor: sugere nomes de propriedades e valores válidos
 * de acordo com a posição do cursor dentro da receita.
 */

type KeyDoc = [string, string]

const RECIPE_KEYS: KeyDoc[] = [
  ["name", "Nome do som"],
  ["description", "Descrição curta"],
  ["tags", "Lista de etiquetas"],
  ["layers", "Camadas (obrigatório)"],
  ["master", "Saída final: ganho, fades, efeitos"],
  ["duration", "Duração total fixa (s)"],
  ["bpm", "Tempo padrão das sequências"],
  ["seed", "Semente da aleatoriedade"],
  ["transpose", "Semitons somados às notas"],
  ["speed", "Andamento (2 = dobro)"],
  ["sampleRate", "Taxa de amostragem (44100)"],
  ["channels", "1 = mono, 2 = estéreo"],
]
const MASTER_KEYS: KeyDoc[] = [
  ["gain", "Ganho final"],
  ["normalize", "Normalizar o pico (true)"],
  ["normalizeTo", "Pico alvo em dB (-1)"],
  ["fadeIn", "Fade de entrada (s)"],
  ["fadeOut", "Fade de saída (s)"],
  ["effects", "Efeitos no som inteiro"],
]
const COMMON_LAYER: KeyDoc[] = [
  ["type", "tone | noise | fm | pluck | drum | sequence"],
  ["name", "Rótulo da camada"],
  ["start", "Início (s)"],
  ["duration", "Duração total, com release (s)"],
  ["gain", "Volume relativo 0–2"],
  ["pan", "-1 esquerda … 1 direita"],
  ["envelope", "ADSR ou preset"],
  ["filter", "Filtro(s)"],
  ["lfo", "Modulação periódica"],
  ["effects", "Efeitos da camada"],
  ["repeat", "Repetições"],
  ["mute", "Silenciar"],
]
const TYPE_KEYS: Record<string, KeyDoc[]> = {
  tone: [
    ["waveform", "sine | square | sawtooth | triangle"],
    ["frequency", "Hz, nota ou automação"],
    ["detune", "Desafinação (cents)"],
    ["unison", "Vozes desafinadas"],
    ["harmonics", "Timbre aditivo"],
  ],
  noise: [["color", "white | pink | brown"]],
  fm: [
    ["waveform", "Forma da portadora"],
    ["frequency", "Hz, nota ou automação"],
    ["detune", "Desafinação (cents)"],
    ["modulator", "{ ratio, index, envelope }"],
  ],
  pluck: [
    ["frequency", "Nota da corda"],
    ["damping", "0 longa … 1 abafada"],
    ["brightness", "Brilho 0–1"],
  ],
  drum: [
    ["kind", DRUM_KINDS.join(" | ")],
    ["pitch", "Afinação (Hz)"],
    ["decay", "Decaimento (s)"],
    ["tone", "Brilho 0–1"],
  ],
  sequence: [
    ["voice", "Timbre de cada nota"],
    ["notes", "Lista de notas"],
    ["bpm", "Tempo (notas em batidas)"],
  ],
}
const ENVELOPE_KEYS: KeyDoc[] = [
  ["attack", "Ataque (s)"],
  ["decay", "Decaimento (s)"],
  ["sustain", "Nível de sustentação 0–1"],
  ["release", "Liberação (s)"],
  ["curve", "exponential | linear"],
]
const FILTER_KEYS: KeyDoc[] = [
  ["type", FILTER_TYPES.join(" | ")],
  ["frequency", "Corte em Hz (aceita automação)"],
  ["Q", "Ressonância"],
  ["gain", "dB (peaking/shelf)"],
]
const LFO_KEYS: KeyDoc[] = [
  ["target", LFO_TARGETS.join(" | ")],
  ["rate", "Velocidade (Hz)"],
  ["depth", "Profundidade"],
  ["waveform", "Forma do LFO"],
  ["delay", "Atraso para começar (s)"],
  ["fadeIn", "Entrada gradual (s)"],
]
const EFFECT_KEYS: Record<string, KeyDoc[]> = {
  reverb: [["decay", "Cauda (s)"], ["preDelay", "Pré-atraso (s)"], ["mix", "0–1"], ["tone", "Brilho 0–1"]],
  delay: [["time", "Tempo (s)"], ["feedback", "0–0.95"], ["mix", "0–1"], ["pingPong", "Eco estéreo"], ["tone", "Filtro do eco (Hz)"]],
  distortion: [["amount", "0–1"], ["mix", "0–1"], ["tone", "0–1"]],
  bitcrush: [["bits", "1–16"], ["mix", "0–1"]],
  chorus: [["rate", "Hz"], ["depth", "0–1"], ["mix", "0–1"]],
  phaser: [["rate", "Hz"], ["depth", "0–1"], ["stages", "2–12"], ["feedback", "0–0.9"], ["frequency", "Hz"], ["mix", "0–1"]],
  tremolo: [["rate", "Hz"], ["depth", "0–1"], ["waveform", "Forma"], ["stereo", "Auto-pan"]],
  filter: [["filterType", FILTER_TYPES.join(" | ")], ["frequency", "Hz"], ["Q", "Ressonância"], ["gain", "dB"]],
  compressor: [["threshold", "dB"], ["ratio", "1–20"], ["attack", "s"], ["release", "s"], ["knee", "dB"], ["makeup", "dB"]],
  eq: [["low", "dB"], ["mid", "dB"], ["high", "dB"], ["lowFreq", "Hz"], ["midFreq", "Hz"], ["highFreq", "Hz"]],
}
const MISC_KEYS: Record<string, KeyDoc[]> = {
  unison: [["voices", "1–8"], ["detune", "cents"], ["spread", "0–1"]],
  repeat: [["count", "Total de execuções"], ["interval", "Intervalo (s)"], ["gainDecay", "Multiplicador por repetição"], ["pitchStep", "Semitons por repetição"]],
  modulator: [["ratio", "Razão de frequência"], ["index", "Intensidade 0–100"], ["waveform", "Forma"], ["envelope", "Envelope do brilho"]],
  note: [["note", "Nota, Hz ou acorde"], ["time", "Início"], ["duration", "Duração"], ["velocity", "0–1"], ["kind", "Peça de bateria"]],
}

const VALUE_ENUMS: Record<string, readonly string[]> = {
  waveform: WAVEFORMS,
  kind: DRUM_KINDS,
  color: NOISE_COLORS,
  curve: ["exponential", "linear"],
  target: LFO_TARGETS,
  filterType: FILTER_TYPES,
}

function objectContext(path: Segment[], text: string): { keys: KeyDoc[]; typeValues?: readonly string[] } | null {
  const last = path[path.length - 1]
  const parentKey = [...path].reverse().find((p) => typeof p === "string") as string | undefined
  const parentIdx = path.lastIndexOf(parentKey ?? "")
  const inArray = typeof last === "number"

  if (path.length === 0) return { keys: RECIPE_KEYS }
  if (parentKey === "master" && path.length === 1) return { keys: MASTER_KEYS }
  if (parentKey === "envelope") return { keys: ENVELOPE_KEYS }
  if (parentKey === "filter") return { keys: FILTER_KEYS, typeValues: FILTER_TYPES }
  if (parentKey === "lfo") return { keys: LFO_KEYS }
  if (parentKey === "effects" && inArray) {
    const t = typeAt(text, path)
    return { keys: [["type", EFFECT_TYPES.join(" | ")], ...(t && EFFECT_KEYS[t] ? EFFECT_KEYS[t] : [])], typeValues: EFFECT_TYPES }
  }
  if (parentKey === "notes" && inArray) return { keys: MISC_KEYS.note }
  if (parentKey === "voice") {
    const t = typeAt(text, path) ?? "tone"
    return { keys: [["type", "tone | fm | pluck | drum | noise"], ["envelope", "ADSR"], ["filter", "Filtro"], ["lfo", "LFO"], ["gain", "Volume"], ...(TYPE_KEYS[t] ?? []).filter(([k]) => k !== "frequency" && k !== "pitch" && k !== "kind")], typeValues: ["tone", "fm", "pluck", "drum", "noise"] }
  }
  if (parentKey === "layers" && inArray && parentIdx === path.length - 2) {
    const t = typeAt(text, path)
    return { keys: [...COMMON_LAYER, ...(t ? TYPE_KEYS[t] ?? [] : Object.values(TYPE_KEYS).flat())], typeValues: LAYER_TYPES }
  }
  if (parentKey && MISC_KEYS[parentKey]) return { keys: MISC_KEYS[parentKey] }
  return null
}

/** Lê o "type" do objeto em que o cursor está (busca simples no texto do objeto). */
function typeAt(text: string, path: Segment[]): string | undefined {
  // o parser tolerante devolve um resultado parcial mesmo com o JSON incompleto
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = parse(text, [], { allowTrailingComma: true })
  for (const p of path) node = node?.[p as never]
  return typeof node?.type === "string" ? node.type : undefined
}

export function recipeCompletion(context: CompletionContext): CompletionResult | null {
  const text = context.state.doc.toString()
  const pos = context.pos
  const loc = getLocation(text, pos)
  const word = context.matchBefore(/"?[\w$-]*/)
  if (!word) return null
  const from = word.text.startsWith('"') ? word.from + 1 : word.from
  if (!context.explicit && word.text.length === 0) return null

  if (loc.isAtPropertyKey) {
    const objPath = loc.path.slice(0, -1)
    const ctx = objectContext(objPath, text)
    if (!ctx) return null
    const options: Completion[] = ctx.keys.map(([label, detail], i) => ({
      label,
      detail,
      type: "property",
      boost: -i,
      apply: word.text.startsWith('"') ? label : `"${label}"`,
    }))
    return { from, options, validFor: /^[\w$-]*$/ }
  }

  // valores
  const key = loc.path[loc.path.length - 1]
  if (typeof key !== "string") return null
  let values: readonly string[] | undefined
  if (key === "type") values = objectContext(loc.path.slice(0, -1), text)?.typeValues
  else if (key === "envelope") values = Object.keys(ENVELOPE_PRESETS)
  else values = VALUE_ENUMS[key]
  if (!values) return null
  const quoted = word.text.startsWith('"')
  return {
    from,
    options: values.map((v) => ({ label: v, type: "enum", apply: quoted ? v : `"${v}"` })),
    validFor: /^[\w-]*$/,
  }
}
