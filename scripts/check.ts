/**
 * Verificação rápida (sem navegador): todas as receitas de exemplo e o
 * exemplo do prompt passam no validador, e os codificadores geram arquivos
 * com cabeçalhos corretos. Rode com `npm run check`.
 */
import { encodeFlac } from "../src/lib/audio/encoders/flac"
import { encodeAiff, encodeWav } from "../src/lib/audio/encoders/pcm"
import { EXAMPLES } from "../src/lib/recipe/examples"
import { parseRecipeText } from "../src/lib/recipe/parse"
import { buildPrompt } from "../src/lib/recipe/prompt"

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
