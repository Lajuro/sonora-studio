"use client"

import { AnimatePresence, motion } from "motion/react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Botão do shadcn com micro-interação de toque. */
export const MotionButton = motion.create(Button)

export const tap = { whileTap: { scale: 0.96 }, transition: { type: "spring", stiffness: 500, damping: 30 } } as const

export function CopyMorph({ copied, className }: { copied: boolean; className?: string }) {
  return (
    <span className={cn("relative grid size-4 place-items-center", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0, rotate: -45, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 600, damping: 22 }}
            className="grid"
          >
            <CheckIcon className="size-4" strokeWidth={2.75} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="grid"
          >
            <CopyIcon className="size-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/** Barrinhas de equalizador animadas (estado de carregamento/tocando). */
export function EqBars({ className, bars = 4, active = true }: { className?: string; bars?: number; active?: boolean }) {
  return (
    <span className={cn("inline-flex h-3.5 items-end gap-[2px]", className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn("w-[3px] origin-bottom rounded-full bg-current", active ? "animate-eq" : "scale-y-[0.35]")}
          style={{ height: "100%", animationDelay: `${i * -0.22}s`, animationDuration: `${0.75 + (i % 3) * 0.18}s` }}
        />
      ))}
    </span>
  )
}

/** Explosão de partículas para confirmar ações (ex.: favoritar, copiar). */
export function Burst({ trigger, color = "var(--primary)" }: { trigger: number; color?: string }) {
  return (
    <AnimatePresence>
      {trigger > 0 && (
        <span key={trigger} className="pointer-events-none absolute inset-0 grid place-items-center">
          {Array.from({ length: 8 }, (_, i) => {
            const angle = (i / 8) * Math.PI * 2
            return (
              <motion.span
                key={i}
                className="absolute size-1 rounded-full"
                style={{ background: color }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                animate={{ x: Math.cos(angle) * 16, y: Math.sin(angle) * 16, opacity: 0, scale: 0.4 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              />
            )
          })}
        </span>
      )}
    </AnimatePresence>
  )
}
