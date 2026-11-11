import { Mp3Encoder } from "@breezystack/lamejs"
import { toInt16 } from "./pcm"

export const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]

const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0))

/**
 * Codifica em MP3 (LAME em JavaScript puro). Processa em blocos e devolve o
 * controle para a interface entre eles, para a tela não travar.
 */
export async function encodeMp3(
  channels: Float32Array[],
  sampleRate: number,
  kbps: number,
  onProgress?: (p: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  if (!MP3_RATES.includes(sampleRate)) throw new Error(`MP3 não suporta ${sampleRate} Hz`)
  const numCh = Math.min(2, channels.length)
  const left = toInt16(channels[0])
  const right = numCh > 1 ? toInt16(channels[1]) : undefined
  const enc = new Mp3Encoder(numCh, sampleRate, kbps)
  const parts: Uint8Array[] = []
  const block = 1152 * 32
  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block)
    const r = right?.subarray(i, i + block)
    const out = r ? enc.encodeBuffer(l, r) : enc.encodeBuffer(l)
    if (out.length) parts.push(new Uint8Array(out))
    onProgress?.(Math.min(1, (i + block) / left.length))
    await yieldToUi()
  }
  const end = enc.flush()
  if (end.length) parts.push(new Uint8Array(end))
  const total = parts.reduce((a, p) => a + p.length, 0)
  const result = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    result.set(p, off)
    off += p.length
  }
  return result
}
