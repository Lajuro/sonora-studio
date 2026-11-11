"use client"

import { AnimatePresence, motion } from "motion/react"
import { DownloadIcon, FileAudioIcon, FileCode2Icon, InfoIcon, RadioIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { blobToDataUri, downloadBlob, EXPORT_FORMATS, formatBytes, getFormat, slugify, type ExportFormat, type FormatGroup } from "@/lib/audio/export"
import { copyText } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useHistory } from "@/stores/history"
import { useSettings } from "@/stores/settings"
import { useStudio, type CurrentSound } from "@/stores/studio"
import { useUi } from "@/stores/ui"
import { CopyMorph, EqBars, MotionButton } from "./fx"

const GROUPS: { id: FormatGroup; label: string; icon: typeof FileAudioIcon }[] = [
  { id: "lossless", label: "Sem perdas", icon: FileAudioIcon },
  { id: "compressed", label: "Compactado", icon: RadioIcon },
  { id: "recipe", label: "Receita", icon: FileCode2Icon },
]

function estimateSize(f: ExportFormat, frames: number, ch: number, duration: number, jsonLen: number) {
  switch (f.id) {
    case "wav16":
      return { bytes: 44 + frames * ch * 2, exact: true }
    case "wav24":
      return { bytes: 44 + frames * ch * 3, exact: true }
    case "wav32f":
      return { bytes: 58 + frames * ch * 4, exact: true }
    case "aiff":
      return { bytes: 54 + frames * ch * 2, exact: true }
    case "flac":
      return { bytes: Math.round(frames * ch * 2 * 0.5), exact: false }
    case "json":
      return { bytes: jsonLen, exact: true }
    default: {
      const kbps = f.id.startsWith("mp3-") ? Number(f.id.slice(4)) : 160
      return { bytes: Math.round((kbps * 1000 * duration) / 8), exact: false }
    }
  }
}

export function ExportPanel({ sound, mixed, name: savedName }: { sound: CurrentSound; mixed: boolean; name?: string }) {
  const defaultFormat = useSettings((s) => s.defaultFormat)
  const setSettings = useSettings((s) => s.set)
  const formats = useMemo(() => EXPORT_FORMATS.filter((f) => f.available()), [])
  const [formatId, setFormatId] = useState(() => (formats.some((f) => f.id === defaultFormat) ? defaultFormat : "wav16"))
  const [name, setName] = useState(() => slugify(savedName ?? sound.recipe.name))
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [copiedUri, setCopiedUri] = useState(false)

  const format = getFormat(formatId) ?? formats[0]
  const { result } = sound
  const frames = result.length
  const ch = result.channels.length

  const doExport = async () => {
    if (busy) return
    setBusy(true)
    setProgress(0)
    try {
      const blob = await format.encode(
        { channels: result.channels, sampleRate: result.sampleRate },
        { title: sound.recipe.name, recipeJson: sound.json, onProgress: setProgress },
      )
      const filename = `${name || "som"}.${format.ext}`
      downloadBlob(blob, filename)
      toast.success(`${filename} salvo`, { description: `${format.label} · ${formatBytes(blob.size)}` })
    } catch (err) {
      console.error(err)
      toast.error("Falha ao exportar", { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
      setProgress(0)
    }
  }

  const copyDataUri = async () => {
    const wav = await getFormat("wav16")!.encode({ channels: result.channels, sampleRate: result.sampleRate }, { title: "", recipeJson: "" })
    if (wav.size > 2_000_000) toast.warning("Data URI grande", { description: `${formatBytes(wav.size)}. Talvez seja melhor baixar o arquivo.` })
    const uri = await blobToDataUri(wav)
    if (await copyText(uri)) {
      setCopiedUri(true)
      setTimeout(() => setCopiedUri(false), 1600)
      toast.success("Data URI copiada", { description: "Use direto em <audio src> ou new Audio(...) no seu código." })
    }
  }

  return (
    <div>
      <div className="space-y-4">
        {GROUPS.map((g) => {
          const list = formats.filter((f) => f.group === g.id)
          if (!list.length) return null
          return (
            <div key={g.id}>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <g.icon className="size-3.5" />
                {g.label}
              </p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {list.map((f) => {
                  const active = f.id === formatId
                  const est = estimateSize(f, frames, ch, result.duration, sound.json.length)
                  return (
                    <motion.button
                      key={f.id}
                      type="button"
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        setFormatId(f.id)
                        setSettings({ defaultFormat: f.id })
                      }}
                      className={cn(
                        "relative flex flex-col items-start rounded-lg border px-3 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-transparent" : "hover:border-foreground/30",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="format-active"
                          className="absolute inset-0 rounded-lg bg-primary/15 ring-2 ring-primary"
                          transition={{ type: "spring", stiffness: 500, damping: 36 }}
                        />
                      )}
                      <span className="relative flex w-full items-center gap-1.5 text-sm font-medium">
                        {f.label}
                        {f.realtime && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <InfoIcon className="ml-auto size-3 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>Gravado em tempo real pelo navegador (leva a duração do som)</TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                      <span className="relative line-clamp-1 text-[11px] text-muted-foreground">{f.description}</span>
                      <span className="relative mt-0.5 text-[11px] text-muted-foreground tabular">
                        {est.exact ? "" : "≈ "}
                        {formatBytes(est.bytes)}
                      </span>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {mixed && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex items-center gap-1.5 overflow-hidden text-xs text-warning"
          >
            <InfoIcon className="size-3.5 shrink-0" />
            Camadas silenciadas não entram no arquivo exportado.
          </motion.p>
        )}
      </AnimatePresence>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]+/g, "-"))}
            className="h-10 pr-16 text-sm"
            aria-label="Nome do arquivo"
          />
          <span className="pointer-events-none absolute right-3 text-sm text-muted-foreground">.{format.ext}</span>
        </div>
        <MotionButton whileTap={{ scale: 0.96 }} onClick={doExport} disabled={busy} className="h-10 min-w-36 gap-2">
          {busy ? (
            <>
              <EqBars />
              {format.realtime ? "Gravando…" : "Codificando…"}
            </>
          ) : (
            <>
              <DownloadIcon />
              Baixar {format.short}
            </>
          )}
        </MotionButton>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Para usar direto no código, copie o áudio como Data URI (WAV em base64).</span>
        <MotionButton variant="outline" size="sm" whileTap={{ scale: 0.95 }} onClick={copyDataUri} className="shrink-0">
          <CopyMorph copied={copiedUri} className="size-3.5 [&_svg]:size-3.5" />
          Copiar Data URI
        </MotionButton>
      </div>
      <AnimatePresence>
        {busy && progress > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2">
            <Progress value={progress * 100} className="h-1" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Janela de exportação do som atual, aberta pelo botão Baixar. */
export function ExportDialog() {
  const open = useUi((s) => s.exportOpen)
  const sound = useStudio((s) => s.current)
  const mixed = useStudio((s) => s.muted.length > 0 || s.solo !== null)
  const savedName = useHistory((s) => s.items.find((i) => i.id === sound?.id)?.name)
  return (
    <Dialog open={open && Boolean(sound)} onOpenChange={(o) => useUi.getState().set({ exportOpen: o })}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Baixar “{savedName ?? sound?.recipe.name}”</DialogTitle>
          <DialogDescription>O formato escolhido vira o padrão do botão Baixar.</DialogDescription>
        </DialogHeader>
        {sound && <ExportPanel key={sound.id} sound={sound} mixed={mixed} name={savedName} />}
      </DialogContent>
    </Dialog>
  )
}
