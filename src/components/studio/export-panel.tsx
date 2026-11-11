"use client"

import { AnimatePresence, motion } from "motion/react"
import { DownloadIcon, FileAudioIcon, FileCode2Icon, InfoIcon, RadioIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { blobToDataUri, downloadBlob, EXPORT_FORMATS, formatBytes, getFormat, slugify, type ExportFormat, type FormatGroup } from "@/lib/audio/export"
import { copyText } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useSettings } from "@/stores/settings"
import type { CurrentSound } from "@/stores/studio"
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

export function ExportPanel({ sound, mixed }: { sound: CurrentSound; mixed: boolean }) {
  const defaultFormat = useSettings((s) => s.defaultFormat)
  const setSettings = useSettings((s) => s.set)
  const formats = useMemo(() => EXPORT_FORMATS.filter((f) => f.available()), [])
  const [formatId, setFormatId] = useState(() => (formats.some((f) => f.id === defaultFormat) ? defaultFormat : "wav16"))
  const [name, setName] = useState(() => slugify(sound.recipe.name))
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
    <div className="rounded-2xl border bg-card/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Exportar</h3>
          <p className="text-xs text-muted-foreground">Escolha o formato e baixe o arquivo</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <MotionButton variant="ghost" size="sm" whileTap={{ scale: 0.95 }} onClick={copyDataUri}>
              <CopyMorph copied={copiedUri} className="size-3.5 [&_svg]:size-3.5" />
              Data URI
            </MotionButton>
          </TooltipTrigger>
          <TooltipContent>Copia o WAV em base64 para colar direto no código</TooltipContent>
        </Tooltip>
      </div>

      <div className="grid gap-x-4 gap-y-3 lg:grid-cols-[2fr_3fr_1fr]">
        {GROUPS.map((g) => {
          const list = formats.filter((f) => f.group === g.id)
          if (!list.length) return null
          return (
            <div key={g.id}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <g.icon className="size-3" />
                {g.label}
              </p>
              <div
                className={cn(
                  "grid gap-1.5",
                  g.id === "recipe" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-1" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-2",
                  g.id === "compressed" && "lg:grid-cols-3",
                )}
              >
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
                        "relative flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                        active ? "border-primary/60" : "hover:border-foreground/20 hover:bg-muted/40",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="format-active"
                          className="absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/50"
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
                      <span className="relative mt-0.5 font-mono text-[10px] text-muted-foreground/80 tabular">
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

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex min-w-0 flex-1 items-center">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/[\\/:*?"<>|]+/g, "-"))}
            className="h-10 pr-16 font-mono text-sm"
            aria-label="Nome do arquivo"
          />
          <span className="pointer-events-none absolute right-3 font-mono text-sm text-muted-foreground">.{format.ext}</span>
        </div>
        <MotionButton whileTap={{ scale: 0.96 }} onClick={doExport} disabled={busy} className="h-10 min-w-36 gap-2 rounded-lg">
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
