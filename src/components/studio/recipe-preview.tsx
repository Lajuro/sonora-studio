"use client"

import { AnimatePresence, motion } from "motion/react"
import { CircleAlertIcon, ClockIcon, FileJson2Icon, LayersIcon, TriangleAlertIcon } from "lucide-react"
import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { computeDuration, computeSpans } from "@/lib/audio/engine"
import { formatDuration } from "@/lib/helpers"
import type { Diagnostic, ParseResult } from "@/lib/recipe/parse"
import type { Recipe } from "@/lib/recipe/schema"
import { cn } from "@/lib/utils"
import { LAYER_META } from "./layer-meta"

export function DiagnosticList({
  items,
  onJump,
  max = 8,
}: {
  items: Diagnostic[]
  onJump: (d: Diagnostic) => void
  max?: number
}) {
  return (
    <ul className="flex flex-col gap-1">
      <AnimatePresence initial={false}>
        {items.slice(0, max).map((d, i) => (
          <motion.li
            key={`${d.from}-${d.message}`}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ delay: i * 0.02 }}
          >
            <button
              type="button"
              onClick={() => onJump(d)}
              className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              {d.severity === "error" ? (
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              ) : (
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-foreground/90">{d.message}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {d.line ? `linha ${d.line}:${d.column}` : ""}
                  {d.path ? ` · ${d.path}` : ""}
                </span>
              </span>
            </button>
          </motion.li>
        ))}
      </AnimatePresence>
      {items.length > max && <li className="px-2 text-xs text-muted-foreground">+{items.length - max} outros</li>}
    </ul>
  )
}

function RecipeSummary({ recipe, index, total }: { recipe: Recipe; index: number; total: number }) {
  const spans = useMemo(() => computeSpans(recipe), [recipe])
  const duration = useMemo(() => computeDuration(recipe, spans), [recipe, spans])
  const scale = Math.max(duration, 0.001)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border bg-card/70 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {total > 1 && <p className="mb-1 font-pixel text-[10px] tracking-wider text-muted-foreground uppercase">Variação {index + 1}</p>}
          <h3 className="truncate font-semibold">{recipe.name}</h3>
          {recipe.description && <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{recipe.description}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="gap-1">
          <ClockIcon />~{formatDuration(duration)}
        </Badge>
        <Badge variant="secondary" className="gap-1">
          <LayersIcon />
          {recipe.layers.length} {recipe.layers.length === 1 ? "camada" : "camadas"}
        </Badge>
        <Badge variant="outline" className="tabular">
          {(recipe.sampleRate / 1000).toLocaleString("pt-BR")} kHz · {recipe.channels === 1 ? "mono" : "estéreo"}
        </Badge>
        {recipe.tags?.slice(0, 4).map((t) => (
          <Badge key={t} variant="outline" className="text-muted-foreground">
            #{t}
          </Badge>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        {spans.map((s, i) => {
          const meta = LAYER_META[s.type]
          const Icon = meta.icon
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.05 + i * 0.03 }}
              className={cn("flex items-center gap-2 text-xs", s.muted && "opacity-40")}
            >
              <span className="grid size-5 shrink-0 place-items-center rounded-md" style={{ background: `color-mix(in oklch, ${meta.color} 18%, transparent)`, color: meta.color }}>
                <Icon className="size-3" />
              </span>
              <span className="w-24 shrink-0 truncate text-muted-foreground" title={s.name}>
                {s.name}
              </span>
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <motion.span
                  className="absolute inset-y-0 rounded-full"
                  style={{ background: meta.color, left: `${(s.start / scale) * 100}%` }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(1.5, ((s.end - s.start) / scale) * 100)}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 26, delay: 0.1 + i * 0.03 }}
                />
                <span
                  className="absolute inset-y-0 rounded-full opacity-25"
                  style={{ background: meta.color, left: `${(s.end / scale) * 100}%`, width: `${((s.tailEnd - s.end) / scale) * 100}%` }}
                />
              </span>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

function WarningBox({ items, onJump }: { items: Diagnostic[]; onJump: (d: Diagnostic) => void }) {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
      <p className="flex items-center gap-2 px-2 pb-1 text-sm font-medium text-warning">
        <TriangleAlertIcon className="size-4" />
        {items.length} {items.length === 1 ? "aviso" : "avisos"} (não impedem gerar)
      </p>
      <DiagnosticList items={items} onJump={onJump} max={5} />
    </div>
  )
}

export function RecipePreview({
  result,
  empty,
  onJump,
}: {
  result: ParseResult | null
  empty: boolean
  onJump: (d: Diagnostic) => void
}) {
  if (empty || !result) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-6 text-center">
        <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="grid size-12 place-items-center rounded-2xl bg-muted">
          <FileJson2Icon className="size-6 text-muted-foreground" />
        </motion.div>
        <div>
          <p className="font-medium">Aguardando a receita</p>
          <p className="mt-1 text-sm text-balance text-muted-foreground">
            Cole a resposta da IA no editor. Pode colar tudo, inclusive o texto em volta: o Sonora extrai o JSON.
          </p>
        </div>
      </div>
    )
  }

  if (!result.ok) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="flex items-center gap-2 px-2 pb-2 text-sm font-medium text-destructive">
            <CircleAlertIcon className="size-4" />
            {result.errors.length} {result.errors.length === 1 ? "problema encontrado" : "problemas encontrados"}
          </p>
          <DiagnosticList items={result.errors} onJump={onJump} />
        </div>
        {result.warnings.length > 0 && <WarningBox items={result.warnings} onJump={onJump} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {result.recipes.map((r, i) => (
        <RecipeSummary key={i} recipe={r} index={i} total={result.recipes.length} />
      ))}
      {result.warnings.length > 0 && <WarningBox items={result.warnings} onJump={onJump} />}
    </div>
  )
}
