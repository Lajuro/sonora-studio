"use client"

import { motion } from "motion/react"
import { EyeIcon, EyeOffIcon, HeadphonesIcon, RotateCcwIcon } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { layerEventTimes, type LayerSpan } from "@/lib/audio/engine"
import type { Recipe } from "@/lib/recipe/schema"
import { cn } from "@/lib/utils"
import { LAYER_META } from "./layer-meta"

type Props = {
  recipe: Recipe
  spans: LayerSpan[]
  duration: number
  position: number
  showPlayhead: boolean
  muted: number[]
  solo: number | null
  busy: boolean
  onMix: (muted: number[], solo: number | null) => void
  onSeek: (t: number) => void
}

export function LayerTimeline({ recipe, spans, duration, position, showPlayhead, muted, solo, busy, onMix, onSeek }: Props) {
  const ticks = useMemo(() => recipe.layers.map((_, i) => layerEventTimes(recipe, i, 160)), [recipe])
  const scale = Math.max(duration, 0.001)
  const pct = (t: number) => `${Math.min(100, (t / scale) * 100)}%`
  const dirty = muted.length > 0 || solo !== null

  // marcas de tempo da régua
  const rulerStep = useMemo(() => {
    const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]
    return candidates.find((c) => duration / c <= 8) ?? 10
  }, [duration])
  const rulerMarks = Array.from({ length: Math.floor(duration / rulerStep) + 1 }, (_, i) => i * rulerStep).filter(
    (m) => m / scale < 0.96,
  )

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Camadas</h3>
          <p className="text-xs text-muted-foreground">Silencie ou isole camadas para ouvir cada parte</p>
        </div>
        {dirty && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <Button variant="ghost" size="sm" onClick={() => onMix([], null)}>
              <RotateCcwIcon />
              Restaurar
            </Button>
          </motion.div>
        )}
      </div>

      <div className="relative">
        {/* régua */}
        <div className="relative ml-[148px] h-5 border-b border-dashed sm:ml-[188px]">
          {rulerMarks.map((m, i) => (
            <span
              key={m}
              className={cn(
                "absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-muted-foreground tabular",
                i % 2 === 1 && "hidden sm:inline",
              )}
              style={{ left: pct(m) }}
            >
              {m === 0 ? "0" : `${Number(m.toFixed(2)).toLocaleString("pt-BR")} s`}
            </span>
          ))}
        </div>

        <div className={cn("mt-1 space-y-1 transition-opacity", busy && "opacity-70")}>
          {spans.map((s, i) => {
            const meta = LAYER_META[s.type]
            const Icon = meta.icon
            const isMuted = muted.includes(i) || s.muted
            const isSolo = solo === i
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.035 }}
                className="group/row flex items-center gap-2"
              >
                <div className="flex w-[140px] shrink-0 items-center gap-1.5 sm:w-[180px]">
                  <span
                    className="grid size-6 shrink-0 place-items-center rounded-md"
                    style={{ background: `color-mix(in oklch, ${meta.color} 16%, transparent)`, color: meta.color }}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className={cn("truncate text-xs font-medium", isMuted && "text-muted-foreground line-through decoration-muted-foreground/50")} title={s.name}>
                      {s.name}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {meta.label}
                      {s.events > 1 ? ` · ${s.events} eventos` : ""}
                    </p>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-pressed={!muted.includes(i)}
                        onClick={() => onMix(muted.includes(i) ? muted.filter((m) => m !== i) : [...muted, i], solo)}
                        className={cn(muted.includes(i) && "text-destructive")}
                      >
                        {muted.includes(i) ? <EyeOffIcon /> : <EyeIcon />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{muted.includes(i) ? "Ativar camada" : "Silenciar camada"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-pressed={isSolo}
                        onClick={() => onMix(muted, isSolo ? null : i)}
                        className={cn(isSolo && "bg-primary/15 text-brand")}
                      >
                        <HeadphonesIcon />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isSolo ? "Sair do solo" : "Ouvir só esta camada"}</TooltipContent>
                  </Tooltip>
                </div>

                <button
                  type="button"
                  className="relative h-7 flex-1 overflow-hidden rounded-md bg-muted/50"
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect()
                    onSeek(((e.clientX - r.left) / r.width) * duration)
                  }}
                  aria-label={`Linha do tempo de ${s.name}`}
                >
                  <motion.span
                    className="absolute inset-y-1 rounded-[5px]"
                    style={{
                      left: pct(s.start),
                      background: `color-mix(in oklch, ${meta.color} ${isMuted ? 18 : 55}%, transparent)`,
                      boxShadow: isMuted ? "none" : `inset 0 0 0 1px color-mix(in oklch, ${meta.color} 70%, transparent)`,
                    }}
                    initial={{ width: 0 }}
                    animate={{ width: `max(4px, ${((s.end - s.start) / scale) * 100}%)` }}
                    transition={{ type: "spring", stiffness: 170, damping: 24, delay: 0.1 + i * 0.04 }}
                  />
                  {s.tailEnd > s.end && (
                    <span
                      className="absolute inset-y-2 rounded-r-[5px]"
                      style={{
                        left: pct(s.end),
                        width: `${((Math.min(s.tailEnd, duration) - s.end) / scale) * 100}%`,
                        background: `linear-gradient(to right, color-mix(in oklch, ${meta.color} ${isMuted ? 10 : 30}%, transparent), transparent)`,
                      }}
                    />
                  )}
                  {ticks[i].length > 1 &&
                    ticks[i].map((t, k) => (
                      <span
                        key={k}
                        className="absolute inset-y-1.5 w-px rounded-full"
                        style={{ left: pct(t), background: isMuted ? "var(--muted-foreground)" : meta.color, opacity: isMuted ? 0.3 : 0.9 }}
                      />
                    ))}
                </button>
              </motion.div>
            )
          })}
        </div>

        {showPlayhead && (
          <div className="pointer-events-none absolute top-5 bottom-0 left-[148px] right-0 sm:left-[188px]">
            <div className="absolute inset-y-0 w-px bg-foreground/80" style={{ left: pct(position) }} />
          </div>
        )}
      </div>
    </div>
  )
}
