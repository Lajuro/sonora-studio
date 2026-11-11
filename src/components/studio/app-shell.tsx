"use client"

import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useState } from "react"
import { usePanelRef } from "react-resizable-panels"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-playback"
import { player } from "@/lib/audio/player"
import { cn } from "@/lib/utils"
import { useSettings } from "@/stores/settings"
import { useHistory } from "@/stores/history"
import { copyPrompt, generateFromDraft, importFromHash, openHistoryItem, useStudio, type Step } from "@/stores/studio"
import { commands, useUi } from "@/stores/ui"
import { CommandPalette } from "./command-palette"
import { Header } from "./header"
import { HistorySidebar } from "./history-sidebar"
import { SettingsDialog } from "./settings-dialog"
import { ShortcutsDialog } from "./shortcuts-dialog"
import { StepPrompt } from "./step-prompt"
import { StepRecipe } from "./step-recipe"
import { StepSound } from "./step-sound"

const COLLAPSED_PX = 60

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || Boolean(el.closest(".cm-editor"))
}

export function AppShell() {
  const isDesktop = useMediaQuery("(min-width: 768px)")
  const panelRef = usePanelRef()
  const collapsedPref = useSettings((s) => s.sidebarCollapsed)
  const [collapsed, setCollapsed] = useState(collapsedPref)
  const step = useStudio((s) => s.step)
  const direction = useStudio((s) => s.direction)
  const mobileHistoryOpen = useUi((s) => s.mobileHistoryOpen)

  const toggleSidebar = useCallback(() => {
    if (!isDesktop) {
      useUi.getState().set({ mobileHistoryOpen: !useUi.getState().mobileHistoryOpen })
      return
    }
    const p = panelRef.current
    if (!p) return
    if (p.isCollapsed()) p.expand()
    else p.collapse()
  }, [isDesktop, panelRef])

  useEffect(() => {
    commands.toggleSidebar = toggleSidebar
  }, [toggleSidebar])

  // Receita recebida por link (#r=...)
  useEffect(() => {
    importFromHash()
    const onHash = () => importFromHash()
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  // Reabre o último som ouvido (sem tocar), para o player já estar pronto.
  useEffect(() => {
    const { lastId, current } = useStudio.getState()
    if (current || !lastId) return
    const item = useHistory.getState().items.find((i) => i.id === lastId)
    if (item) void openHistoryItem(item)
  }, [])

  useEffect(() => {
    if (isDesktop && collapsedPref) panelRef.current?.collapse()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop])

  // Atalhos globais
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const ui = useUi.getState()
      if (mod && k === "k") {
        e.preventDefault()
        ui.set({ paletteOpen: !ui.paletteOpen })
      } else if (mod && k === "b") {
        e.preventDefault()
        toggleSidebar()
      } else if (mod && k === ",") {
        e.preventDefault()
        ui.set({ settingsOpen: true })
      } else if (mod && e.shiftKey && k === "c") {
        e.preventDefault()
        void copyPrompt()
      } else if (mod && k === "enter") {
        e.preventDefault()
        void generateFromDraft()
      } else if (e.altKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault()
        useStudio.getState().setStep(Number(e.key) as Step)
      } else if (!isTyping(e) && !mod && !e.altKey) {
        if (e.key === " " || e.code === "Space") {
          const st = useStudio.getState()
          const cur = st.current
          if (player.playing) {
            e.preventDefault()
            player.pause()
          } else if (st.step === 3 && cur) {
            e.preventDefault()
            if (player.key === cur.id) void player.toggle(cur.id, cur.result)
            else void player.play(cur.id, cur.result, 0)
          } else if (player.key) {
            e.preventDefault()
            void player.toggle(player.key)
          } else if (cur) {
            e.preventDefault()
            void player.play(cur.id, cur.result, 0)
          }
        } else if (e.key === "?") {
          ui.set({ shortcutsOpen: true })
        } else if (k === "escape" && player.playing) {
          player.stop()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleSidebar])

  const main = (
    <main className="relative flex h-full min-w-0 flex-col bg-background">
      <div className="pointer-events-none absolute inset-0 bg-glow" />
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-60 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]" />
      <Header isDesktop={isDesktop} sidebarCollapsed={collapsed} />
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={{
              enter: (d: number) => ({ opacity: 0, x: 32 * d, filter: "blur(6px)" }),
              center: { opacity: 1, x: 0, filter: "blur(0px)" },
              exit: (d: number) => ({ opacity: 0, x: -32 * d, filter: "blur(6px)" }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.8 }}
            className="absolute inset-0 overflow-y-auto scrollbar-thin"
          >
            {step === 1 && <StepPrompt />}
            {step === 2 && <StepRecipe />}
            {step === 3 && <StepSound />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  )

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-sidebar">
      {isDesktop ? (
        <ResizablePanelGroup id="sonora-layout" orientation="horizontal">
          <ResizablePanel
            id="history"
            panelRef={panelRef}
            defaultSize={312}
            minSize={248}
            maxSize={560}
            collapsible
            collapsedSize={COLLAPSED_PX}
            groupResizeBehavior="preserve-pixel-size"
            onResize={(size) => {
              const c = size.inPixels <= COLLAPSED_PX + 4
              setCollapsed((prev) => {
                if (prev !== c) useSettings.getState().set({ sidebarCollapsed: c })
                return c
              })
            }}
            className="transition-[flex-basis] duration-0"
          >
            <HistorySidebar collapsed={collapsed} onToggle={toggleSidebar} />
          </ResizablePanel>
          <ResizableHandle
            onDoubleClick={toggleSidebar}
            className={cn(
              "group/handle z-20 w-px bg-sidebar-border transition-colors after:w-2.5",
              "hover:bg-primary/60 data-[separator=active]:bg-primary aria-[valuenow]:hover:bg-primary/60",
            )}
          >
            <div className="pointer-events-none absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-full bg-border opacity-0 transition-all duration-200 group-hover/handle:h-14 group-hover/handle:bg-primary group-hover/handle:opacity-100" />
          </ResizableHandle>
          <ResizablePanel id="main" minSize="45%">
            {main}
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <>
          {main}
          <Sheet open={mobileHistoryOpen} onOpenChange={(o) => useUi.getState().set({ mobileHistoryOpen: o })}>
            <SheetContent
              side="left"
              className="w-[88vw] max-w-sm p-0"
              showCloseButton={false}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <SheetTitle className="sr-only">Histórico</SheetTitle>
              <SheetDescription className="sr-only">Sons gerados anteriormente</SheetDescription>
              <HistorySidebar collapsed={false} onToggle={() => useUi.getState().set({ mobileHistoryOpen: false })} />
            </SheetContent>
          </Sheet>
        </>
      )}
      <CommandPalette />
      <SettingsDialog />
      <ShortcutsDialog />
    </div>
  )
}
