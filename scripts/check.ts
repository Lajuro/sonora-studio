/**
 * Verificação rápida (sem navegador): todas as receitas de exemplo e o
 * exemplo do prompt passam no validador, e os codificadores geram arquivos
 * com cabeçalhos corretos. Rode com `npm run check`.
 */
import { encodeFlac } from "../src/lib/audio/encoders/flac"
import { encodeAiff, encodeWav } from "../src/lib/audio/encoders/pcm"
import type { HistoryItem } from "../src/lib/history-model"
import { buildLibrary } from "../src/lib/library"
import { EXAMPLES } from "../src/lib/recipe/examples"
import { parseRecipeText } from "../src/lib/recipe/parse"
import { buildFixPrompt, buildPrompt, buildRefinePrompt } from "../src/lib/recipe/prompt"
import { decodeRecipe, encodeRecipe } from "../src/lib/recipe/share"

let failures = 0
const ok = (cond: boolean, label: string) => {
  console.log(`${cond ? "✓" : "✗"} ${label}`)
  if (!cond) failures++
}

for (const ex of EXAMPLES) {
  const r = parseRecipeText(JSON.stringify(ex.recipe))
  ok(r.ok && r.warnings.length === 0, `exemplo "${ex.id}" é válido`)
}

for (const mode of ["full", "compact"] as const) {
  const prompt = buildPrompt({ mode, description: "teste" })
  const sample = prompt.includes("## Exemplo de resposta") ? prompt.slice(prompt.indexOf("## Exemplo de resposta")) : null
  if (sample) ok(parseRecipeText(sample).ok, `exemplo do prompt (${mode}) é válido`)
  ok(prompt.length < 9000, `prompt ${mode} tem ${prompt.length} caracteres`)
}

ok(!parseRecipeText('{"layers":[{"type":"laser"}]}').ok, "tipo de camada inválido é rejeitado")
ok(parseRecipeText('Aqui está:\n```json\n{"layers":[{"type":"tone"}],}\n```').ok, "aceita cercas markdown e vírgula sobrando")

// Ajustes globais: transposição e velocidade
const baseJson = '{"layers":[{"type":"tone","frequency":440,"duration":1,"start":0.5},{"type":"sequence","bpm":120,"notes":[{"note":"A4","time":0},{"note":"A4","time":1}]}]}'
const tweaked = parseRecipeText(baseJson.replace("{", '{"transpose":12,"speed":2,'))
if (tweaked.ok) {
  const [tone, seq] = tweaked.recipes[0].layers
  ok(tone.type === "tone" && tone.frequency.kind === "static" && Math.abs(tone.frequency.value - 880) < 0.01, "transpose +12 dobra a frequência")
  ok(tone.type === "tone" && tone.duration === 0.5 && tone.start === 0.25, "speed 2 reduz os tempos pela metade")
  ok(seq.type === "sequence" && seq.bpm === 240 && Math.abs(seq.notes[0].pitches[0] - 880) < 0.01, "sequência acompanha transpose e speed")
} else ok(false, "receita com transpose/speed é válida")

// Pedidos de ajuste e de correção
const refine = buildRefinePrompt({ json: baseJson, change: "mais grave" })
ok(refine.includes("mais grave") && refine.includes('"layers"') && refine.includes("## Formato"), "pedido de ajuste traz receita, alteração e formato")
ok(!buildRefinePrompt({ json: baseJson, change: "x", includeFormat: false }).includes("## Formato"), "pedido de ajuste curto não repete o formato")
const broken = parseRecipeText('{"layers":[{"type":"laser"}]}')
ok(!broken.ok && buildFixPrompt({ text: "{}", errors: broken.errors }).includes("Linha 1"), "pedido de correção lista os erros")

// Link de compartilhamento
const link = encodeRecipe(JSON.stringify(EXAMPLES[0].recipe))
ok(decodeRecipe("#" + link) === JSON.stringify(EXAMPLES[0].recipe, null, 2), `link de compartilhamento ida e volta (${link.length} caracteres)`)
ok(decodeRecipe("#r=lixo!") === null && decodeRecipe("#outra-coisa") === null, "link inválido é ignorado")

// Organização do histórico
const mk = (id: string, name: string, createdAt: number, extra: Partial<HistoryItem> = {}): HistoryItem => ({
  id, name, json: "{}", createdAt, duration: 1, sampleRate: 44100, channels: 2, layers: 1, peaks: [], favorite: false, ...extra,
})
const libItems = [
  mk("a", "Zumbido", 5000, { batch: "g2", duration: 3 }),
  mk("b", "Alerta", 4000, { batch: "g2", collectionId: "c1", tags: ["ui"] }),
  mk("c", "Moeda", 3000, { batch: "g1", favorite: true, tags: ["jogo"] }),
  mk("d", "Antigo", 1000),
]
const libGens = {
  g1: { id: "g1", createdAt: 3000, kind: "novo" as const, request: "moeda de videogame" },
  g2: { id: "g2", createdAt: 4000, kind: "ajuste" as const, request: "mais grave", parentName: "Moeda" },
}
const lib = (o: Partial<Parameters<typeof buildLibrary>[0]>) =>
  buildLibrary({ items: libItems, generations: libGens, collections: [{ id: "c1", name: "App", color: "#fff" }], query: "", filter: "todos", groupBy: "geracao", sortBy: "recentes", ...o })
const byGen = lib({})
ok(byGen.map((g) => g.label).join("|") === "mais grave|moeda de videogame|Receita colada" && byGen[0].items.length === 2, "agrupa por pedido, do mais recente ao mais antigo")
ok(lib({ query: "videogame" }).flatMap((g) => g.items).map((i) => i.id).join() === "c", "a busca encontra pelo texto do pedido")
ok(lib({ filter: "c1" }).flatMap((g) => g.items).map((i) => i.id).join() === "b", "filtra por coleção")
ok(lib({ filter: "favoritos", groupBy: "nenhum" })[0].items[0].id === "c", "filtra por favoritos")
ok(lib({ groupBy: "nenhum", sortBy: "nome" })[0].items.map((i) => i.name).join() === "Alerta,Antigo,Moeda,Zumbido", "ordena por nome")
ok(lib({ groupBy: "colecao" }).map((g) => `${g.label}:${g.items.length}`).join() === "App:1,Sem coleção:3", "agrupa por coleção")
ok(lib({ groupBy: "etiqueta" }).at(-1)?.label === "Sem etiqueta", "agrupa por etiqueta")

const sr = 44100
const tone = new Float32Array(sr).map((_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr))
const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.slice(from, from + len))
const wav = encodeWav([tone, tone], sr, "pcm16")
ok(ascii(wav, 0, 4) === "RIFF" && ascii(wav, 8, 4) === "WAVE" && wav.length === 44 + sr * 4, "WAV 16-bit")
ok(ascii(encodeWav([tone], sr, "float32"), 0, 4) === "RIFF", "WAV 32-bit float")
ok(ascii(encodeAiff([tone], sr), 0, 4) === "FORM", "AIFF")
const flac = encodeFlac([tone, tone], sr, "teste")
ok(ascii(flac, 0, 4) === "fLaC" && flac.length < wav.length * 0.7, `FLAC (${Math.round((flac.length / wav.length) * 100)}% do WAV)`)

if (failures) {
  console.error(`\n${failures} verificação(ões) falharam`)
  process.exit(1)
}
console.log("\nTudo certo!")
