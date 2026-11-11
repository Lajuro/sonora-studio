"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  AlarmClockIcon,
  ArrowRightIcon,
  BellRingIcon,
  BotIcon,
  ClipboardPasteIcon,
  CloudRainIcon,
  CoinsIcon,
  CopyIcon,
  EyeIcon,
  HeadphonesIcon,
  MousePointerClickIcon,
  MusicIcon,
  PartyPopperIcon,
  PowerIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WandSparklesIcon,
  WindIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isMac } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useSettings } from "@/stores/settings"
import { copyPrompt, currentPrompt, useStudio } from "@/stores/studio"
import { useUi } from "@/stores/ui"
import { CopyMorph, MotionButton } from "./fx"
import { PromptPreviewDialog } from "./prompt-preview"

const IDEAS: { label: string; icon: LucideIcon; text: string }[] = [
  { label: "Notificação", icon: BellRingIcon, text: "Notificação suave de nova mensagem, curta (menos de 1 s), amigável e moderna" },
  { label: "Sucesso", icon: PartyPopperIcon, text: "Som de sucesso ao concluir uma tarefa: positivo, brilhante e rápido" },
  { label: "Erro", icon: TriangleAlertIcon, text: "Som de erro discreto para formulário inválido, grave e curto, sem ser irritante" },
  { label: "Clique", icon: MousePointerClickIcon, text: "Clique de botão sutil e tátil para interface, bem curto" },
  { label: "Moeda 8-bit", icon: CoinsIcon, text: "Coleta de moeda estilo videogame 8-bit" },
  { label: "Laser", icon: ZapIcon, text: "Disparo de laser sci-fi com eco estéreo" },
  { label: "Whoosh", icon: WindIcon, text: "Whoosh de transição para vídeo, atravessando da esquerda para a direita" },
  { label: "Chuva", icon: CloudRainIcon, text: "Ambiente de chuva relaxante de 10 segundos para foco, com fade no início e no fim" },
  { label: "Lo-fi", icon: MusicIcon, text: "Loop de batida lo-fi de 2 compassos a 85 bpm com acordes suaves e chiado de vinil" },
  { label: "Alarme", icon: AlarmClockIcon, text: "Alarme urgente porém não estridente, repetindo 4 vezes" },
  { label: "Inicialização", icon: PowerIcon, text: "Som de inicialização de sistema, elegante e futurista, com cerca de 2 segundos" },
]

const FLOW = [
  { icon: CopyIcon, title: "Copie o prompt", text: "Ele ensina a IA o formato da receita." },
  { icon: BotIcon, title: "Peça para a IA", text: "Copilot, ChatGPT, Gemini… a que sua empresa liberar." },
  { icon: ClipboardPasteIcon, title: "Cole a receita", text: "O Sonora sintetiza o som aqui mesmo, offline." },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 32 } },
} as const

export function StepPrompt() {
  const description = useStudio((s) => s.description)
  const setDescription = useStudio((s) => s.setDescription)
  const setStep = useStudio((s) => s.setStep)
  const { variations, promptMode, set } = useSettings()
  const [copied, setCopied] = useState(false)
  const [copiedOnce, setCopiedOnce] = useState(false)
  const mod = isMac() ? "⌘" : "Ctrl"

  const promptLength = useMemo(
    () => currentPrompt().length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [description, variations, promptMode],
  )

  const onCopy = async () => {
    const ok = await copyPrompt()
    if (!ok) return
    setCopied(true)
    setCopiedOnce(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="mx-auto w-full max-w-3xl px-4 pt-10 pb-16 sm:pt-14">
      <motion.div variants={item} className="flex justify-center">
        <Badge variant="outline" className="h-6 gap-1.5 rounded-full border-primary/25 bg-primary/5 px-3 text-primary">
          <ShieldCheckIcon />
          Sem IA embutida · roda 100% no seu navegador
        </Badge>
      </motion.div>

      <motion.h1 variants={item} className="mt-5 text-center text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
        Que <span className="text-gradient">som</span> você quer criar?
      </motion.h1>
      <motion.p variants={item} className="mx-auto mt-3 max-w-xl text-center text-balance text-muted-foreground">
        Descreva o som, copie o prompt e peça para a IA da sua empresa escrever a receita. Depois é só colar aqui e ouvir.
      </motion.p>

      <motion.div variants={item} className="mt-8">
        <div className="group/card relative rounded-2xl border bg-card/80 shadow-[0_1px_0_0_var(--border),0_24px_60px_-30px_color-mix(in_oklch,var(--brand)_45%,transparent)] backdrop-blur-sm transition-shadow focus-within:shadow-[0_0_0_1px_var(--ring),0_24px_70px_-28px_color-mix(in_oklch,var(--brand)_60%,transparent)]">
          <div className="flex items-center gap-2 px-4 pt-3.5 text-xs font-medium text-muted-foreground">
            <WandSparklesIcon className="size-3.5 text-primary" />
            Descrição do som
            <span className="ml-auto tabular">{description.length > 0 && `${description.length} caracteres`}</span>
          </div>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                e.stopPropagation()
                void onCopy()
              }
            }}
            placeholder="Ex.: notificação suave de mensagem recebida, curta e amigável, com um toque de sino…"
            className="max-h-64 min-h-28 resize-none border-0 bg-transparent px-4 py-2 text-base shadow-none focus-visible:ring-0 md:text-base dark:bg-transparent"
          />

          <div className="flex gap-1.5 overflow-x-auto px-4 pb-3 scrollbar-thin [mask-image:linear-gradient(to_right,black_92%,transparent)]">
            {IDEAS.map((idea, i) => {
              const Icon = idea.icon
              const active = description === idea.text
              return (
                <motion.button
                  key={idea.label}
                  type="button"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.15 + i * 0.025 }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setDescription(idea.text)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                  {idea.label}
                </motion.button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-b-2xl border-t bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Variações</span>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={String(variations)}
                onValueChange={(v) => v && set({ variations: Number(v) })}
              >
                {[1, 2, 3, 4].map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} className="w-8 tabular" aria-label={`${n} variações`}>
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Prompt</span>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    variant="outline"
                    value={promptMode}
                    onValueChange={(v) => v && set({ promptMode: v as "full" | "compact" })}
                  >
                    <ToggleGroupItem value="full" className="px-2.5 text-xs">
                      Completo
                    </ToggleGroupItem>
                    <ToggleGroupItem value="compact" className="px-2.5 text-xs">
                      Compacto
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {promptLength.toLocaleString("pt-BR")} caracteres · use “Compacto” se a IA tiver limite de texto
              </TooltipContent>
            </Tooltip>

            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => useUi.getState().set({ promptPreviewOpen: true })}>
                <EyeIcon />
                Ver prompt
              </Button>
              <MotionButton
                size="lg"
                whileTap={{ scale: 0.95 }}
                onClick={onCopy}
                className="relative h-10 min-w-40 gap-2 overflow-hidden rounded-xl px-4 text-[15px] shadow-[0_8px_24px_-8px_var(--primary)]"
              >
                <span className="pointer-events-none absolute inset-0 shine animate-shimmer opacity-40" />
                <CopyMorph copied={copied} />
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={copied ? "y" : "n"}
                    initial={{ y: 12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -12, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {copied ? "Copiado!" : "Copiar prompt"}
                  </motion.span>
                </AnimatePresence>
              </MotionButton>
            </div>
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Dica: <Kbd>{mod} Enter</Kbd> na descrição também copia. Sem descrição, a IA vai esperar você descrever o som no chat.
        </p>
      </motion.div>

      <AnimatePresence>
        {copiedOnce && (
          <motion.div
            initial={{ opacity: 0, y: 12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <SparklesIcon className="size-5" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className="font-medium">Prompt na área de transferência</p>
                <p className="text-sm text-muted-foreground">Cole na IA, aguarde a receita JSON e traga ela para o próximo passo.</p>
              </div>
              <MotionButton whileTap={{ scale: 0.95 }} onClick={() => setStep(2)} className="gap-1.5">
                Já tenho a receita
                <motion.span animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.4 }} className="grid">
                  <ArrowRightIcon />
                </motion.span>
              </MotionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div variants={item} className="mt-12">
        <div className="mb-4 flex items-center gap-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">
          <span className="h-px flex-1 bg-border" />
          Como funciona
          <span className="h-px flex-1 bg-border" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {FLOW.map((f, i) => (
            <motion.div
              key={f.title}
              whileHover={{ y: -3 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="relative rounded-xl border bg-card/60 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-lg bg-muted text-foreground">
                  <f.icon className="size-3.5" />
                </span>
                <span className="font-pixel text-xs text-muted-foreground">0{i + 1}</span>
              </div>
              <p className="mt-3 text-sm font-medium">{f.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-6 flex justify-center">
          <Button variant="link" className="text-muted-foreground" onClick={() => setStep(2)}>
            <HeadphonesIcon />
            Pular e testar com uma receita de exemplo
          </Button>
        </div>
      </motion.div>

      <PromptPreviewDialog />
    </motion.div>
  )
}
