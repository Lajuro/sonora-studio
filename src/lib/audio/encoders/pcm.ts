/**
 * Codificadores PCM sem perdas: WAV (16/24/32-bit float) e AIFF (16/24-bit).
 * Funções puras: recebem os canais em Float32 (-1..1) e devolvem bytes.
 */

function writeAscii(view: DataView, offset: number, text: string) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

const toInt = (v: number, max: number) => {
  const c = Math.max(-1, Math.min(1, v))
  return c < 0 ? Math.round(c * (max + 1)) : Math.round(c * max)
}

export type WavFormat = "pcm16" | "pcm24" | "float32"

export function encodeWav(channels: Float32Array[], sampleRate: number, format: WavFormat = "pcm16"): Uint8Array<ArrayBuffer> {
  const numCh = channels.length
  const frames = channels[0]?.length ?? 0
  const bytesPerSample = format === "pcm16" ? 2 : format === "pcm24" ? 3 : 4
  const isFloat = format === "float32"
  const blockAlign = numCh * bytesPerSample
  const dataSize = frames * blockAlign
  const fmtSize = isFloat ? 18 : 16
  const factSize = isFloat ? 12 : 0
  const headerSize = 12 + (8 + fmtSize) + factSize + 8
  const buffer = new ArrayBuffer(headerSize + dataSize + (dataSize % 2))
  const view = new DataView(buffer)

  writeAscii(view, 0, "RIFF")
  view.setUint32(4, buffer.byteLength - 8, true)
  writeAscii(view, 8, "WAVE")

  let p = 12
  writeAscii(view, p, "fmt ")
  view.setUint32(p + 4, fmtSize, true)
  view.setUint16(p + 8, isFloat ? 3 : 1, true)
  view.setUint16(p + 10, numCh, true)
  view.setUint32(p + 12, sampleRate, true)
  view.setUint32(p + 16, sampleRate * blockAlign, true)
  view.setUint16(p + 20, blockAlign, true)
  view.setUint16(p + 22, bytesPerSample * 8, true)
  if (isFloat) view.setUint16(p + 24, 0, true)
  p += 8 + fmtSize

  if (isFloat) {
    writeAscii(view, p, "fact")
    view.setUint32(p + 4, 4, true)
    view.setUint32(p + 8, frames, true)
    p += 12
  }

  writeAscii(view, p, "data")
  view.setUint32(p + 4, dataSize, true)
  p += 8

  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const v = channels[c][i]
      if (format === "pcm16") {
        view.setInt16(p, toInt(v, 0x7fff), true)
        p += 2
      } else if (format === "pcm24") {
        const s = toInt(v, 0x7fffff)
        view.setUint8(p, s & 0xff)
        view.setUint8(p + 1, (s >> 8) & 0xff)
        view.setUint8(p + 2, (s >> 16) & 0xff)
        p += 3
      } else {
        view.setFloat32(p, v, true)
        p += 4
      }
    }
  }
  return new Uint8Array(buffer)
}

/** Converte um número para o formato IEEE 754 de 80 bits (usado pelo AIFF). */
function writeExtended(view: DataView, offset: number, value: number) {
  let exponent = 16383
  let mantissa = value
  if (value === 0) {
    exponent = 0
  } else {
    while (mantissa >= 1) {
      mantissa /= 2
      exponent++
    }
    while (mantissa < 0.5) {
      mantissa *= 2
      exponent--
    }
    mantissa *= 2
    exponent--
  }
  view.setUint16(offset, exponent, false)
  const hi = Math.floor(mantissa * 2 ** 31)
  const lo = Math.floor((mantissa * 2 ** 31 - hi) * 2 ** 32)
  view.setUint32(offset + 2, hi >>> 0, false)
  view.setUint32(offset + 6, lo >>> 0, false)
}

export function encodeAiff(channels: Float32Array[], sampleRate: number, bits: 16 | 24 = 16): Uint8Array<ArrayBuffer> {
  const numCh = channels.length
  const frames = channels[0]?.length ?? 0
  const bytes = bits / 8
  const dataSize = frames * numCh * bytes
  const ssndSize = 8 + dataSize
  const total = 12 + (8 + 18) + (8 + ssndSize) + (dataSize % 2)
  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)

  writeAscii(view, 0, "FORM")
  view.setUint32(4, total - 8, false)
  writeAscii(view, 8, "AIFF")

  writeAscii(view, 12, "COMM")
  view.setUint32(16, 18, false)
  view.setUint16(20, numCh, false)
  view.setUint32(22, frames, false)
  view.setUint16(26, bits, false)
  writeExtended(view, 28, sampleRate)

  writeAscii(view, 38, "SSND")
  view.setUint32(42, ssndSize, false)
  view.setUint32(46, 0, false)
  view.setUint32(50, 0, false)

  let p = 54
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      if (bits === 16) {
        view.setInt16(p, toInt(channels[c][i], 0x7fff), false)
        p += 2
      } else {
        const s = toInt(channels[c][i], 0x7fffff)
        view.setUint8(p, (s >> 16) & 0xff)
        view.setUint8(p + 1, (s >> 8) & 0xff)
        view.setUint8(p + 2, s & 0xff)
        p += 3
      }
    }
  }
  return new Uint8Array(buffer)
}

export function toInt16(data: Float32Array): Int16Array {
  const out = new Int16Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = toInt(data[i], 0x7fff)
  return out
}
