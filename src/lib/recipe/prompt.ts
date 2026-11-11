/**
 * Prompt copiável que ensina qualquer IA (Copilot, ChatGPT, Gemini…) a
 * escrever receitas no formato do Sonora. Há duas versões: completa (com
 * dicas e exemplo) e compacta (para chats com limite de caracteres).
 */

export type PromptMode = "full" | "compact"

export type PromptOptions = {
  description?: string
  variations?: number
  extra?: string
  mode?: PromptMode
  maxDuration?: number
}

const SCHEMA = `## Estrutura da receita
{
  "name": "Nome curto em português",
  "description": "Uma frase sobre o som",
  "tags": ["uso", "estilo"],
  "bpm": 120,            // opcional: tempo padrão das sequências
  "duration": 2,         // opcional: se omitido, é calculado (inclui caudas de reverb/delay)
  "seed": 1,             // opcional: muda a aleatoriedade dos ruídos
  "master": { "gain": 1, "normalize": true, "fadeIn": 0, "fadeOut": 0.01, "effects": [] },
  "layers": [ ... ]      // obrigatório: 1 a 48 camadas que tocam ao mesmo tempo
}
- Opcionais na raiz: "transpose" (semitons somados a todas as notas; não afeta bateria nem ruído) e "speed" (multiplicador de andamento: 2 = duas vezes mais rápido, mesma afinação).

## Campos comuns de toda camada
- "type": "tone" | "noise" | "fm" | "pluck" | "drum" | "sequence"
- "name": rótulo curto
- "start": quando começa (s, padrão 0)
- "duration": duração TOTAL da camada, já incluindo o release (s)
- "gain": volume relativo 0–2 (padrão 0.5). O master normaliza o volume final.
- "pan": -1 (esquerda) a 1 (direita); aceita automação
- "envelope": { "attack", "decay", "sustain" (0–1), "release", "curve": "exponential"|"linear" } ou um preset: "percussive", "pluck", "pad", "organ", "swell", "click", "sustain"
- "filter": objeto ou lista de { "type": "lowpass"|"highpass"|"bandpass"|"notch"|"peaking"|"lowshelf"|"highshelf"|"allpass", "frequency", "Q", "gain" (dB, só peaking/shelf) }
- "lfo": objeto ou lista de { "target": "pitch" (profundidade em cents) | "gain" (0–1) | "pan" (0–1) | "filter" (Hz), "rate" (Hz), "depth", "waveform", "delay", "fadeIn" }
- "effects": lista de efeitos só desta camada
- "repeat": { "count": total de execuções, "interval": s entre elas, "gainDecay": multiplicador por repetição (ex.: 0.7), "pitchStep": semitons por repetição }

## Tipos de camada
- "tone": oscilador. "waveform": "sine"|"square"|"sawtooth"|"triangle"; "frequency"; "detune" (cents); "unison": { "voices" 1–8, "detune" cents, "spread" 0–1 }; "harmonics": [1, 0.5, 0.25…] (timbre aditivo, substitui waveform)
- "noise": ruído. "color": "white"|"pink"|"brown"
- "fm": síntese FM (sinos, metais, elétrico). "frequency", "waveform", "modulator": { "ratio" (2 = harmônico, 3.5 = sino), "index" (0–100, brilho), "envelope" (envelope do brilho) }
- "pluck": corda dedilhada (Karplus-Strong). "frequency" (fixa), "damping" 0–1 (1 = abafada/curta), "brightness" 0–1
- "drum": bateria sintetizada. "kind": "kick"|"snare"|"hihat"|"openhat"|"clap"|"tom"|"rim"|"cowbell"|"crash"; "pitch" (Hz, opcional), "decay" (s), "tone" 0–1
- "sequence": várias notas com o mesmo timbre. "voice": { "type": "tone"|"fm"|"pluck"|"drum"|"noise", + campos do tipo, "envelope", "filter", "lfo" }; "bpm" (se houver bpm aqui ou na receita, "time" e "duration" das notas ficam em BATIDAS; senão, em segundos); "notes": [{ "note": "C5" ou 523 ou acorde ["C4","E4","G4"], "time", "duration", "velocity" 0–1 }]. Com voice "drum", use "note": "kick", "snare", "hihat"… Em sequence, "filter"/"lfo" fora da voice valem para a sequência inteira; "repeat" sem "interval" repete o padrão em loop.

## Automação (frequency, filter.frequency e pan)
- Fixo: 440 ou "A4"
- Rampa: { "from": 2000, "to": 100, "curve": "exponential", "time": 0.3, "delay": 0 } (time padrão = duração da camada)
- Pontos: { "points": [[0, 300], [0.5, 5000], [1.2, 400]], "curve": "exponential" }, onde cada ponto é [tempo relativo ao início da camada, valor]

## Efeitos (em "effects" da camada ou do "master")
- { "type": "reverb", "decay": 0.05–12 s, "preDelay", "mix" 0–1, "tone" 0–1 (escuro→brilhante) }
- { "type": "delay", "time" s, "feedback" 0–0.95, "mix", "pingPong": true|false, "tone" (Hz do filtro do eco) }
- { "type": "distortion", "amount" 0–1, "mix", "tone" 0–1 }
- { "type": "bitcrush", "bits" 1–16, "mix" }
- { "type": "chorus", "rate", "depth" 0–1, "mix" }
- { "type": "phaser", "rate", "depth", "stages" 2–12, "feedback", "frequency", "mix" }
- { "type": "tremolo", "rate", "depth" 0–1, "waveform", "stereo": true (vira auto-pan) }
- { "type": "filter", "filterType": "lowpass"…, "frequency" (aceita automação), "Q" }
- { "type": "compressor", "threshold" dB, "ratio", "attack", "release", "knee", "makeup" dB }
- { "type": "eq", "low", "mid", "high" (dB ±24), "lowFreq", "midFreq", "highFreq" }`

const TIPS = `## Como criar um som bonito
- Pense em camadas: transiente (ruído/clique curto) + corpo (tone/fm) + brilho (harmônico agudo baixo) + espaço (reverb/delay no master).
- Sons de interface: 40–400 ms; notificações: 0.3–1.5 s. Use sine/triangle/fm suaves, evite volume alto entre 2–5 kHz.
- Positivo/sucesso: intervalos maiores ascendentes (terça, quinta, oitava). Erro/negativo: descendente, grave, segunda menor, onda quadrada filtrada.
- Retrô/8-bit: square/triangle, envelopes "organ", bitcrush, repeat com pitchStep.
- Sci-fi: rampas de frequência exponenciais, FM com index alto, delay pingPong, phaser.
- Evite cliques: attack ≥ 0.002 s. Para timbres ricos: unison 2–4 vozes com 8–20 cents.
- Musical: escolha uma tonalidade, use bpm e sequências; mantenha os acordes nas oitavas 3–4 e o baixo nas 1–2.
- Os volumes são relativos entre camadas: o master normaliza o pico em -1 dBFS.`

const EXAMPLE = `## Exemplo de resposta
\`\`\`json
{
  "name": "Notificação de mensagem",
  "description": "Dois toques de sino suaves e ascendentes",
  "tags": ["notificação", "ui"],
  "layers": [
    { "name": "Sino 1", "type": "fm", "frequency": "E6", "duration": 0.9, "gain": 0.5,
      "modulator": { "ratio": 3.5, "index": 1.6 },
      "envelope": { "attack": 0.002, "decay": 0.5, "sustain": 0.05, "release": 0.4 } },
    { "name": "Sino 2", "type": "fm", "frequency": "B6", "start": 0.12, "duration": 1.1, "gain": 0.42,
      "modulator": { "ratio": 3.5, "index": 1.3 },
      "envelope": { "attack": 0.002, "decay": 0.6, "sustain": 0.05, "release": 0.5 } },
    { "name": "Clique", "type": "noise", "duration": 0.015, "gain": 0.2, "envelope": "click",
      "filter": { "type": "highpass", "frequency": 3000 } }
  ],
  "master": { "effects": [ { "type": "reverb", "decay": 1.8, "mix": 0.28, "tone": 0.7 } ] }
}
\`\`\``

const SEQ_EXAMPLE = `Exemplo de sequência (bateria em batidas):
{ "type": "sequence", "bpm": 90, "voice": { "type": "drum" }, "repeat": { "count": 2 },
  "notes": [ { "note": "kick", "time": 0 }, { "note": "hihat", "time": 0.5, "velocity": 0.5 }, { "note": "snare", "time": 1 } ] }`

export function buildPrompt(opts: PromptOptions = {}): string {
  const mode = opts.mode ?? "full"
  const variations = Math.max(1, Math.min(6, Math.round(opts.variations ?? 1)))
  const maxDuration = opts.maxDuration ?? 60

  const intro = `Você é um designer de som especialista em síntese. Crie uma RECEITA em JSON para o app "Sonora", que sintetiza o áudio localmente (Web Audio, sem samples e sem internet). Siga exatamente o formato abaixo.`

  const output =
    variations > 1
      ? `## Formato da resposta
- Responda SOMENTE com um array JSON contendo ${variations} receitas diferentes (variações do mesmo pedido: timbre, ritmo ou intensidade distintos), dentro de um único bloco \`\`\`json. Sem texto antes ou depois.`
      : `## Formato da resposta
- Responda SOMENTE com o JSON da receita, dentro de um único bloco \`\`\`json. Sem texto antes ou depois.`

  const rules = `- JSON válido: aspas duplas, sem comentários, sem vírgula sobrando.${mode === "full" ? ' Os comentários "//" abaixo são só explicação.' : ""}
- Tempos em segundos. Frequências em Hz ou nota ("A4" = 440 Hz, "C#5", "Eb3").
- Limites: duração total até ${maxDuration} s, até 48 camadas, até 1024 notas por sequência.
- Use só os campos documentados. Campos omitidos usam valores padrão.`

  const extra = opts.extra?.trim() ? `\n## Instruções adicionais\n${opts.extra.trim()}\n` : ""

  const request = opts.description?.trim()
    ? `## Pedido\n${opts.description.trim()}`
    : `## Pedido\nAinda vou descrever o som. Por enquanto, responda apenas "Pronto, descreva o som." e aguarde minha próxima mensagem. A partir dela, responda sempre só com o JSON.`

  const parts =
    mode === "full"
      ? [intro, output, rules, SCHEMA, TIPS, SEQ_EXAMPLE, EXAMPLE, extra, request]
      : [intro, output, rules, compact(SCHEMA), SEQ_EXAMPLE, extra, request]

  return parts.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n"
}

const FORMAT_RULES = `- JSON válido: aspas duplas, sem comentários, sem vírgula sobrando.
- Tempos em segundos. Frequências em Hz ou nota ("A4" = 440 Hz, "C#5", "Eb3").
- Use só os campos documentados. Campos omitidos usam valores padrão.`

function formatReference() {
  return `## Formato das receitas do Sonora\n${FORMAT_RULES}\n\n${compact(SCHEMA)}`
}

function minify(json: string) {
  try {
    return JSON.stringify(JSON.parse(json))
  } catch {
    return json.trim()
  }
}

export type RefineOptions = {
  /** receita atual (JSON) */
  json: string
  /** o que o usuário quer mudar, em linguagem natural */
  change: string
  variations?: number
  /** inclui a referência do formato (desligue se a IA já recebeu o prompt nesta conversa) */
  includeFormat?: boolean
  extra?: string
}

/** Pedido para a IA alterar uma receita existente. */
export function buildRefinePrompt(opts: RefineOptions): string {
  const variations = Math.max(1, Math.min(6, Math.round(opts.variations ?? 1)))
  const change = opts.change.trim() || "Crie uma variação: mantenha a essência, mas mude o timbre e o ritmo."
  const output =
    variations > 1
      ? `Responda SOMENTE com um array JSON contendo ${variations} versões diferentes da receita alterada, dentro de um único bloco \`\`\`json. Sem texto antes ou depois.`
      : `Responda SOMENTE com o JSON completo da receita alterada (não só o trecho que mudou), dentro de um único bloco \`\`\`json. Sem texto antes ou depois.`
  const parts = [
    `Você é um designer de som especialista em síntese. Abaixo está uma RECEITA em JSON do app "Sonora", que sintetiza o áudio localmente. Altere a receita conforme o pedido, mantendo o que não foi pedido para mudar.`,
    output,
    opts.includeFormat === false ? "" : formatReference(),
    opts.extra?.trim() ? `## Instruções adicionais\n${opts.extra.trim()}` : "",
    `## Receita atual\n\`\`\`json\n${minify(opts.json)}\n\`\`\``,
    `## Alteração pedida\n${change}`,
  ]
  return parts.filter(Boolean).join("\n\n").trim() + "\n"
}

export type FixOptions = {
  /** texto que está no editor (pode ser JSON inválido) */
  text: string
  errors: { line?: number; path?: string; message: string }[]
  includeFormat?: boolean
}

/** Pedido para a IA corrigir uma receita que não passou na validação. */
export function buildFixPrompt(opts: FixOptions): string {
  const errors = opts.errors
    .slice(0, 30)
    .map((e) => `- ${e.line ? `Linha ${e.line}` : "Receita"}${e.path && e.path !== "(raiz)" ? ` (${e.path})` : ""}: ${e.message}`)
    .join("\n")
  const parts = [
    `A receita em JSON abaixo, do app "Sonora" (que sintetiza áudio localmente), não passou na validação. Corrija os erros listados sem mudar o som além do necessário.`,
    `Responda SOMENTE com o JSON completo e corrigido, dentro de um único bloco \`\`\`json. Sem texto antes ou depois.`,
    `## Erros encontrados\n${errors}`,
    opts.includeFormat === false ? "" : formatReference(),
    `## Receita com erro\n\`\`\`json\n${opts.text.trim()}\n\`\`\``,
  ]
  return parts.filter(Boolean).join("\n\n").trim() + "\n"
}

/** Versão enxuta do esquema para chats com limite de caracteres. */
function compact(text: string) {
  return text
    .split("\n")
    .map((l) => l.replace(/\s+\/\/.*$/, "").replace(/\s{2,}/g, " "))
    .join("\n")
}
