"use client"

import { motion } from "motion/react"
import { SparklesIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { useSettings } from "@/stores/settings"
import { copyRefinePrompt, useStudio } from "@/stores/studio"
import { CopyMorph, MotionButton } from "./fx"

const IDEAS = [
  "mais grave",
  "mais agudo",
  "mais curto",
  "mais longo",
  "mais suave",
  "mais brilhante",
  "mais eco",
  "sem reverb",
  "mais animado",
  "mais discreto",
]

/** Monta e copia um pedido para a IA alterar a receita atual. */
export function RefinePopover({ json }: { json: string }) {
  const [open, setOpen] = useState(false)
  const [change, setChange] = useState("")
  const [variations, setVariations] = useState(1)
  const [copied, setCopied] = useState(false)
  const includeFormat = useSettings((s) => s.includeFormat)
  const setSettings = useSettings((s) => s.set)

  const parts = change
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const toggleIdea = (idea: string) => {
    const next = parts.includes(idea) ? parts.filter((p) => p !== idea) : [...parts, idea]
    setChange(next.join(", "))
  }

  const submit = async () => {
    if (!(await copyRefinePrompt(json, change, variations))) return
    setCopied(true)
    setTimeout(() => {
      setCopied(false)
      setOpen(false)
      toast("Quando a IA responder, cole a receita nova", {
        action: { label: "Abrir Receita", onClick: () => useStudio.getState().setStep(2) },
      })
    }, 700)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SparklesIcon />
          Pedir ajuste
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] gap-3 p-4">
        <div>
          <p className="text-sm font-semibold">Pedir ajuste à IA</p>
          <p className="text-xs text-muted-foreground">
            Diga o que mudar. O pedido copiado já leva a receita atual, então a IA só altera o que você pediu.
          </p>
        </div>
        <Textarea
          autoFocus
          value={change}
          onChange={(e) => setChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              e.stopPropagation()
              void submit()
            }
          }}
          placeholder="Ex.: deixe mais grave e troque o eco por um reverb curto"
          className="min-h-20 text-sm"
        />
        <div className="flex flex-wrap gap-1">
          {IDEAS.map((idea) => {
            const active = parts.includes(idea)
            return (
              <motion.button
                key={idea}
                type="button"
                whileTap={{ scale: 0.94 }}
                onClick={() => toggleIdea(idea)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors",
                  active ? "border-primary/40 bg-primary/10 text-primary" : "text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {idea}
              </motion.button>
            )
          })}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Versões na resposta</span>
          <ToggleGroup type="single" size="sm" variant="outline" value={String(variations)} onValueChange={(v) => v && setVariations(Number(v))}>
            {[1, 2, 3, 4].map((n) => (
              <ToggleGroupItem key={n} value={String(n)} className="w-8 text-xs" aria-label={`${n} versões`}>
                {n}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="refine-format" className="flex-col items-start gap-0 text-xs font-normal text-muted-foreground">
            <span className="text-foreground">Incluir o formato da receita</span>
            Desligue se for colar na mesma conversa em que a IA já recebeu o prompt.
          </Label>
          <Switch id="refine-format" checked={includeFormat} onCheckedChange={(v) => setSettings({ includeFormat: v })} />
        </div>
        <MotionButton whileTap={{ scale: 0.96 }} onClick={submit} className="w-full gap-2">
          <CopyMorph copied={copied} />
          {copied ? "Copiado!" : change.trim() ? "Copiar pedido" : "Copiar pedido de variação"}
        </MotionButton>
      </PopoverContent>
    </Popover>
  )
}
