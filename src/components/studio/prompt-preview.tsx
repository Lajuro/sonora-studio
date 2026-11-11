"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSettings } from "@/stores/settings"
import { copyPrompt, currentPrompt, useStudio } from "@/stores/studio"
import { useUi } from "@/stores/ui"
import { CopyMorph, MotionButton } from "./fx"

export function PromptPreviewDialog() {
  const open = useUi((s) => s.promptPreviewOpen)
  const set = useUi((s) => s.set)
  const description = useStudio((s) => s.description)
  const settings = useSettings()
  const [copied, setCopied] = useState(false)

  const prompt = useMemo(
    () => (open ? currentPrompt() : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, description, settings.promptMode, settings.variations, settings.promptExtra],
  )

  return (
    <Dialog open={open} onOpenChange={(o) => set({ promptPreviewOpen: o })}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-5">
          <DialogTitle>Prompt para a IA</DialogTitle>
          <DialogDescription>
            {prompt.length.toLocaleString("pt-BR")} caracteres · modo {settings.promptMode === "full" ? "completo" : "compacto"}
            {settings.variations > 1 ? ` · ${settings.variations} variações` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 scrollbar-thin">
          <pre className="p-5 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-foreground/90 select-text">{prompt}</pre>
        </div>
        <DialogFooter className="m-0 flex-row items-center justify-between rounded-b-xl border-t p-4 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              set({ promptPreviewOpen: false, settingsOpen: true })
            }}
          >
            Instruções extras…
          </Button>
          <MotionButton
            whileTap={{ scale: 0.95 }}
            onClick={async () => {
              if (await copyPrompt()) {
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }
            }}
          >
            <CopyMorph copied={copied} />
            {copied ? "Copiado!" : "Copiar prompt"}
          </MotionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
