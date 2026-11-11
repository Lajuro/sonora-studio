"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"

const BARS = [0.45, 0.8, 1, 0.65, 0.35]

export function LogoMark({ active = false, className }: { active?: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-gradient-brand shadow-[0_6px_24px_-6px_var(--brand)]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.45),transparent_55%)]" />
      <div className="relative flex h-[55%] items-center gap-[2.5px]">
        {BARS.map((h, i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-white/95"
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

export function Logo({ active, compact }: { active?: boolean; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <LogoMark active={active} />
      {!compact && (
        <div className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-tight">Sonora</span>
          <span className="font-pixel text-[10px] tracking-wider text-muted-foreground uppercase">estúdio de sons</span>
        </div>
      )}
    </div>
  )
}
