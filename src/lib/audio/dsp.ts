/**
 * Funções de DSP puras (sem Web Audio): geradores determinísticos de ruído,
 * corda Karplus-Strong, resposta ao impulso de reverb e curvas de distorção.
 * Tudo usa um gerador pseudoaleatório com semente, então a mesma receita
 * sempre gera exatamente o mesmo áudio.
 */

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type NoiseColor = "white" | "pink" | "brown"

export function generateNoise(length: number, color: NoiseColor, seed: number): Float32Array {
  const rnd = mulberry32(seed)
  const out = new Float32Array(length)
  if (color === "white") {
    for (let i = 0; i < length; i++) out[i] = rnd() * 2 - 1
  } else if (color === "pink") {
    // Filtro de Paul Kellet (refinado)
    let b0 = 0,
      b1 = 0,
      b2 = 0,
      b3 = 0,
      b4 = 0,
      b5 = 0,
      b6 = 0
    for (let i = 0; i < length; i++) {
      const w = rnd() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    }
  } else {
    let last = 0
    for (let i = 0; i < length; i++) {
      const w = rnd() * 2 - 1
      last = (last + 0.02 * w) / 1.02
      out[i] = last * 3.5
    }
  }
  return out
}

/**
 * Corda dedilhada (Karplus-Strong) com ajuste fino de afinação por all-pass.
 * damping 0 → nota longa e brilhante; 1 → nota curta e abafada.
 */
export function karplusStrong(
  sampleRate: number,
  frequency: number,
  seconds: number,
  damping: number,
  brightness: number,
  seed: number,
): Float32Array {
  const length = Math.max(1, Math.ceil(seconds * sampleRate))
  const out = new Float32Array(length)
  const freq = Math.min(Math.max(frequency, 20), sampleRate / 4)

  const period = sampleRate / freq - 0.5 // o filtro de média adiciona meio sample
  const N = Math.max(2, Math.floor(period))
  const frac = period - N
  const C = (1 - frac) / (1 + frac)

  // Tempo até cair 60 dB: 4 s (damping 0) até 0,12 s (damping 1), escala exponencial
  const t60 = 4 * Math.pow(0.12 / 4, damping)
  const fb = Math.pow(10, -3 / (t60 * freq))

  const rnd = mulberry32(seed)
  const buf = new Float32Array(N)
  const b = 0.08 + 0.92 * brightness
  let lp = 0
  let mean = 0
  for (let i = 0; i < N; i++) {
    lp += b * (rnd() * 2 - 1 - lp)
    buf[i] = lp
    mean += lp
  }
  mean /= N
  let peak = 0
  for (let i = 0; i < N; i++) {
    buf[i] -= mean
    peak = Math.max(peak, Math.abs(buf[i]))
  }
  if (peak > 0) for (let i = 0; i < N; i++) buf[i] /= peak

  let ptr = 0
  let apX = 0
  let apY = 0
  for (let n = 0; n < length; n++) {
    const cur = buf[ptr]
    out[n] = cur
    const nxt = buf[ptr + 1 === N ? 0 : ptr + 1]
    const avg = fb * 0.5 * (cur + nxt)
    const ap = C * avg + apX - C * apY
    apX = avg
    apY = ap
    buf[ptr] = ap
    ptr = ptr + 1 === N ? 0 : ptr + 1
  }
  return out
}

/** Resposta ao impulso estéreo para o reverb (cauda exponencial que escurece com o tempo). */
export function reverbImpulse(sampleRate: number, decay: number, tone: number, seed: number) {
  const length = Math.max(64, Math.ceil(decay * sampleRate))
  const channels: Float32Array[] = []
  for (let ch = 0; ch < 2; ch++) {
    const rnd = mulberry32(seed * 31 + ch * 977 + 7)
    const data = new Float32Array(length)
    let lp = 0
    const fadeIn = Math.min(length, Math.floor(sampleRate * 0.003))
    for (let i = 0; i < length; i++) {
      const pos = i / length
      const coeff = (0.06 + tone * 0.94) * (1 - 0.75 * pos * (1 - tone * 0.5))
      lp += Math.max(0.01, coeff) * (rnd() * 2 - 1 - lp)
      let v = lp * Math.pow(10, -3 * pos)
      if (i < fadeIn) v *= i / fadeIn
      data[i] = v
    }
    channels.push(data)
  }
  return channels
}

export function softClipCurve(amount: number, size = 8192): Float32Array<ArrayBuffer> {
  const k = Math.max(0.001, amount) * 120
  const curve = new Float32Array(size)
  const norm = Math.tanh(k) || 1
  for (let i = 0; i < size; i++) {
    const x = (i * 2) / (size - 1) - 1
    curve[i] = Math.tanh(k * x) / norm
  }
  return curve
}

export function bitcrushCurve(bits: number, size = 65536): Float32Array<ArrayBuffer> {
  const levels = Math.pow(2, Math.max(1, Math.round(bits))) / 2
  const curve = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const x = (i * 2) / (size - 1) - 1
    curve[i] = Math.round(x * levels) / levels
  }
  return curve
}
