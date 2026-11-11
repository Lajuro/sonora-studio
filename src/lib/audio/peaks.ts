/** Picos para desenhar formas de onda. */

export type Peaks = { min: Float32Array; max: Float32Array }

export function computePeaks(channels: Float32Array[], buckets: number): Peaks {
  const len = channels[0]?.length ?? 0
  const min = new Float32Array(buckets)
  const max = new Float32Array(buckets)
  if (!len) return { min, max }
  const step = len / buckets
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * step)
    const to = Math.min(len, Math.max(from + 1, Math.floor((b + 1) * step)))
    let lo = 0
    let hi = 0
    for (const ch of channels) {
      for (let i = from; i < to; i++) {
        const v = ch[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    min[b] = lo
    max[b] = hi
  }
  return { min, max }
}

/** Picos absolutos normalizados 0–1, compactos para guardar no histórico. */
export function miniPeaks(channels: Float32Array[], buckets = 56): number[] {
  const { min, max } = computePeaks(channels, buckets)
  const arr = Array.from({ length: buckets }, (_, i) => Math.max(Math.abs(min[i]), Math.abs(max[i])))
  const top = Math.max(...arr, 1e-6)
  // curva levemente comprimida para sons com cauda longa continuarem visíveis
  return arr.map((v) => Math.round(Math.pow(v / top, 0.7) * 100) / 100)
}
