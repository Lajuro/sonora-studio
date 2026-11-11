/**
 * Conversão de nomes de notas musicais (ex.: "A4", "C#5", "Eb3") em frequência (Hz).
 * Afinação padrão: A4 = 440 Hz, temperamento igual.
 */

const NOTE_OFFSETS: Record<string, number> = {
  C: -9,
  D: -7,
  E: -5,
  F: -4,
  G: -2,
  A: 0,
  B: 2,
}

const NOTE_RE = /^([A-Ga-g])\s*([#♯b♭]{0,2})\s*(-?\d{1,2})?$/
const HZ_RE = /^(-?\d+(?:[.,]\d+)?)\s*(hz|khz)?$/i

export function noteToFrequency(input: string): number | null {
  const raw = input.trim()
  if (!raw) return null

  const hz = raw.match(HZ_RE)
  if (hz) {
    const value = Number(hz[1].replace(",", "."))
    const mult = hz[2]?.toLowerCase() === "khz" ? 1000 : 1
    return Number.isFinite(value) ? value * mult : null
  }

  const m = raw.match(NOTE_RE)
  if (!m) return null
  const letter = m[1].toUpperCase()
  const accidentals = m[2] ?? ""
  const octave = m[3] !== undefined ? Number(m[3]) : 4

  let semis = NOTE_OFFSETS[letter]
  for (const ch of accidentals) {
    if (ch === "#" || ch === "♯") semis += 1
    if (ch === "b" || ch === "♭") semis -= 1
  }
  semis += (octave - 4) * 12
  return 440 * Math.pow(2, semis / 12)
}

export function semitonesToRatio(semitones: number) {
  return Math.pow(2, semitones / 12)
}

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

export function frequencyToNote(freq: number): string {
  if (!Number.isFinite(freq) || freq <= 0) return "-"
  const midi = Math.round(69 + 12 * Math.log2(freq / 440))
  const name = NAMES[((midi % 12) + 12) % 12]
  const octave = Math.floor(midi / 12) - 1
  return `${name}${octave}`
}
