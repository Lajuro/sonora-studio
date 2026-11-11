"use client"

import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import {
  AudioLinesIcon,
  BracesIcon,
  CheckIcon,
  HistoryIcon,
  KeyboardIcon,
  MoonIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  SunIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isMac } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useHistory } from "@/stores/history"
import { useStudio, type Step } from "@/stores/studio"
import { useUi } from "@/stores/ui"
import { LogoMark } from "./logo"

const STEPS: { id: Step; label: string; hint: string; icon: typeof SparklesIcon }[] = [
  { id: 1, label: "Prompt", hint: "Descreva e copie o prompt", icon: SparklesIcon },
  { id: 2, label: "Receita", hint: "Cole o JSON da IA", icon: BracesIcon },
  { id: 3, label: "Som", hint: "Ouça e exporte", icon: AudioLinesIcon },
]

export function Stepper() {
  const step = useStudio((s) => s.step)
  const hasSound = useStudio((s) => Boolean(s.current))
  const setStep = useStudio((s) => s.setStep)

  return (
    <nav aria-label="Etapas" className="relative flex items-center rounded-full border bg-card/70 p-1 shadow-sm backdrop-blur-md">
      {STEPS.map((s, i) => {
        const active = step === s.id
        const done = step > s.id
        const disabled = s.id === 3 && !hasSound
        const Icon = s.icon
        return (
          <div key={s.id} className="flex items-center">
            {i > 0 && (
              <div className="relative mx-0.5 h-px w-3 overflow-hidden bg-border sm:w-5">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary"
                  initial={false}
                  animate={{ width: step > i ? "100%" : "0%" }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
              </div>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setStep(s.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex h-8 items-center gap-2 rounded-full px-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5",
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="step-pill"
                      className="absolute inset-0 rounded-full bg-primary shadow-[0_4px_18px_-4px_var(--primary)]"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                      active ? "bg-primary-foreground/15" : done ? "bg-primary/15 text-primary" : "bg-muted",
                    )}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {done ? (
                        <motion.span key="ok" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} exit={{ scale: 0 }}>
                          <CheckIcon className="size-3" strokeWidth={3} />
                        </motion.span>
                      ) : (
                        <motion.span key="icon" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                          <Icon className="size-3" />
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                  <span className="relative hidden sm:inline">{s.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {disabled ? "Gere um som primeiro" : s.hint}
                <Kbd className="ml-1.5">Alt+{s.id}</Kbd>
              </TooltipContent>
            </Tooltip>
          </div>
        )
      })}
    </nav>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Alternar tema">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={dark ? "moon" : "sun"}
              initial={{ rotate: -90, scale: 0, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {dark ? <MoonIcon /> : <SunIcon />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Tema {dark ? "escuro" : "claro"}</TooltipContent>
    </Tooltip>
  )
}

export function Header({ isDesktop, sidebarCollapsed }: { isDesktop: boolean; sidebarCollapsed: boolean }) {
  const count = useHistory((s) => s.items.length)
  const ui = useUi((s) => s.set)
  const mod = isMac() ? "⌘" : "Ctrl"

  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/60 px-3 backdrop-blur-xl sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {!isDesktop && (
          <>
            <Button variant="ghost" size="icon" onClick={() => ui({ mobileHistoryOpen: true })} aria-label="Abrir histórico" className="relative">
              <HistoryIcon />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                  {count > 99 ? "99+" : count}
                </span>
              )}
            </Button>
            <LogoMark className="size-7 rounded-lg" />
          </>
        )}
        {isDesktop && sidebarCollapsed && (
          <span className="hidden text-sm font-semibold tracking-tight lg:inline">Sonora</span>
        )}
      </div>

      <Stepper />

      <div className="flex flex-1 items-center justify-end gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => ui({ paletteOpen: true })}
          className="hidden h-8 gap-2 rounded-full pr-1.5 pl-3 text-muted-foreground lg:flex"
        >
          <SearchIcon className="size-3.5" />
          <span className="text-xs">Buscar e comandos</span>
          <Kbd>{mod} K</Kbd>
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => ui({ paletteOpen: true })} aria-label="Comandos">
          <SearchIcon />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => ui({ shortcutsOpen: true })} aria-label="Atalhos">
              <KeyboardIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Atalhos <Kbd className="ml-1">?</Kbd>
          </TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => ui({ settingsOpen: true })} aria-label="Configurações">
              <motion.span whileHover={{ rotate: 90 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="grid">
                <Settings2Icon />
              </motion.span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Configurações <Kbd className="ml-1">{mod} ,</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
