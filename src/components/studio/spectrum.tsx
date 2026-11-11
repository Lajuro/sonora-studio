"use client"

import { useTheme } from "next-themes"
import { useEffect, useRef } from "react"
import { player } from "@/lib/audio/player"
import { cn } from "@/lib/utils"

const BANDS = 40

/** Analisador de espectro em tempo real (bandas logarítmicas com "peak hold"). */
export function Spectrum({ active, className }: { active: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    const ctx = c.getContext("2d")!
    const css = getComputedStyle(document.documentElement)
    const brand = css.getPropertyValue("--brand").trim()
    const brand2 = css.getPropertyValue("--brand-2").trim()
    const muted = css.getPropertyValue("--muted-foreground").trim()

    const levels = new Float32Array(BANDS)
    const peaks = new Float32Array(BANDS)
    let data: Uint8Array<ArrayBuffer> | null = null
    let raf = 0
    let idleFrames = 0

    const draw = () => {
      const w = c.clientWidth
      const h = c.clientHeight
      // escondido (ex.: no celular): nada para desenhar, mas continua observando
      if (w < BANDS * 2 || h < 4) {
        raf = requestAnimationFrame(draw)
        return
      }
      const dpr = window.devicePixelRatio || 1
      if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr)
      if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      const analyser = player?.analyser
      const live = active && analyser && player.playing
      if (live) {
        if (!data || data.length !== analyser.frequencyBinCount) data = new Uint8Array(analyser.frequencyBinCount)
        analyser.getByteFrequencyData(data)
        const sr = analyser.context.sampleRate
        const nyq = sr / 2
        for (let b = 0; b < BANDS; b++) {
          const f0 = 30 * Math.pow(16000 / 30, b / BANDS)
          const f1 = 30 * Math.pow(16000 / 30, (b + 1) / BANDS)
          const i0 = Math.floor((f0 / nyq) * data.length)
          const i1 = Math.max(i0 + 1, Math.ceil((f1 / nyq) * data.length))
          let v = 0
          for (let i = i0; i < i1 && i < data.length; i++) v = Math.max(v, data[i])
          const target = v / 255
          levels[b] += (target - levels[b]) * (target > levels[b] ? 0.6 : 0.18)
        }
      } else {
        for (let b = 0; b < BANDS; b++) levels[b] *= 0.86
      }

      const gap = 2
      const bw = (w - gap * (BANDS - 1)) / BANDS
      const grad = ctx.createLinearGradient(0, h, 0, 0)
      grad.addColorStop(0, brand)
      grad.addColorStop(1, brand2)
      let energy = 0
      for (let b = 0; b < BANDS; b++) {
        const lv = Math.pow(levels[b], 1.4)
        energy += lv
        peaks[b] = Math.max(peaks[b] - 0.012, lv)
        const bh = Math.max(2, lv * (h - 4))
        const x = b * (bw + gap)
        ctx.fillStyle = live || lv > 0.01 ? grad : muted
        ctx.globalAlpha = live || lv > 0.01 ? 0.95 : 0.25
        ctx.beginPath()
        ctx.roundRect(x, h - bh, bw, bh, Math.max(0, Math.min(2, bw / 2)))
        ctx.fill()
        if (peaks[b] > 0.02) {
          ctx.globalAlpha = 0.8
          ctx.fillStyle = brand2
          ctx.fillRect(x, h - peaks[b] * (h - 4) - 3, bw, 1.5)
        }
      }
      ctx.globalAlpha = 1

      if (!live && energy < 0.01) idleFrames++
      else idleFrames = 0
      if (idleFrames < 5) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [active, resolvedTheme])

  return <canvas ref={canvas} className={cn("block size-full", className)} aria-hidden />
}
