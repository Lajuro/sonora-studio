"use client"

import { useTheme } from "next-themes"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { computePeaks } from "@/lib/audio/peaks"
import { formatTime } from "@/lib/helpers"
import { cn } from "@/lib/utils"

type Props = {
  channels: Float32Array[]
  duration: number
  position: number
  playing: boolean
  onSeek: (t: number) => void
  className?: string
  /** muda a cada novo render, para refazer a animação de entrada */
  version: string
}

const BAR = 3
const GAP = 1.5

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function Waveform({ channels, duration, position, playing, onSeek, className, version }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hover, setHover] = useState<number | null>(null)
  const [intro, setIntro] = useState(0)
  const dragging = useRef(false)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // animação de entrada: as barras crescem a partir do centro
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 650)
      setIntro(1 - Math.pow(1 - t, 3))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [version])

  const bars = Math.max(8, Math.floor(size.w / (BAR + GAP)))
  const peaks = useMemo(() => {
    const p = computePeaks(channels, bars)
    let top = 1e-6
    for (let i = 0; i < bars; i++) top = Math.max(top, -p.min[i], p.max[i])
    return { ...p, top }
  }, [channels, bars])

  const colors = useMemo(
    () =>
      typeof window === "undefined"
        ? null
        : { played: cssVar("--primary"), rest: cssVar("--deck-muted"), line: cssVar("--deck-muted") },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolvedTheme],
  )

  useEffect(() => {
    const c = canvas.current
    if (!c || !size.w || !colors) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(size.w * dpr)
    c.height = Math.round(size.h * dpr)
    const ctx = c.getContext("2d")!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const mid = size.h / 2
    const progress = duration > 0 ? position / duration : 0
    const hoverP = hover !== null && duration > 0 ? hover / duration : null
    // linha central
    ctx.fillStyle = colors.line
    ctx.globalAlpha = 0.5
    ctx.fillRect(0, mid - 0.5, size.w, 1)

    for (let i = 0; i < bars; i++) {
      const x = i * (BAR + GAP)
      const p = i / bars
      const hi = (peaks.max[i] / peaks.top) * (mid - 2) * intro
      const lo = (-peaks.min[i] / peaks.top) * (mid - 2) * intro
      const top = mid - Math.max(1, hi)
      const h = Math.max(2, hi + lo)
      const played = p <= progress && (playing || position > 0)
      if (played) {
        ctx.fillStyle = colors.played
        ctx.globalAlpha = 1
      } else if (hoverP !== null && p <= hoverP) {
        ctx.fillStyle = colors.played
        ctx.globalAlpha = 0.5
      } else {
        ctx.fillStyle = colors.rest
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      ctx.roundRect(x, top, BAR, h, 1.5)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }, [size, peaks, bars, position, duration, hover, intro, colors, playing])

  const timeAt = useCallback(
    (clientX: number) => {
      const r = wrap.current!.getBoundingClientRect()
      return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration
    },
    [duration],
  )

  const progressPct = duration > 0 ? (position / duration) * 100 : 0

  return (
    <div
      ref={wrap}
      className={cn("group/wave relative cursor-pointer touch-none select-none", className)}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onSeek(timeAt(e.clientX))
      }}
      onPointerMove={(e) => {
        const t = timeAt(e.clientX)
        setHover(t)
        if (dragging.current) onSeek(t)
      }}
      onPointerUp={() => (dragging.current = false)}
      onPointerLeave={() => setHover(null)}
      role="slider"
      aria-label="Posição de reprodução"
      aria-valuemin={0}
      aria-valuemax={duration}
      aria-valuenow={position}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(duration, position + duration / 20))
        if (e.key === "ArrowLeft") onSeek(Math.max(0, position - duration / 20))
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {(playing || position > 0) && (
        <div
          className="pointer-events-none absolute inset-y-0 w-0.5 rounded-full bg-deck-foreground"
          style={{ left: `calc(${progressPct}% - 1px)` }}
        />
      )}
      {hover !== null && (
        <>
          <div className="pointer-events-none absolute inset-y-0 w-px bg-deck-foreground/40" style={{ left: `${(hover / duration) * 100}%` }} />
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-sm bg-deck-foreground px-1.5 py-0.5 text-[11px] text-deck tabular"
            style={{ left: `${(hover / duration) * 100}%` }}
          >
            {formatTime(hover)}
          </div>
        </>
      )}
    </div>
  )
}
