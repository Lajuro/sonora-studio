"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { AudioData } from "./export"

type Snapshot = {
  key: string | null
  playing: boolean
  duration: number
  version: number
}

/**
 * Reprodutor único do app: só um som toca por vez. Mantém um AnalyserNode
 * para o espectro em tempo real.
 */
class Player {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  analyser: AnalyserNode | null = null
  private source: AudioBufferSourceNode | null = null
  private buffer: AudioBuffer | null = null
  private startedAt = 0
  private offset = 0
  private listeners = new Set<() => void>()
  private bufferCache = new Map<string, AudioBuffer>()

  key: string | null = null
  playing = false
  loop = false
  volume = 0.85

  private ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" })
      this.gain = this.ctx.createGain()
      this.gain.gain.value = this.volume
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.smoothingTimeConstant = 0.78
      this.gain.connect(this.analyser).connect(this.ctx.destination)
    }
    return this.ctx
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private version = 0

  private emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  get duration() {
    return this.buffer?.duration ?? 0
  }

  get position() {
    if (!this.ctx || !this.buffer) return 0
    if (!this.playing) return this.offset
    const t = this.ctx.currentTime - this.startedAt
    return this.loop ? t % this.buffer.duration : Math.min(t, this.buffer.duration)
  }

  private toBuffer(key: string, data: AudioData) {
    const cached = this.bufferCache.get(key)
    if (cached) return cached
    const ctx = this.ensure()
    const buf = ctx.createBuffer(data.channels.length, data.channels[0].length, data.sampleRate)
    data.channels.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i))
    this.bufferCache.set(key, buf)
    if (this.bufferCache.size > 24) {
      const first = this.bufferCache.keys().next().value
      if (first !== undefined && first !== this.key) this.bufferCache.delete(first)
    }
    return buf
  }

  invalidate(key: string) {
    this.bufferCache.delete(key)
  }

  private stopSource() {
    if (this.source) {
      this.source.onended = null
      try {
        this.source.stop()
      } catch {
        /* já parado */
      }
      this.source.disconnect()
      this.source = null
    }
  }

  async play(key: string, data?: AudioData, from?: number) {
    const ctx = this.ensure()
    if (ctx.state === "suspended") await ctx.resume()
    if (data) this.buffer = this.toBuffer(key, data)
    else if (key !== this.key || !this.buffer) {
      const cached = this.bufferCache.get(key)
      if (!cached) return
      this.buffer = cached
    }
    if (key !== this.key) this.offset = 0
    this.key = key
    this.stopSource()

    const src = ctx.createBufferSource()
    src.buffer = this.buffer
    src.loop = this.loop
    src.connect(this.gain!)
    let start = from ?? this.offset
    if (start >= this.buffer!.duration - 0.005) start = 0
    src.start(0, start)
    this.startedAt = ctx.currentTime - start
    this.offset = start
    this.source = src
    this.playing = true
    src.onended = () => {
      if (this.source !== src) return
      this.playing = false
      this.offset = 0
      this.source = null
      this.emit()
    }
    this.emit()
  }

  pause() {
    if (!this.playing) return
    this.offset = this.position
    this.playing = false
    this.stopSource()
    this.emit()
  }

  stop() {
    this.playing = false
    this.offset = 0
    this.stopSource()
    this.emit()
  }

  async toggle(key: string, data?: AudioData) {
    if (this.playing && this.key === key) this.pause()
    else await this.play(key, data)
  }

  async seek(seconds: number) {
    const t = Math.max(0, Math.min(seconds, this.duration))
    if (this.playing && this.key) await this.play(this.key, undefined, t)
    else {
      this.offset = t
      this.emit()
    }
  }

  setVolume(v: number) {
    this.volume = v
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.015)
  }

  setLoop(loop: boolean) {
    this.loop = loop
    if (this.source) this.source.loop = loop
    if (this.playing && this.ctx && this.buffer) {
      // recalibra o ponto de partida ao ligar/desligar o loop
      const pos = this.position
      this.startedAt = this.ctx.currentTime - pos
    }
    this.emit()
  }

  snapshot(): Snapshot {
    return { key: this.key, playing: this.playing, duration: this.duration, version: this.version }
  }
}

export const player = typeof window !== "undefined" ? new Player() : (null as unknown as Player)

/* ------------------------------ Estado reativo ---------------------------- */

type PlayerState = Snapshot & {
  volume: number
  loop: boolean
  setVolume: (v: number) => void
  setLoop: (v: boolean) => void
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set) => ({
      key: null,
      playing: false,
      duration: 0,
      version: 0,
      volume: 0.85,
      loop: false,
      setVolume: (volume) => {
        player?.setVolume(volume)
        set({ volume })
      },
      setLoop: (loop) => {
        player?.setLoop(loop)
        set({ loop })
      },
    }),
    {
      name: "sonora-player",
      partialize: (s) => ({ volume: s.volume, loop: s.loop }),
      onRehydrateStorage: () => (state) => {
        if (state && player) {
          player.setVolume(state.volume)
          player.loop = state.loop
        }
      },
    },
  ),
)

if (typeof window !== "undefined") {
  player.subscribe(() => usePlayer.setState(player.snapshot()))
}
