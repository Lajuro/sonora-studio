"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"

const BARS = [0.45, 0.8, 1, 0.65, 0.35]

/** Marca: cinco barras de um medidor de nível. Elas se movem enquanto algo toca. */
export function LogoMark({ active = false, className }: { active?: boolean; className?: string }) {
  return (
    <div className={cn("grid size-8 shrink-0 place-items-center rounded-md bg-primary", className)}>
      <div className="flex h-[52%] items-center gap-[2.5px]">
        {BARS.map((h, i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-primary-foreground"
            initial={false}
            animate={
              active
                ? { height: [`${h * 100}%`, `${Math.max(0.25, 1 - h) * 100}%`, `${h * 100}%`] }
                : { height: `${h * 100}%` }
            }
            transition={active ? { duration: 0.7 + i * 0.08, repeat: Infinity, ease: "easeInOut" } : { duration: 0.4 }}
          />
        ))}
      </div>
    </div>
  )
}

export function Logo({ active }: { active?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <LogoMark active={active} />
      <span className="display text-[17px]">Sonora</span>
    </div>
  )
}
