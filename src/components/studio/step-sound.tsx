"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  BracesIcon,
  ChevronDownIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  Link2Icon,
  PauseIcon,
  PencilIcon,
  PencilLineIcon,
  PlayIcon,
  PlusIcon,
  Repeat2Icon,
  RotateCcwIcon,
  SkipBackIcon,
  SquareIcon,
  StarIcon,
  Trash2Icon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Slider } from "@/components/ui/slider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsPlaying, useNow, usePlaybackPosition } from "@/hooks/use-playback"
import { quickExport } from "@/lib/audio/bulk"
import { getFormat } from "@/lib/audio/export"
import { player, usePlayer } from "@/lib/audio/player"
import { copyText, formatDb, formatDuration, formatTime, timeAgo } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { generationKindLabel, generationOf, useHistory, type Generation, type HistoryItem } from "@/stores/history"
import { useSettings } from "@/stores/settings"
import {
  copyShareLink,
  editRecipe,
  openHistoryItem,
  removeSounds,
  reuseRequest,
  setLayerMix,
  startNew,
  useStudio,
} from "@/stores/studio"
import { useUi } from "@/stores/ui"
import { EqBars } from "./fx"
import { KIND_ICON } from "./history-sidebar"
import { LayerTimeline } from "./layer-timeline"
import { MiniWave } from "./mini-wave"
import { QuickTweaks } from "./quick-tweaks"
import { RefinePopover } from "./refine-popover"
import { Spectrum } from "./spectrum"
import { Waveform } from "./waveform"

export function PlayButton({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      aria-label={playing ? "Pausar" : "Tocar"}
      className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={playing ? "pause" : "play"}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="grid"
        >
          {playing ? <PauseIcon className="size-5 fill-current" /> : <PlayIcon className="size-5 translate-x-[1px] fill-current" />}
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

/* ------------------------------ O pedido ---------------------------------- */

/** De onde este som veio: o pedido feito à IA, quando e de que tipo. */
function RequestLine({ generation, itemIds }: { generation: Generation; itemIds: string[] }) {
  const [editing, setEditing] = useState(false)
  const now = useNow()
  const Icon = KIND_ICON[generation.kind]
  const text = generation.request.trim()
  const canReuse = Boolean(text) && generation.kind !== "exemplo" && generation.kind !== "link"

  const commit = (value: string) => {
    useHistory.getState().describeGeneration(generation, itemIds, value.trim())
    setEditing(false)
  }

  return (
    <div className="border-l-2 border-primary pl-3">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {generationKindLabel(generation)}, {timeAgo(generation.createdAt, now)}
      </p>
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          defaultValue={generation.request}
          placeholder="O que você pediu à IA?"
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              commit(e.currentTarget.value)
            }
            if (e.key === "Escape") setEditing(false)
          }}
          className="mt-1 w-full max-w-2xl resize-none rounded-md border border-ring bg-background px-2 py-1 text-sm outline-none"
        />
      ) : (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {text && <p className="max-w-2xl text-sm text-foreground/90">“{text}”</p>}
          <span className="flex items-center gap-3 text-xs">
            {canReuse && (
              <button type="button" onClick={() => reuseRequest(text)} className="flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                <RotateCcwIcon className="size-3" />
                Usar de novo
              </button>
            )}
            <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
              <PencilLineIcon className="size-3" />
              {text ? "Editar" : "Anotar o que foi pedido"}
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

/* ------------------------- Os sons do mesmo pedido ------------------------ */

function SiblingCard({ item, index, active }: { item: HistoryItem; index: number; active: boolean }) {
  const playing = useIsPlaying(item.id)
  const isLoaded = usePlayer((s) => s.key === item.id)
  const position = usePlaybackPosition(isLoaded ? item.id : null)
  const loading = useStudio((s) => s.loadingId === item.id)
  const progress = isLoaded && item.duration ? position / item.duration : 0

  return (
    <div
      className={cn(
        "group/card relative flex min-w-0 items-center gap-3 rounded-lg border bg-card p-2.5 transition-colors",
        active ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
      )}
    >
      <button
        type="button"
        onClick={() => void openHistoryItem(item, { play: true })}
        aria-pressed={active}
        aria-label={`Abrir ${item.name}`}
        className="absolute inset-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span
        className={cn(
          "pointer-events-none grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold tabular",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {loading || playing ? <EqBars className="h-3" bars={3} /> : index + 1}
      </span>
      <div className="pointer-events-none min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">{item.name}</p>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular">{formatDuration(item.duration)}</span>
        </div>
        <MiniWave peaks={item.peaks} progress={progress} className="mt-1 h-4 text-foreground" />
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => useHistory.getState().toggleFavorite(item.id)}
            aria-label={item.favorite ? `Remover ${item.name} dos favoritos` : `Favoritar ${item.name}`}
            className="relative grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StarIcon className={cn("size-4", item.favorite && "fill-warning text-warning")} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{item.favorite ? "Remover dos favoritos" : "Marcar como favorito"}</TooltipContent>
      </Tooltip>
    </div>
  )
}

function Siblings({ items, currentId }: { items: HistoryItem[]; currentId: string }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-medium">Os {items.length} sons deste pedido</h3>
      <p className="text-xs text-muted-foreground">Clique para ouvir e comparar. A estrela marca os que você quer guardar.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <SiblingCard key={item.id} item={item} index={i} active={item.id === currentId} />
        ))}
      </div>
    </section>
  )
}

/* --------------------------------- Página --------------------------------- */

function Meta({ children }: { children: React.ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

export function StepSound() {
  const current = useStudio((s) => s.current)
  const muted = useStudio((s) => s.muted)
  const solo = useStudio((s) => s.solo)
  const rerendering = useStudio((s) => s.rerendering)
  const setStep = useStudio((s) => s.setStep)
  const items = useHistory((s) => s.items)
  const generations = useHistory((s) => s.generations)
  const defaultFormat = useSettings((s) => s.defaultFormat)
  const loop = usePlayer((s) => s.loop)
  const setLoop = usePlayer((s) => s.setLoop)
  const playing = useIsPlaying(current?.id)
  const position = usePlaybackPosition(current?.id)
  const isActive = usePlayer((s) => Boolean(current) && s.key === current?.id)
  const [renaming, setRenaming] = useState(false)

  const historyItem = useMemo(() => items.find((i) => i.id === current?.id), [items, current?.id])
  const generation = useMemo(() => (historyItem ? generationOf(historyItem, generations) : null), [historyItem, generations])
  const batch = historyItem?.batch
  const siblings = useMemo(
    () => (batch ? items.filter((i) => i.batch === batch).sort((a, b) => b.createdAt - a.createdAt) : []),
    [items, batch],
  )

  if (!current) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <h2 className="display text-2xl">Nenhum som aberto</h2>
        <p className="mt-2 max-w-md text-muted-foreground">Escolha um som no histórico ou comece um novo. O player aparece aqui.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={startNew}>
            <PlusIcon />
            Novo som
          </Button>
          <Button variant="outline" onClick={() => setStep(2)}>
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
  const format = getFormat(defaultFormat) ?? getFormat("wav16")!
  const togglePlay = () => {
    if (player.key === current.id) void player.toggle(current.id, result)
    else void player.play(current.id, result, 0)
  }
  const seek = (t: number) => {
    if (player.key !== current.id) void player.play(current.id, result, t)
    else void player.seek(t)
  }
  const commitRename = (value: string) => {
    const next = value.trim()
    if (next && next !== name) useHistory.getState().update(current.id, { name: next })
    setRenaming(false)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      {generation && <RequestLine key={generation.id} generation={generation} itemIds={siblings.length ? siblings.map((s) => s.id) : [current.id]} />}

      <header className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-8">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              defaultValue={name}
              onBlur={(e) => commitRename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename(e.currentTarget.value)
                if (e.key === "Escape") setRenaming(false)
              }}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Nome do som"
              className="display w-full rounded-md border border-ring bg-background px-2 text-2xl outline-none sm:text-3xl"
            />
          ) : (
            <h2 className="display text-2xl leading-tight text-balance sm:text-3xl">
              {name}
              {historyItem?.favorite && <StarIcon className="mb-1 ml-2 inline size-5 fill-warning text-warning" />}
            </h2>
          )}
          {recipe.description && <p className="mt-1.5 max-w-2xl text-muted-foreground">{recipe.description}</p>}
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground tabular">
            <Meta>{formatDuration(result.duration)}</Meta>
            <Meta>{result.channels.length === 1 ? "Mono" : "Estéreo"}</Meta>
            <Meta>{(result.sampleRate / 1000).toLocaleString("pt-BR")} kHz</Meta>
            <Meta>
              {recipe.layers.length} {recipe.layers.length === 1 ? "camada" : "camadas"}
            </Meta>
            <Meta>pico {formatDb(result.peakDb)}</Meta>
            {recipe.tags?.slice(0, 5).map((t) => (
              <Meta key={t}>#{t}</Meta>
            ))}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <RefinePopover key={current.id} json={current.json} name={name} />
          <div className="flex">
            <Button
              className="gap-2 rounded-r-none"
              onClick={() => (historyItem ? void quickExport(historyItem, format.id) : useUi.getState().set({ exportOpen: true }))}
            >
              <DownloadIcon />
              Baixar {format.short}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  className="rounded-l-none border-l border-l-primary-foreground/25"
                  aria-label="Escolher formato e nome do arquivo"
                  onClick={() => useUi.getState().set({ exportOpen: true })}
                >
                  <ChevronDownIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Outros formatos: FLAC, MP3, AIFF, JSON</TooltipContent>
            </Tooltip>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="Mais ações deste som">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => editRecipe(current.json, name)}>
                <BracesIcon />
                Editar receita
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  if (await copyText(current.json)) toast.success("Receita copiada")
                }}
              >
                <CopyIcon />
                Copiar receita
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyShareLink(current.json)}>
                <Link2Icon />
                Copiar link
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setTimeout(() => setRenaming(true), 50)}>
                <PencilIcon />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => useHistory.getState().toggleFavorite(current.id)}>
                <StarIcon />
                {historyItem?.favorite ? "Remover dos favoritos" : "Favoritar"}
              </DropdownMenuItem>
              {historyItem && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => removeSounds([historyItem])}>
                    <Trash2Icon />
                    Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {siblings.length > 1 && <Siblings items={siblings} currentId={current.id} />}

      {/* Deck: visor escuro com a onda, depois os controles */}
      <section className="mt-6 overflow-hidden rounded-xl border bg-card" aria-label="Player">
        <div className="bg-deck p-4 text-deck-foreground sm:p-5">
          <Waveform
            className="h-28 sm:h-40"
            channels={result.channels}
            duration={result.duration}
            position={shownPosition}
            playing={playing}
            onSeek={seek}
            version={`${current.id}-${result.renderMs}`}
          />
          <div className="mt-3 flex items-end justify-between gap-4">
            <p className="font-pixel text-2xl leading-none tabular sm:text-3xl" aria-label="Posição">
              {formatTime(shownPosition)}
              <span className="ml-2 text-base text-deck-muted sm:text-lg">{formatTime(result.duration)}</span>
            </p>
            <div className="hidden h-9 w-44 sm:block">
              <Spectrum active={playing} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-3 p-3 sm:px-5 sm:py-4">
          <PlayButton playing={playing} onClick={togglePlay} />
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
            <TooltipContent>Parar (Esc)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={loop}
                aria-label="Repetir em loop"
                onClick={() => setLoop(!loop)}
                className={cn(loop && "bg-primary/15 text-brand hover:bg-primary/20 hover:text-brand")}
              >
                <Repeat2Icon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{loop ? "Parar de repetir" : "Repetir em loop"}</TooltipContent>
          </Tooltip>
          {rerendering && (
            <span className="flex items-center gap-1.5 text-xs text-brand">
              <EqBars className="h-3" /> Atualizando
            </span>
          )}
          <div className="ml-auto">
            <VolumeControl />
          </div>
        </div>

        <div className="px-3 pb-3 sm:px-5 sm:pb-4">
          <QuickTweaks key={current.id} recipe={recipe} />
        </div>
      </section>

      <div className="mt-4">
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
    </div>
  )
}
