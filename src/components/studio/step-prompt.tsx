"use client"

import { AnimatePresence, motion } from "motion/react"
import { ArrowRightIcon, EyeIcon, RotateCcwIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useNow } from "@/hooks/use-playback"
import { isMac, timeAgo } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useHistory } from "@/stores/history"
import { useSettings } from "@/stores/settings"
import { copyPrompt, openHistoryItem, useStudio } from "@/stores/studio"
import { useUi } from "@/stores/ui"
import { CopyMorph, MotionButton } from "./fx"
import { PromptPreviewDialog } from "./prompt-preview"

const IDEAS: { label: string; text: string }[] = [
  { label: "Notificação", text: "Notificação suave de nova mensagem, curta (menos de 1 s), amigável e moderna" },
  { label: "Sucesso", text: "Som de sucesso ao concluir uma tarefa: positivo, brilhante e rápido" },
  { label: "Erro", text: "Som de erro discreto para formulário inválido, grave e curto, sem ser irritante" },
  { label: "Clique", text: "Clique de botão sutil e tátil para interface, bem curto" },
  { label: "Moeda 8-bit", text: "Coleta de moeda estilo videogame 8-bit" },
  { label: "Laser", text: "Disparo de laser sci-fi com eco estéreo" },
  { label: "Whoosh", text: "Whoosh de transição para vídeo, atravessando da esquerda para a direita" },
  { label: "Chuva", text: "Ambiente de chuva relaxante de 10 segundos para foco, com fade no início e no fim" },
  { label: "Lo-fi", text: "Loop de batida lo-fi de 2 compassos a 85 bpm com acordes suaves e chiado de vinil" },
  { label: "Alarme", text: "Alarme urgente porém não estridente, repetindo 4 vezes" },
  { label: "Inicialização", text: "Som de inicialização de sistema, elegante e futurista, com cerca de 2 segundos" },
]

/** Os últimos pedidos feitos, para repetir ou reabrir o que eles geraram. */
function RecentRequests() {
  const items = useHistory((s) => s.items)
  const generations = useHistory((s) => s.generations)
  const setDescription = useStudio((s) => s.setDescription)
  const now = useNow()

  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: { id: string; text: string; createdAt: number; sounds: typeof items }[] = []
    for (const g of Object.values(generations).sort((a, b) => b.createdAt - a.createdAt)) {
      const text = g.request.trim()
      if (!text || (g.kind !== "novo" && g.kind !== "manual") || seen.has(text)) continue
      const sounds = items.filter((i) => i.batch === g.id).sort((a, b) => b.createdAt - a.createdAt)
      if (!sounds.length) continue
      seen.add(text)
      out.push({ id: g.id, text, createdAt: g.createdAt, sounds })
      if (out.length === 5) break
    }
    return out
  }, [items, generations])

  if (!recent.length) return null

  return (
    <section className="mt-10">
      <h2 className="text-sm font-medium">Pedidos recentes</h2>
      <ul className="mt-2 divide-y rounded-lg border bg-card">
        {recent.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm" title={r.text}>
                {r.text}
              </p>
              <p className="text-xs text-muted-foreground">
                {timeAgo(r.createdAt, now)}, {r.sounds.length === 1 ? "1 som" : `${r.sounds.length} sons`}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setDescription(r.text)}>
                  <RotateCcwIcon />
                  <span className="hidden sm:inline">Usar de novo</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Colocar este texto na descrição</TooltipContent>
            </Tooltip>
            <Button variant="outline" size="sm" onClick={() => void openHistoryItem(r.sounds[0], { step: 3 })}>
              {r.sounds.length === 1 ? "Abrir o som" : "Abrir os sons"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function StepPrompt() {
  const description = useStudio((s) => s.description)
  const setDescription = useStudio((s) => s.setDescription)
  const setStep = useStudio((s) => s.setStep)
  const waiting = useStudio((s) => s.request?.kind === "novo")
  const { variations, set } = useSettings()
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLTextAreaElement>(null)
  const mod = isMac() ? "⌘" : "Ctrl"

  // foco direto na descrição (só com mouse/teclado, para não abrir o teclado do celular)
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return
    const t = setTimeout(() => field.current?.focus(), 200)
    return () => clearTimeout(t)
  }, [])

  const onCopy = async () => {
    if (!(await copyPrompt())) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="display text-3xl leading-tight sm:text-4xl">Que som você quer criar?</h1>
      <p className="mt-2 max-w-xl text-muted-foreground">
        Descreva o som e copie o prompt. Depois é colar na IA da sua empresa e trazer a receita que ela devolver.
      </p>

      <div className="mt-6 rounded-xl border bg-card transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        <Textarea
          ref={field}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault()
              e.stopPropagation()
              void onCopy()
            }
          }}
          aria-label="Descrição do som"
          placeholder="Ex.: notificação suave de mensagem recebida, curta e amigável, com um toque de sino"
          className="max-h-72 min-h-32 resize-none border-0 bg-transparent px-4 pt-4 pb-2 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
        />

        <div className="flex flex-wrap gap-1.5 px-4 pb-4">
          {IDEAS.map((idea) => {
            const active = description === idea.text
            return (
              <button
                key={idea.label}
                type="button"
                onClick={() => setDescription(idea.text)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                {idea.label}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-b-xl border-t bg-muted/40 px-4 py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Quantos sons</span>
                <ToggleGroup type="single" size="sm" variant="outline" value={String(variations)} onValueChange={(v) => v && set({ variations: Number(v) })}>
                  {[1, 2, 3, 4].map((n) => (
                    <ToggleGroupItem key={n} value={String(n)} className="w-8 tabular" aria-label={`${n} ${n === 1 ? "som" : "sons"}`}>
                      {n}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            </TooltipTrigger>
            <TooltipContent>A IA devolve esse número de versões do mesmo pedido, para você comparar</TooltipContent>
          </Tooltip>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => useUi.getState().set({ promptPreviewOpen: true })}>
              <EyeIcon />
              Ver prompt
            </Button>
            <MotionButton size="lg" whileTap={{ scale: 0.96 }} onClick={onCopy} className="h-10 min-w-40 gap-2 px-4 text-[15px]">
              <CopyMorph copied={copied} />
              {copied ? "Prompt copiado" : "Copiar prompt"}
            </MotionButton>
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {waiting ? (
          <motion.div
            key="waiting"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 flex flex-col gap-3 rounded-lg border border-primary/50 bg-primary/10 p-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <p className="font-medium">Prompt copiado. Agora cole na IA.</p>
                <p className="text-sm text-muted-foreground">Quando ela responder com o JSON, traga a resposta para a etapa Receita.</p>
              </div>
              <Button onClick={() => setStep(2)} className="gap-1.5">
                Colar a receita
                <ArrowRightIcon />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.ol
            key="how"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 grid gap-x-6 gap-y-1 text-[13px] text-muted-foreground sm:grid-cols-3"
          >
            <li>
              <span className="mr-1.5 font-semibold text-foreground tabular">1</span>Copie o prompt <Kbd className="ml-1">{mod} Enter</Kbd>
            </li>
            <li>
              <span className="mr-1.5 font-semibold text-foreground tabular">2</span>Cole no Copilot, ChatGPT ou Gemini
            </li>
            <li>
              <span className="mr-1.5 font-semibold text-foreground tabular">3</span>Traga a receita e ouça aqui
            </li>
          </motion.ol>
        )}
      </AnimatePresence>

      <RecentRequests />

      <p className="mt-10 text-[13px] text-muted-foreground">
        O Sonora não tem IA embutida e não envia nada para fora: o som é sintetizado no seu navegador.{" "}
        <button type="button" onClick={() => setStep(2)} className="text-foreground underline underline-offset-2 hover:text-brand">
          Testar com uma receita de exemplo
        </button>
      </p>

      <PromptPreviewDialog />
    </div>
  )
}
