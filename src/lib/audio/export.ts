"use client"

import { encodeFlac } from "./encoders/flac"
import { encodeMp3, MP3_RATES } from "./encoders/mp3"
import { encodeAiff, encodeWav } from "./encoders/pcm"

export type AudioData = {
  channels: Float32Array[]
  sampleRate: number
}

export type FormatGroup = "lossless" | "compressed" | "recipe"

export type ExportFormat = {
  id: string
  label: string
  short: string
  ext: string
  mime: string
  group: FormatGroup
  description: string
  /** gravação em tempo real via MediaRecorder */
  realtime?: boolean
  available: () => boolean
  encode: (audio: AudioData, ctx: { title: string; recipeJson: string; onProgress?: (p: number) => void }) => Promise<Blob>
}

/** Reamostra usando o próprio Web Audio (filtro anti-aliasing do navegador). */
export async function resample(audio: AudioData, targetRate: number): Promise<AudioData> {
  if (audio.sampleRate === targetRate) return audio
  const frames = audio.channels[0].length
  const length = Math.ceil((frames * targetRate) / audio.sampleRate)
  const ctx = new OfflineAudioContext(audio.channels.length, length, targetRate)
  const buf = ctx.createBuffer(audio.channels.length, frames, audio.sampleRate)
  audio.channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i))
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(ctx.destination)
  src.start()
  const out = await ctx.startRendering()
  return {
    sampleRate: targetRate,
    channels: Array.from({ length: out.numberOfChannels }, (_, i) => new Float32Array(out.getChannelData(i))),
  }
}

function nearestMp3Rate(sr: number) {
  if (MP3_RATES.includes(sr)) return sr
  return sr > 48000 ? 48000 : MP3_RATES.reduce((b, r) => (Math.abs(r - sr) < Math.abs(b - sr) ? r : b), 44100)
}

const blob = (bytes: Uint8Array<ArrayBuffer>, mime: string) => new Blob([bytes], { type: mime })

function mp3Format(kbps: number, description: string): ExportFormat {
  return {
    id: `mp3-${kbps}`,
    label: `MP3 ${kbps} kbps`,
    short: "MP3",
    ext: "mp3",
    mime: "audio/mpeg",
    group: "compressed",
    description,
    available: () => true,
    encode: async (audio, { onProgress }) => {
      const a = await resample(audio, nearestMp3Rate(audio.sampleRate))
      return blob(await encodeMp3(a.channels, a.sampleRate, kbps, onProgress), "audio/mpeg")
    },
  }
}

/* ------------------------------- MediaRecorder ---------------------------- */

const RECORDER_CANDIDATES = [
  { id: "ogg-opus", label: "OGG Opus", short: "OGG", ext: "ogg", mime: "audio/ogg;codecs=opus", description: "Muito leve, ótimo para web e jogos" },
  { id: "webm-opus", label: "WebM Opus", short: "WebM", ext: "webm", mime: "audio/webm;codecs=opus", description: "Leve, padrão dos navegadores" },
  { id: "m4a-aac", label: "M4A (AAC)", short: "M4A", ext: "m4a", mime: "audio/mp4;codecs=mp4a.40.2", description: "Padrão Apple / iPhone" },
  { id: "m4a", label: "M4A", short: "M4A", ext: "m4a", mime: "audio/mp4", description: "Padrão Apple / iPhone" },
] as const

function recorderSupported(mime: string) {
  return typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mime)
}

async function recordRealtime(audio: AudioData, mime: string, onProgress?: (p: number) => void): Promise<Blob> {
  const ctx = new AudioContext({ sampleRate: audio.sampleRate })
  try {
    await ctx.resume()
    const frames = audio.channels[0].length
    const buf = ctx.createBuffer(audio.channels.length, frames, audio.sampleRate)
    audio.channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i))
    const dest = ctx.createMediaStreamDestination()
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(dest)
    const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 192_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<void>((resolve) => (rec.onstop = () => resolve()))
    const duration = frames / audio.sampleRate
    rec.start()
    const started = performance.now()
    src.start(ctx.currentTime + 0.05)
    const timer = setInterval(() => onProgress?.(Math.min(0.99, (performance.now() - started) / 1000 / (duration + 0.3))), 80)
    await new Promise<void>((r) => (src.onended = () => r()))
    await new Promise((r) => setTimeout(r, 250))
    rec.stop()
    await done
    clearInterval(timer)
    onProgress?.(1)
    return new Blob(chunks, { type: mime.split(";")[0] })
  } finally {
    void ctx.close()
  }
}

function recorderFormats(): ExportFormat[] {
  return RECORDER_CANDIDATES.map((c) => ({
    ...c,
    group: "compressed" as const,
    realtime: true,
    available: () =>
      recorderSupported(c.mime) && !(c.id === "m4a" && recorderSupported("audio/mp4;codecs=mp4a.40.2")),
    encode: (audio: AudioData, { onProgress }: { onProgress?: (p: number) => void }) =>
      recordRealtime(audio, c.mime, onProgress),
  }))
}

/* --------------------------------- Registro ------------------------------- */

export const EXPORT_FORMATS: ExportFormat[] = [
  {
    id: "wav16",
    label: "WAV 16-bit",
    short: "WAV",
    ext: "wav",
    mime: "audio/wav",
    group: "lossless",
    description: "Compatível com tudo (recomendado)",
    available: () => true,
    encode: async (a) => blob(encodeWav(a.channels, a.sampleRate, "pcm16"), "audio/wav"),
  },
  {
    id: "wav24",
    label: "WAV 24-bit",
    short: "WAV",
    ext: "wav",
    mime: "audio/wav",
    group: "lossless",
    description: "Qualidade de estúdio, para edição",
    available: () => true,
    encode: async (a) => blob(encodeWav(a.channels, a.sampleRate, "pcm24"), "audio/wav"),
  },
  {
    id: "wav32f",
    label: "WAV 32-bit float",
    short: "WAV",
    ext: "wav",
    mime: "audio/wav",
    group: "lossless",
    description: "Precisão máxima, sem arredondamento",
    available: () => true,
    encode: async (a) => blob(encodeWav(a.channels, a.sampleRate, "float32"), "audio/wav"),
  },
  {
    id: "flac",
    label: "FLAC",
    short: "FLAC",
    ext: "flac",
    mime: "audio/flac",
    group: "lossless",
    description: "Sem perdas e bem menor que WAV",
    available: () => true,
    encode: async (a, { title }) => blob(encodeFlac(a.channels, a.sampleRate, title), "audio/flac"),
  },
  {
    id: "aiff",
    label: "AIFF 16-bit",
    short: "AIFF",
    ext: "aiff",
    mime: "audio/aiff",
    group: "lossless",
    description: "Padrão Apple (Logic, GarageBand)",
    available: () => true,
    encode: async (a) => blob(encodeAiff(a.channels, a.sampleRate, 16), "audio/aiff"),
  },
  mp3Format(320, "Máxima qualidade em MP3"),
  mp3Format(192, "Equilíbrio entre tamanho e qualidade"),
  mp3Format(128, "Leve, ideal para notificações"),
  ...recorderFormats(),
  {
    id: "json",
    label: "Receita JSON",
    short: "JSON",
    ext: "json",
    mime: "application/json",
    group: "recipe",
    description: "Para reabrir ou compartilhar a receita",
    available: () => true,
    encode: async (_a, { recipeJson }) => new Blob([recipeJson], { type: "application/json" }),
  },
]

export function getFormat(id: string) {
  return EXPORT_FORMATS.find((f) => f.id === id)
}

export function slugify(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "som"
  )
}

export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function blobToDataUri(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`
  return `${(n / 1024 / 1024).toFixed(2).replace(".", ",")} MB`
}
