"use client"

import { memo, useId } from "react"
import { cn } from "@/lib/utils"

/** Forma de onda compacta (SVG) com preenchimento de progresso. */
export const MiniWave = memo(function MiniWave({
  peaks,
  progress = 0,
  active = false,
  className,
  style,
}: {
  peaks: number[]
  progress?: number
  active?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const id = useId().replace(/:/g, "")
  const n = peaks.length || 1
  const w = n * 3
  return (
    <svg viewBox={`0 0 ${w} 20`} preserveAspectRatio="none" className={cn("h-5 w-full", className)} style={style} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-2)" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect x="0" y="0" width={w * Math.max(0, Math.min(1, progress))} height="20" />
        </clipPath>
      </defs>
      <g fill="currentColor" opacity={active ? 0.35 : 0.28}>
        {peaks.map((p, i) => {
          const h = Math.max(1.2, p * 18)
          return <rect key={i} x={i * 3} y={10 - h / 2} width={2} height={h} rx={1} />
        })}
      </g>
      {progress > 0 && (
        <g fill={`url(#g${id})`} clipPath={`url(#c${id})`}>
          {peaks.map((p, i) => {
            const h = Math.max(1.2, p * 18)
            return <rect key={i} x={i * 3} y={10 - h / 2} width={2} height={h} rx={1} />
          })}
        </g>
      )}
    </svg>
  )
})
