"use client"

import { AnimatePresence, motion } from "motion/react"
import { useTheme } from "next-themes"
import { CheckIcon, KeyboardIcon, ListMusicIcon, MoonIcon, PlusIcon, SearchIcon, Settings2Icon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isMac } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useHistory } from "@/stores/history"
import { startNew, useStudio, type Step } from "@/stores/studio"
import { useUi } from "@/stores/ui"

const STEPS: { id: Step; label: string; hint: string }[] = [
  { id: 1, label: "Pedido", hint: "Descreva o som e copie o prompt" },
  { id: 2, label: "Receita", hint: "Cole o JSON que a IA devolveu" },
  { id: 3, label: "Som", hint: "Ouça, ajuste e baixe" },
]

/** As três etapas de criar um som. Também servem para navegar entre elas. */
export function Stepper() {
  const step = useStudio((s) => s.step)
  const hasSound = useStudio((s) => Boolean(s.current))
  const setStep = useStudio((s) => s.setStep)

  return (
    <nav aria-label="Etapas" className="mx-auto flex items-center">
      {STEPS.map((s, i) => {
        const active = step === s.id
        const done = step > s.id
        const disabled = s.id === 3 && !hasSound
        return (
          <div key={s.id} className="flex items-center">
            {i > 0 && <span className={cn("mx-1 h-px w-4 transition-colors sm:mx-2 sm:w-6", step > i ? "bg-foreground/50" : "bg-border")} />}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setStep(s.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative flex h-8 items-center gap-2 rounded-full pr-3 pl-1.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-background" : "text-muted-foreground hover:text-foreground",
                    disabled && "cursor-not-allowed opacity-40 hover:text-muted-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="step-pill"
                      className="absolute inset-0 rounded-full bg-foreground"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <span
                    className={cn(
                      "relative grid size-5 place-items-center rounded-full text-[11px] font-semibold tabular",
                      active ? "bg-background/20" : "border border-current",
                    )}
                  >
                    {done ? <CheckIcon className="size-3" strokeWidth={3} /> : s.id}
                  </span>
                  <span className={cn("relative", !active && "hidden sm:inline")}>{s.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {disabled ? "Gere um som primeiro" : s.hint}
                <Kbd className="ml-1.5">Alt {s.id}</Kbd>
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
        <Button variant="ghost" size="icon" onClick={() => setTheme(dark ? "light" : "dark")} aria-label="Alternar tema" className="hidden sm:inline-flex">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={dark ? "moon" : "sun"}
              initial={{ rotate: -90, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              exit={{ rotate: 90, scale: 0 }}
              transition={{ duration: 0.15 }}
              className="grid"
            >
              {dark ? <MoonIcon /> : <SunIcon />}
            </motion.span>
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Mudar para o tema {dark ? "claro" : "escuro"}</TooltipContent>
    </Tooltip>
  )
}

export function Header({ isDesktop, sidebarCollapsed }: { isDesktop: boolean; sidebarCollapsed: boolean }) {
  const count = useHistory((s) => s.items.length)
  const ui = useUi((s) => s.set)
  const mod = isMac() ? "⌘" : "Ctrl"
  const sidebarHidden = !isDesktop || sidebarCollapsed

  return (
    <header className="relative z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
      <div className="flex shrink-0 items-center gap-1.5 sm:min-w-0 sm:flex-1">
        {!isDesktop && (
          <Button variant="ghost" size="icon" onClick={() => ui({ mobileHistoryOpen: true })} aria-label={`Abrir histórico (${count} sons)`} className="relative">
            <ListMusicIcon />
            {count > 0 && (
              <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] font-semibold text-background tabular">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Button>
        )}
        {sidebarHidden && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={startNew} size="sm" className="gap-1.5" aria-label="Novo som">
                <PlusIcon />
                <span className="hidden md:inline">Novo som</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Começar um som do zero <Kbd className="ml-1">Alt N</Kbd>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <Stepper />

      <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5">
        <Button variant="outline" size="sm" onClick={() => ui({ paletteOpen: true })} className="mr-1 hidden h-8 gap-2 pr-1.5 pl-2.5 font-normal text-muted-foreground lg:flex">
          <SearchIcon className="size-3.5" />
          Buscar
          <Kbd>{mod} K</Kbd>
        </Button>
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => ui({ paletteOpen: true })} aria-label="Buscar e comandos">
          <SearchIcon />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="hidden sm:inline-flex" onClick={() => ui({ shortcutsOpen: true })} aria-label="Atalhos de teclado">
              <KeyboardIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Atalhos de teclado <Kbd className="ml-1">?</Kbd>
          </TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => ui({ settingsOpen: true })} aria-label="Configurações">
              <Settings2Icon />
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
