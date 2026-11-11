"use client"

import { motion } from "motion/react"
import { CopyCheckIcon } from "lucide-react"
import { useMemo } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { useHistory } from "@/stores/history"
import { openHistoryItem } from "@/stores/studio"

/** Alterna entre os sons gerados juntos (variações do mesmo pedido). */
export function VariationTabs({ currentId }: { currentId: string }) {
  const items = useHistory((s) => s.items)
  const siblings = useMemo(() => {
    const batch = items.find((i) => i.id === currentId)?.batch
    if (!batch) return []
    return items.filter((i) => i.batch === batch).sort((a, b) => b.createdAt - a.createdAt)
  }, [items, currentId])

  if (siblings.length < 2) return null

  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <CopyCheckIcon className="size-3.5" />
        Variações
      </span>
      <div className="flex rounded-full border bg-card/70 p-0.5">
        {siblings.map((item, i) => {
          const active = item.id === currentId
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => !active && void openHistoryItem(item, { play: true })}
                  aria-pressed={active}
                  className={cn(
                    "relative flex h-7 max-w-44 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="variation-pill"
                      className="absolute inset-0 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span className="relative tabular">{i + 1}</span>
                  <span className="relative hidden truncate sm:inline">{item.name}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{item.name}</TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </motion.div>
  )
}
