"use client"

import { AnimatePresence, motion } from "motion/react"
import { GaugeIcon, MinusIcon, Music2Icon, PlusIcon, RotateCcwIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Recipe } from "@/lib/recipe/schema"
import { hasPitchedLayers } from "@/lib/recipe/transform"
import { cn } from "@/lib/utils"
import { applyTweak } from "@/stores/studio"

const round = (v: number, step: number) => Math.round(v / step) * step

function Knob({
  icon: Icon,
  label,
  display,
  shortDisplay,
  value,
  min,
  max,
  step,
  neutral,
  disabled,
  hint,
  onChange,
  onCommit,
}: {
  icon: typeof GaugeIcon
  label: string
  display: string
  shortDisplay: string
  value: number
  min: number
  max: number
  step: number
  neutral: number
  disabled?: boolean
  hint?: string
  onChange: (v: number) => void
  onCommit: (v: number) => void
}) {
  const nudge = (dir: 1 | -1) => {
    const next = Math.min(max, Math.max(min, round(value + dir * step, step)))
    onChange(next)
    onCommit(next)
  }
  const body = (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", disabled && "opacity-45")}>
      <span className="flex w-[88px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:w-[104px]">
        <Icon className="size-3.5" />
        {label}
      </span>
      <Button variant="ghost" size="icon-xs" disabled={disabled || value <= min} onClick={() => nudge(-1)} aria-label={`Diminuir ${label.toLowerCase()}`}>
        <MinusIcon />
      </Button>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onCommit(v)}
        onDoubleClick={() => {
          onChange(neutral)
          onCommit(neutral)
        }}
        className="min-w-16 flex-1"
        aria-label={label}
      />
      <Button variant="ghost" size="icon-xs" disabled={disabled || value >= max} onClick={() => nudge(1)} aria-label={`Aumentar ${label.toLowerCase()}`}>
        <PlusIcon />
      </Button>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-xs tabular sm:w-[92px]",
          value !== neutral ? "text-brand" : "text-muted-foreground",
        )}
      >
        <span className="sm:hidden">{shortDisplay}</span>
        <span className="hidden sm:inline">{display}</span>
      </span>
    </div>
  )
  if (!hint) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/** Tom e velocidade do som atual, sem precisar voltar na IA. */
export function QuickTweaks({ recipe }: { recipe: Recipe }) {
  const [transpose, setTranspose] = useState(recipe.transpose)
  const [speed, setSpeed] = useState(recipe.speed)
  const pitched = hasPitchedLayers(recipe)
  const changed = recipe.transpose !== 0 || recipe.speed !== 1

  const st = Math.round(transpose)
  const transposeLabel = st === 0 ? "original" : `${st > 0 ? "+" : "−"}${Math.abs(st)} ${Math.abs(st) === 1 ? "semitom" : "semitons"}`
  const speedLabel = speed === 1 ? "original" : `${speed.toFixed(2).replace(".", ",")}×`

  return (
    <div className="flex flex-col gap-x-6 gap-y-2 border-t pt-3 lg:flex-row lg:items-center">
      <Knob
        icon={Music2Icon}
        label="Tom"
        display={transposeLabel}
        shortDisplay={st === 0 ? "0 st" : `${st > 0 ? "+" : "−"}${Math.abs(st)} st`}
        value={transpose}
        min={Math.min(-12, recipe.transpose)}
        max={Math.max(12, recipe.transpose)}
        step={1}
        neutral={0}
        disabled={!pitched}
        hint={pitched ? "Sobe ou desce todas as notas. Dois cliques voltam ao original." : "Este som só tem bateria ou ruído, então não há notas para transpor."}
        onChange={setTranspose}
        onCommit={(v) => void applyTweak({ transpose: v })}
      />
      <Knob
        icon={GaugeIcon}
        label="Velocidade"
        display={speedLabel}
        shortDisplay={`${Number(speed.toFixed(2)).toLocaleString("pt-BR")}×`}
        value={speed}
        min={Math.min(0.5, recipe.speed)}
        max={Math.max(2, recipe.speed)}
        step={0.05}
        neutral={1}
        hint="Deixa o som mais rápido ou mais lento sem mudar a afinação. Dois cliques voltam ao original."
        onChange={(v) => setSpeed(round(v, 0.05))}
        onCommit={(v) => void applyTweak({ speed: Number(round(v, 0.05).toFixed(2)) })}
      />
      <AnimatePresence>
        {changed && (
          <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Voltar ao original"
                  onClick={() => {
                    setTranspose(0)
                    setSpeed(1)
                    void applyTweak({ transpose: 0, speed: 1 })
                  }}
                >
                  <RotateCcwIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Voltar tom e velocidade ao original</TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
