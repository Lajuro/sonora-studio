/**
 * Codificador FLAC (16-bit) escrito do zero, sem dependências.
 * Usa preditores fixos (ordens 0–4) com codificação Rice, o mesmo princípio
 * do "flac -0". Resultado: arquivo sem perdas, tipicamente 40–60% menor que WAV.
 */
import { toInt16 } from "./pcm"

const BLOCK_SIZE = 4096
const BPS = 16

class BitWriter {
  private buf = new Uint8Array(1 << 16)
  private pos = 0 // bytes completos
  private acc = 0 // acumulador de bits
  private nbits = 0

  private ensure(extra: number) {
    if (this.pos + extra < this.buf.length) return
    let size = this.buf.length * 2
    while (size < this.pos + extra + 8) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buf.subarray(0, this.pos))
    this.buf = next
  }

  write(value: number, bits: number) {
    // escreve até 32 bits, em fatias de 16 para não estourar a precisão dos operadores bit a bit
    while (bits > 16) {
      bits -= 16
      this.write(Math.floor(value / 2 ** bits) & 0xffff, 16)
    }
    if (bits === 0) return
    this.ensure(4)
    this.acc = (this.acc << bits) | (value & ((1 << bits) - 1))
    this.nbits += bits
    while (this.nbits >= 8) {
      this.nbits -= 8
      this.buf[this.pos++] = (this.acc >>> this.nbits) & 0xff
    }
    this.acc &= (1 << this.nbits) - 1
  }

  writeSigned(value: number, bits: number) {
    this.write(value < 0 ? value + 2 ** bits : value, bits)
  }

  writeUnary(q: number) {
    // q zeros seguidos de um bit 1
    while (q >= 16) {
      this.write(0, 16)
      q -= 16
    }
    this.write(1, q + 1)
  }

  alignByte() {
    if (this.nbits > 0) this.write(0, 8 - this.nbits)
  }

  get bytePos() {
    return this.pos
  }

  slice(from: number, to: number) {
    return this.buf.subarray(from, to)
  }

  bytes() {
    return this.buf.slice(0, this.pos)
  }
}

const CRC8 = new Uint8Array(256)
const CRC16 = new Uint16Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff
  CRC8[i] = c
  let d = i << 8
  for (let j = 0; j < 8; j++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff
  CRC16[i] = d
}

function crc8(data: Uint8Array) {
  let c = 0
  for (const b of data) c = CRC8[c ^ b]
  return c
}

function crc16(data: Uint8Array) {
  let c = 0
  for (const b of data) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b]
  return c
}

function utf8Number(w: BitWriter, n: number) {
  if (n < 0x80) return w.write(n, 8)
  const bytes: number[] = []
  let v = n
  while (v > 0) {
    bytes.unshift(v & 0x3f)
    v = Math.floor(v / 64)
  }
  // ajusta para caber no primeiro byte
  let lead = bytes.length
  const maxFirst = (1 << (7 - lead)) - 1
  if (bytes[0] > maxFirst) {
    bytes.unshift(0)
    lead++
  }
  const prefix = (0xff << (8 - lead)) & 0xff
  w.write(prefix | bytes[0], 8)
  for (let i = 1; i < bytes.length; i++) w.write(0x80 | bytes[i], 8)
}

const SR_CODES: Record<number, number> = {
  88200: 0b0001,
  176400: 0b0010,
  192000: 0b0011,
  8000: 0b0100,
  16000: 0b0101,
  22050: 0b0110,
  24000: 0b0111,
  32000: 0b1000,
  44100: 0b1001,
  48000: 0b1010,
  96000: 0b1011,
}

function residuals(x: Int16Array, start: number, n: number, order: number, out: Int32Array) {
  for (let i = order; i < n; i++) {
    const s = start + i
    let e: number
    switch (order) {
      case 0:
        e = x[s]
        break
      case 1:
        e = x[s] - x[s - 1]
        break
      case 2:
        e = x[s] - 2 * x[s - 1] + x[s - 2]
        break
      case 3:
        e = x[s] - 3 * x[s - 1] + 3 * x[s - 2] - x[s - 3]
        break
      default:
        e = x[s] - 4 * x[s - 1] + 6 * x[s - 2] - 4 * x[s - 3] + x[s - 4]
    }
    out[i - order] = e
  }
  return n - order
}

const zigzag = (e: number) => (e >= 0 ? 2 * e : -2 * e - 1)

function bestRice(res: Int32Array, count: number) {
  let sum = 0
  for (let i = 0; i < count; i++) sum += zigzag(res[i])
  let bestK = 0
  let bestBits = Infinity
  // estimativa inicial a partir da média, depois testa os vizinhos
  const guess = count > 0 && sum > 0 ? Math.max(0, Math.floor(Math.log2(sum / count))) : 0
  for (let k = Math.max(0, guess - 2); k <= Math.min(14, guess + 2); k++) {
    let bits = count * (k + 1)
    for (let i = 0; i < count; i++) bits += Math.floor(zigzag(res[i]) / 2 ** k)
    if (bits < bestBits) {
      bestBits = bits
      bestK = k
    }
  }
  return { k: bestK, bits: bestBits }
}

const scratch = new Int32Array(BLOCK_SIZE)

function writeSubframe(w: BitWriter, x: Int16Array, start: number, n: number) {
  // Constante (ex.: silêncio)
  let constant = true
  for (let i = 1; i < n; i++) {
    if (x[start + i] !== x[start]) {
      constant = false
      break
    }
  }
  if (constant) {
    w.write(0, 1)
    w.write(0b000000, 6)
    w.write(0, 1)
    w.writeSigned(x[start], BPS)
    return
  }

  let best = { order: -1, k: 0, bits: n * BPS }
  for (let order = 0; order <= 4 && order < n; order++) {
    const count = residuals(x, start, n, order, scratch)
    const r = bestRice(scratch, count)
    const total = order * BPS + 6 + r.bits
    if (total < best.bits) best = { order, k: r.k, bits: total }
  }

  w.write(0, 1)
  if (best.order < 0) {
    w.write(0b000001, 6)
    w.write(0, 1)
    for (let i = 0; i < n; i++) w.writeSigned(x[start + i], BPS)
    return
  }

  w.write(0b001000 | best.order, 6)
  w.write(0, 1)
  for (let i = 0; i < best.order; i++) w.writeSigned(x[start + i], BPS)
  const count = residuals(x, start, n, best.order, scratch)
  w.write(0b00, 2) // Rice com parâmetro de 4 bits
  w.write(0, 4) // ordem de partição 0
  w.write(best.k, 4)
  const k = best.k
  const mask = (1 << k) - 1
  for (let i = 0; i < count; i++) {
    const u = zigzag(scratch[i])
    w.writeUnary(Math.floor(u / 2 ** k))
    if (k > 0) w.write(u & mask, k)
  }
}

export function encodeFlac(channels: Float32Array[], sampleRate: number, title?: string): Uint8Array<ArrayBuffer> {
  const numCh = Math.min(8, channels.length)
  const pcm = channels.slice(0, numCh).map(toInt16)
  const total = pcm[0]?.length ?? 0
  const w = new BitWriter()

  // Cabeçalho "fLaC"
  for (const ch of "fLaC") w.write(ch.charCodeAt(0), 8)

  // STREAMINFO
  w.write(0, 1)
  w.write(0, 7)
  w.write(34, 24)
  w.write(BLOCK_SIZE, 16)
  w.write(BLOCK_SIZE, 16)
  w.write(0, 24)
  w.write(0, 24)
  w.write(sampleRate, 20)
  w.write(numCh - 1, 3)
  w.write(BPS - 1, 5)
  w.write(Math.floor(total / 2 ** 32), 4)
  w.write(total >>> 0, 32)
  for (let i = 0; i < 16; i++) w.write(0, 8) // MD5 não calculado (permitido)

  // VORBIS_COMMENT (último bloco de metadados)
  const enc = new TextEncoder()
  const vendor = enc.encode("Sonora Studio")
  const comments = [title ? `TITLE=${title}` : null, "ENCODER=Sonora Studio"].filter(Boolean).map((c) => enc.encode(c!))
  const vcLen = 4 + vendor.length + 4 + comments.reduce((a, c) => a + 4 + c.length, 0)
  w.write(1, 1)
  w.write(4, 7)
  w.write(vcLen, 24)
  const le32 = (n: number) => {
    w.write(n & 0xff, 8)
    w.write((n >> 8) & 0xff, 8)
    w.write((n >> 16) & 0xff, 8)
    w.write((n >>> 24) & 0xff, 8)
  }
  le32(vendor.length)
  vendor.forEach((b) => w.write(b, 8))
  le32(comments.length)
  for (const c of comments) {
    le32(c.length)
    c.forEach((b) => w.write(b, 8))
  }

  const srCode = SR_CODES[sampleRate] ?? 0b0000
  let frameNo = 0
  for (let start = 0; start < total; start += BLOCK_SIZE, frameNo++) {
    const n = Math.min(BLOCK_SIZE, total - start)
    const frameStart = w.bytePos

    w.write(0b11111111111110, 14)
    w.write(0, 1)
    w.write(0, 1)
    w.write(0b0111, 4) // tamanho do bloco: 16 bits no fim do cabeçalho
    w.write(srCode, 4)
    w.write(numCh - 1, 4) // canais independentes
    w.write(0b100, 3) // 16 bits por amostra
    w.write(0, 1)
    utf8Number(w, frameNo)
    w.write(n - 1, 16)
    w.write(crc8(w.slice(frameStart, w.bytePos)), 8)

    for (let c = 0; c < numCh; c++) writeSubframe(w, pcm[c], start, n)

    w.alignByte()
    w.write(crc16(w.slice(frameStart, w.bytePos)), 16)
  }

  return w.bytes() as Uint8Array<ArrayBuffer>
}
