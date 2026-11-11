"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  ActivityIcon,
  BracesIcon,
  ClockIcon,
  CopyIcon,
  Gauge,
  LayersIcon,
  Link2Icon,
  PauseIcon,
  PlayIcon,
  RadioTowerIcon,
  Repeat2Icon,
  SkipBackIcon,
  SparklesIcon,
  SquareIcon,
  TimerIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
  WavesIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsPlaying, usePlaybackPosition } from "@/hooks/use-playback"
import { player, usePlayer } from "@/lib/audio/player"
import { copyText, formatDb, formatDuration, formatTime } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useHistory } from "@/stores/history"
import { copyShareLink, editRecipe, setLayerMix, useStudio } from "@/stores/studio"
import { ExportPanel } from "./export-panel"
import { EqBars, MotionButton } from "./fx"
import { LayerTimeline } from "./layer-timeline"
import { QuickTweaks } from "./quick-tweaks"
import { RefinePopover } from "./refine-popover"
import { VariationTabs } from "./variation-tabs"
import { Spectrum } from "./spectrum"
import { Waveform } from "./waveform"

function Stat({ icon: Icon, label, value, delay }: { icon: typeof ClockIcon; label: string; value: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 300, damping: 28 }}
      className="rounded-xl border bg-card/60 px-3 py-2.5"
    >
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </p>
      <p className="mt-0.5 truncate font-mono text-sm font-medium tabular">{value}</p>
    </motion.div>
  )
}

export function PlayButton({ playing, onClick, size = "lg" }: { playing: boolean; onClick: () => void; size?: "lg" | "sm" }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      whileHover={{ scale: 1.04 }}
      aria-label={playing ? "Pausar" : "Tocar"}
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-6px_var(--primary)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        size === "lg" ? "size-14" : "size-9",
      )}
    >
      {playing && (
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-primary"
          initial={{ scale: 1, opacity: 0.6 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 1.4, ease: "easeOut" }}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          initial={{ scale: 0.3, opacity: 0, rotate: -30 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          exit={{ scale: 0.3, opacity: 0, rotate: 30 }}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          className="grid"
        >
          {playing ? (
            <PauseIcon className={cn("fill-current", size === "lg" ? "size-6" : "size-4")} />
          ) : (
            <PlayIcon className={cn("translate-x-[1px] fill-current", size === "lg" ? "size-6" : "size-4")} />
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  )
}

function VolumeControl() {
  const volume = usePlayer((s) => s.volume)
  const setVolume = usePlayer((s) => s.setVolume)
  const [last, setLast] = useState(0.85)
  const Icon = volume === 0 ? VolumeXIcon : volume < 0.5 ? Volume1Icon : Volume2Icon
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={volume === 0 ? "Ativar som" : "Silenciar"}
        onClick={() => {
          if (volume === 0) setVolume(last || 0.85)
          else {
            setLast(volume)
            setVolume(0)
          }
        }}
      >
        <Icon />
      </Button>
      <Slider value={[volume * 100]} max={100} step={1} onValueChange={([v]) => setVolume(v / 100)} className="w-20 sm:w-24" aria-label="Volume" />
    </div>
  )
}

export function StepSound() {
  const current = useStudio((s) => s.current)
  const muted = useStudio((s) => s.muted)
  const solo = useStudio((s) => s.solo)
  const rerendering = useStudio((s) => s.rerendering)
  const setStep = useStudio((s) => s.setStep)
  const historyItem = useHistory((s) => s.items.find((i) => i.id === current?.id))
  const loop = usePlayer((s) => s.loop)
  const setLoop = usePlayer((s) => s.setLoop)
  const playing = useIsPlaying(current?.id)
  const position = usePlaybackPosition(current?.id)
  const isActive = usePlayer((s) => Boolean(current) && s.key === current?.id)

  if (!current) {
    return (
      <div className="grid h-full place-items-center p-6">
        <div className="flex max-w-sm flex-col items-center text-center">
          <motion.div animate={{ rotate: [0, 6, -6, 0] }} transition={{ repeat: Infinity, duration: 4 }} className="grid size-14 place-items-center rounded-2xl bg-muted">
            <WavesIcon className="size-7 text-muted-foreground" />
          </motion.div>
          <p className="mt-4 font-medium">Nenhum som carregado</p>
          <p className="mt-1 text-sm text-muted-foreground">Gere um som a partir de uma receita ou abra um item do histórico.</p>
          <Button className="mt-4" onClick={() => setStep(2)}>
            <BracesIcon />
            Colar uma receita
          </Button>
        </div>
      </div>
    )
  }

  const { recipe, result } = current
  const name = historyItem?.name ?? recipe.name
  const shownPosition = isActive ? position : 0
  const togglePlay = () => {
    if (player.key === current.id) void player.toggle(current.id, result)
    else void player.play(current.id, result, 0)
  }
  const seek = (t: number) => {
    if (player.key !== current.id) void player.play(current.id, result, t)
    else void player.seek(t)
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 py-5 sm:px-5 sm:py-7">
      {/* Título */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <motion.h2
            key={current.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="truncate text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {name}
          </motion.h2>
          {recipe.description && <p className="mt-1 text-muted-foreground">{recipe.description}</p>}
          {recipe.tags && recipe.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {recipe.tags.map((t) => (
                <Badge key={t} variant="outline" className="text-muted-foreground">
                  #{t}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => editRecipe(current.json)}>
            <BracesIcon />
            Editar receita
          </Button>
          <RefinePopover key={current.id} json={current.json} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="Copiar link da receita" onClick={() => void copyShareLink(current.json)}>
                <Link2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar link para compartilhar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Copiar receita"
                onClick={async () => {
                  if (await copyText(current.json)) toast.success("Receita copiada")
                }}
              >
                <CopyIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copiar receita JSON</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <VariationTabs currentId={current.id} />

      {/* Player */}
      <motion.div
        layout
        className="relative overflow-hidden rounded-2xl border bg-card/80 p-4 shadow-[0_30px_80px_-40px_color-mix(in_oklch,var(--brand)_55%,transparent)] backdrop-blur-sm sm:p-5"
      >
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklch,var(--brand)_18%,transparent),transparent)]" />
        <Waveform
          className="h-32 sm:h-44"
          channels={result.channels}
          duration={result.duration}
          position={shownPosition}
          playing={playing}
          onSeek={seek}
          version={`${current.id}-${result.renderMs}`}
        />

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-3">
          <PlayButton playing={playing} onClick={togglePlay} />
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Voltar ao início" onClick={() => seek(0)}>
                  <SkipBackIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Voltar ao início</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Parar" onClick={() => player.stop()}>
                  <SquareIcon className="fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Parar <span className="opacity-60">(Esc)</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-pressed={loop}
                  aria-label="Repetir"
                  onClick={() => setLoop(!loop)}
                  className={cn(loop && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary")}
                >
                  <motion.span animate={{ rotate: loop ? 180 : 0 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} className="grid">
                    <Repeat2Icon />
                  </motion.span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Repetir em loop</TooltipContent>
            </Tooltip>
          </div>
          <div className="font-mono text-sm tabular">
            <span className="text-foreground">{formatTime(shownPosition)}</span>
            <span className="text-muted-foreground"> / {formatTime(result.duration)}</span>
          </div>
          {rerendering && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <EqBars className="h-3" /> Remixando…
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <VolumeControl />
            <div className="hidden h-10 w-36 sm:block md:w-44">
              <Spectrum active={playing} />
            </div>
          </div>
        </div>
        <QuickTweaks key={current.id} recipe={recipe} />
      </motion.div>

      {/* Estatísticas */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={ClockIcon} label="Duração" value={formatDuration(result.duration)} delay={0.02} />
        <Stat icon={ActivityIcon} label="Pico" value={formatDb(result.peakDb)} delay={0.05} />
        <Stat icon={Gauge} label="RMS" value={formatDb(result.rmsDb)} delay={0.08} />
        <Stat icon={RadioTowerIcon} label="Amostragem" value={`${(result.sampleRate / 1000).toLocaleString("pt-BR")} kHz`} delay={0.11} />
        <Stat icon={LayersIcon} label="Canais · camadas" value={`${result.channels.length === 1 ? "Mono" : "Estéreo"} · ${recipe.layers.length}`} delay={0.14} />
        <Stat icon={TimerIcon} label="Síntese" value={`${Math.max(1, Math.round(result.renderMs))} ms`} delay={0.17} />
      </div>

      <div className="grid gap-4">
        <div>
          <LayerTimeline
            recipe={recipe}
            spans={result.spans}
            duration={result.duration}
            position={shownPosition}
            showPlayhead={isActive && (playing || shownPosition > 0)}
            muted={muted}
            solo={solo}
            busy={rerendering}
            onMix={(m, s) => void setLayerMix(m, s)}
            onSeek={seek}
          />
        </div>
        <div>
          <ExportPanel key={current.id} sound={current} mixed={muted.length > 0 || solo !== null} />
        </div>
      </div>

      <div className="flex justify-center pt-2 pb-6">
        <MotionButton variant="ghost" whileTap={{ scale: 0.96 }} onClick={() => setStep(1)} className="text-muted-foreground">
          <SparklesIcon />
          Criar outro som
        </MotionButton>
      </div>
    </div>
  )
}
