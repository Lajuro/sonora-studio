"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  ArchiveIcon,
  ArrowDownUpIcon,
  BookOpenIcon,
  BracesIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FileDownIcon,
  FileUpIcon,
  FolderIcon,
  FolderPlusIcon,
  Link2Icon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PauseIcon,
  PencilIcon,
  PencilLineIcon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useIsPlaying, useNow, usePlaybackPosition } from "@/hooks/use-playback"
import { exportAllZip, exportBackup, quickExport, readBackup } from "@/lib/audio/bulk"
import { player, usePlayer } from "@/lib/audio/player"
import { copyText, formatDuration, isMac, timeAgo } from "@/lib/helpers"
import { buildLibrary, type LibraryFilter, type LibraryGroup } from "@/lib/library"
import { cn } from "@/lib/utils"
import { generationKindLabel, useHistory, type Generation, type GenerationKind, type HistoryItem } from "@/stores/history"
import { useSettings, type GroupBy, type SortBy } from "@/stores/settings"
import {
  copyShareLink,
  editRecipe,
  openHistoryItem,
  removeSounds,
  reuseRequest,
  startNew,
  toggleHistoryPlayback,
  useStudio,
} from "@/stores/studio"
import { commands, useUi } from "@/stores/ui"
import { Burst, EqBars } from "./fx"
import { Logo, LogoMark } from "./logo"
import { MiniWave } from "./mini-wave"

const QUICK_FORMATS = [
  { id: "wav16", label: "WAV 16-bit" },
  { id: "flac", label: "FLAC" },
  { id: "mp3-192", label: "MP3 192 kbps" },
  { id: "aiff", label: "AIFF" },
  { id: "json", label: "Receita JSON" },
]

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: "geracao", label: "Pedido" },
  { id: "data", label: "Data" },
  { id: "colecao", label: "Coleção" },
  { id: "etiqueta", label: "Etiqueta" },
  { id: "nenhum", label: "Sem grupos" },
]

const SORT_OPTIONS: { id: SortBy; label: string }[] = [
  { id: "recentes", label: "Mais recentes" },
  { id: "antigos", label: "Mais antigos" },
  { id: "nome", label: "Nome, de A a Z" },
  { id: "curtos", label: "Mais curtos" },
  { id: "longos", label: "Mais longos" },
]

export const KIND_ICON: Record<GenerationKind, LucideIcon> = {
  novo: SparklesIcon,
  ajuste: SlidersHorizontalIcon,
  exemplo: BookOpenIcon,
  link: Link2Icon,
  edicao: BracesIcon,
  manual: ClipboardIcon,
}

/* ----------------------------- Mover para coleção ------------------------- */

function MoveToMenu({ ids, currentId }: { ids: string[]; currentId?: string }) {
  const collections = useHistory((s) => s.collections)
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderIcon />
        Mover para
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        {collections.map((c) => (
          <DropdownMenuItem key={c.id} disabled={currentId === c.id} onSelect={() => useHistory.getState().moveToCollection(ids, c.id)}>
            <span className="size-2.5 rounded-full" style={{ background: c.color }} />
            <span className="truncate">{c.name}</span>
          </DropdownMenuItem>
        ))}
        {collections.length > 0 && <DropdownMenuSeparator />}
        <DropdownMenuItem onSelect={() => useUi.getState().set({ collectionDialog: { mode: "criar", moveIds: ids } })}>
          <FolderPlusIcon />
          Nova coleção
        </DropdownMenuItem>
        {currentId && (
          <DropdownMenuItem onSelect={() => useHistory.getState().moveToCollection(ids, null)}>
            <XIcon />
            Tirar da coleção
          </DropdownMenuItem>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/* --------------------------------- Um som --------------------------------- */

const SoundRow = memo(function SoundRow({
  item,
  selected,
  collectionColor,
}: {
  item: HistoryItem
  selected: boolean
  collectionColor?: string
}) {
  const playing = useIsPlaying(item.id)
  const isLoaded = usePlayer((s) => s.key === item.id)
  const position = usePlaybackPosition(isLoaded ? item.id : null)
  const loading = useStudio((s) => s.loadingId === item.id)
  const renaming = useUi((s) => s.renameId === item.id)
  const [menuOpen, setMenuOpen] = useState(false)
  const [burst, setBurst] = useState(0)
  const progress = isLoaded && item.duration ? position / item.duration : 0

  const commitRename = (value: string) => {
    const name = value.trim()
    if (name && name !== item.name) useHistory.getState().update(item.id, { name })
    useUi.getState().set({ renameId: null })
  }
  const open = () => !renaming && void openHistoryItem(item, { step: 3 })

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      className="overflow-hidden"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={open}
        onKeyDown={(e) => {
          if (renaming) return
          if (e.key === "Enter") open()
          if (e.key === " ") {
            e.preventDefault()
            e.stopPropagation()
            void toggleHistoryPlayback(item)
          }
          if (e.key === "Delete") removeSounds([item])
          if (e.key === "F2") useUi.getState().set({ renameId: item.id })
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
        className={cn(
          "group/row relative flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pr-2 pl-2 outline-none transition-colors",
          "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          selected && "bg-sidebar-accent",
        )}
      >
        {selected && <motion.span layoutId="history-selected" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary" />}
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={(e) => {
            e.stopPropagation()
            void toggleHistoryPlayback(item)
          }}
          aria-label={playing ? `Pausar ${item.name}` : `Tocar ${item.name}`}
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full border transition-colors",
            playing
              ? "border-primary bg-primary text-primary-foreground"
              : "border-sidebar-border bg-background text-foreground hover:border-foreground/40",
          )}
        >
          {loading ? (
            <EqBars className="h-2.5" bars={3} />
          ) : playing ? (
            <>
              <EqBars className="h-2.5 group-hover/row:hidden" bars={3} />
              <PauseIcon className="hidden size-3 fill-current group-hover/row:block" />
            </>
          ) : (
            <PlayIcon className="size-3 translate-x-px fill-current" />
          )}
        </motion.button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {collectionColor && <span className="size-1.5 shrink-0 rounded-full" style={{ background: collectionColor }} />}
            {renaming ? (
              <input
                autoFocus
                defaultValue={item.name}
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => commitRename(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === "Enter") commitRename(e.currentTarget.value)
                  if (e.key === "Escape") useUi.getState().set({ renameId: null })
                }}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-sm border border-ring bg-background px-1 text-[13px] outline-none"
              />
            ) : (
              <p className="truncate text-[13px] font-medium" title={item.name}>
                {item.name}
              </p>
            )}
            {item.favorite && <StarIcon className="size-3 shrink-0 fill-warning text-warning" />}
            <span className="ml-auto shrink-0 pl-1 text-[11px] text-muted-foreground tabular">{formatDuration(item.duration)}</span>
          </div>
          <MiniWave peaks={item.peaks} progress={progress} active={selected} className="mt-0.5 h-3 text-foreground" />
        </div>

        <div
          className={cn(
            "absolute inset-y-0 right-1 flex items-center gap-0.5 rounded-md bg-sidebar-accent pl-1 transition-opacity",
            menuOpen ? "opacity-100" : "opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
          )}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            className="relative"
            aria-label={item.favorite ? "Remover dos favoritos" : "Favoritar"}
            onClick={(e) => {
              e.stopPropagation()
              if (!item.favorite) setBurst((b) => b + 1)
              useHistory.getState().toggleFavorite(item.id)
            }}
          >
            <StarIcon className={cn(item.favorite && "fill-warning text-warning")} />
            <Burst trigger={burst} color="var(--warning)" />
          </Button>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Mais ações de ${item.name}`} onClick={(e) => e.stopPropagation()}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onSelect={() => void toggleHistoryPlayback(item)}>
                {playing ? <PauseIcon /> : <PlayIcon />}
                {playing ? "Pausar" : "Tocar"}
                <DropdownMenuShortcut>Espaço</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => useUi.getState().set({ renameId: item.id })}>
                <PencilIcon />
                Renomear
                <DropdownMenuShortcut>F2</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => useHistory.getState().toggleFavorite(item.id)}>
                <StarIcon />
                {item.favorite ? "Remover dos favoritos" : "Favoritar"}
              </DropdownMenuItem>
              <MoveToMenu ids={[item.id]} currentId={item.collectionId} />
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editRecipe(item.json, item.name)}>
                <BracesIcon />
                Editar receita
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={async () => {
                  if (await copyText(item.json)) toast.success("Receita copiada")
                }}
              >
                <CopyIcon />
                Copiar receita
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void copyShareLink(item.json)}>
                <Link2Icon />
                Copiar link
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <DownloadIcon />
                  Baixar como
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {QUICK_FORMATS.map((f) => (
                    <DropdownMenuItem key={f.id} onSelect={() => void quickExport(item, f.id)}>
                      {f.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => removeSounds([item])}>
                <Trash2Icon />
                Excluir
                <DropdownMenuShortcut>Del</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.li>
  )
})

/* ------------------------------ Cabeçalhos -------------------------------- */

function generationMeta(g: Generation, now: number) {
  const when = timeAgo(g.createdAt, now)
  if (!g.request.trim() || g.kind === "novo" || g.kind === "manual") return when
  return `${generationKindLabel(g)}, ${when}`
}

function GenerationHeader({
  group,
  open,
  onToggle,
  now,
}: {
  group: LibraryGroup
  open: boolean
  onToggle: () => void
  now: number
}) {
  const g = group.generation!
  const editing = useUi((s) => s.editGenerationId === g.id)
  const hasRequest = Boolean(g.request.trim())
  const Icon = KIND_ICON[g.kind]
  const ids = group.items.map((i) => i.id)

  const commit = (value: string) => {
    useHistory.getState().describeGeneration(g, ids, value.trim())
    useUi.getState().set({ editGenerationId: null })
  }

  return (
    <div className="group/gen flex items-start gap-1 pt-2 pr-1 pb-0.5 pl-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Recolher pedido" : "Expandir pedido"}
        className="mt-px grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {editing ? (
        <textarea
          autoFocus
          rows={2}
          defaultValue={g.request}
          placeholder="O que você pediu à IA?"
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              commit(e.currentTarget.value)
            }
            if (e.key === "Escape") useUi.getState().set({ editGenerationId: null })
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 resize-none rounded-sm border border-ring bg-background px-1.5 py-1 text-[13px] leading-snug outline-none"
        />
      ) : (
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left outline-none" title={hasRequest ? g.request : undefined}>
          {hasRequest ? (
            <>
              <p className="line-clamp-2 text-[13px] leading-snug">
                <Icon className="mr-1 mb-0.5 inline size-3 text-muted-foreground" />
                {group.label}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {generationMeta(g, now)}
                {group.items.length > 1 && `, ${group.items.length} sons`}
              </p>
            </>
          ) : (
            // sem pedido anotado: uma linha só, discreta
            <p className="flex items-baseline gap-1 pt-px text-xs text-muted-foreground">
              <Icon className="size-3 shrink-0 self-center" />
              <span className="truncate">{group.label}</span>
              <span className="ml-auto shrink-0 pl-2 text-[11px] tabular">
                {timeAgo(g.createdAt, now)}
                {group.items.length > 1 && `, ${group.items.length} sons`}
              </span>
            </p>
          )}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Ações do pedido"
            className="opacity-0 group-focus-within/gen:opacity-100 group-hover/gen:opacity-100 aria-expanded:opacity-100"
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {hasRequest && g.kind !== "exemplo" && g.kind !== "link" && (
            <DropdownMenuItem onSelect={() => reuseRequest(g.request)}>
              <RotateCcwIcon />
              Usar este pedido de novo
            </DropdownMenuItem>
          )}
          {hasRequest && (
            <DropdownMenuItem
              onSelect={async () => {
                if (await copyText(g.request)) toast.success("Pedido copiado")
              }}
            >
              <CopyIcon />
              Copiar pedido
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => useUi.getState().set({ editGenerationId: g.id })}>
            <PencilLineIcon />
            {hasRequest ? "Editar o texto do pedido" : "Anotar o que foi pedido"}
          </DropdownMenuItem>
          <MoveToMenu ids={ids} />
          <DropdownMenuItem onSelect={() => void exportAllZip(group.items, "wav16", hasRequest ? g.request.slice(0, 40) : group.items[0].name)}>
            <ArchiveIcon />
            Baixar {group.items.length > 1 ? `os ${group.items.length} sons` : "o som"} (.zip)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => removeSounds(group.items)}>
            <Trash2Icon />
            Excluir {group.items.length > 1 ? `os ${group.items.length} sons` : "o som"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function PlainHeader({ group, open, onToggle }: { group: LibraryGroup; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-1 rounded-sm pt-2.5 pr-2 pb-1 pl-1.5 text-left text-xs font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
    >
      <span className="grid size-5 place-items-center">
        <ChevronRightIcon className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </span>
      {group.collection && <span className="mr-1 size-2 rounded-full" style={{ background: group.collection.color }} />}
      <span className="truncate">{group.label}</span>
      <span className="ml-auto tabular">{group.items.length}</span>
    </button>
  )
}

/* ------------------------------ Filtros (chips) --------------------------- */

function Chip({
  active,
  onClick,
  children,
  count,
  trailing,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count: number
  trailing?: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full border text-xs transition-colors",
        active ? "border-foreground bg-foreground text-background" : "border-sidebar-border text-muted-foreground hover:text-foreground",
      )}
    >
      <button type="button" onClick={onClick} aria-pressed={active} className="flex h-full items-center gap-1.5 rounded-full pr-2 pl-2 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
        {children}
        <span className={cn("tabular", active ? "opacity-70" : "opacity-60")}>{count}</span>
      </button>
      {trailing}
    </span>
  )
}

function FilterChips({ filter, setFilter }: { filter: LibraryFilter; setFilter: (f: LibraryFilter) => void }) {
  const items = useHistory((s) => s.items)
  const collections = useHistory((s) => s.collections)
  const counts = useMemo(() => {
    const byCollection = new Map<string, number>()
    let fav = 0
    for (const i of items) {
      if (i.favorite) fav++
      if (i.collectionId) byCollection.set(i.collectionId, (byCollection.get(i.collectionId) ?? 0) + 1)
    }
    return { fav, byCollection }
  }, [items])

  return (
    <div className="flex flex-wrap gap-1 px-3 pb-2">
      <Chip active={filter === "todos"} onClick={() => setFilter("todos")} count={items.length}>
        Todos
      </Chip>
      <Chip active={filter === "favoritos"} onClick={() => setFilter(filter === "favoritos" ? "todos" : "favoritos")} count={counts.fav}>
        <StarIcon className="size-3" />
        Favoritos
      </Chip>
      {collections.map((c) => {
        const active = filter === c.id
        return (
          <Chip
            key={c.id}
            active={active}
            onClick={() => setFilter(active ? "todos" : c.id)}
            count={counts.byCollection.get(c.id) ?? 0}
            trailing={
              active && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" aria-label={`Opções da coleção ${c.name}`} className="mr-1 grid size-4 place-items-center rounded-full outline-none hover:bg-background/20 focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                      <EllipsisIcon className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onSelect={() => useUi.getState().set({ collectionDialog: { mode: "renomear", id: c.id } })}>
                      <PencilIcon />
                      Editar coleção
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        useHistory.getState().removeCollection(c.id)
                        setFilter("todos")
                        toast(`Coleção “${c.name}” excluída`, { description: "Os sons continuam no histórico." })
                      }}
                    >
                      <Trash2Icon />
                      Excluir coleção
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            }
          >
            <span className="size-2 rounded-full" style={{ background: c.color }} />
            <span className="max-w-28 truncate">{c.name}</span>
          </Chip>
        )
      })}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => useUi.getState().set({ collectionDialog: { mode: "criar" } })}
            aria-label="Nova coleção"
            className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-sidebar-border px-2 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <PlusIcon className="size-3" />
            {collections.length === 0 && "Coleção"}
          </button>
        </TooltipTrigger>
        <TooltipContent>Criar uma coleção para juntar sons</TooltipContent>
      </Tooltip>
    </div>
  )
}

/* ------------------------------- Tocando agora ---------------------------- */

function NowPlaying() {
  const key = usePlayer((s) => s.key)
  const item = useHistory((s) => s.items.find((i) => i.id === key))
  const playing = useIsPlaying(key)
  const position = usePlaybackPosition(key)
  if (!item) return null
  const progress = item.duration ? position / item.duration : 0
  return (
    <div className="shrink-0 border-t border-sidebar-border">
      <div className="h-0.5 bg-sidebar-accent">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => void toggleHistoryPlayback(item)}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          aria-label={playing ? "Pausar" : "Tocar"}
        >
          {playing ? <PauseIcon className="size-3 fill-current" /> : <PlayIcon className="size-3 translate-x-px fill-current" />}
        </button>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void openHistoryItem(item, { step: 3 })}>
          <p className="truncate text-xs font-medium">{item.name}</p>
          <p className="text-[11px] text-muted-foreground">{playing ? "Tocando agora" : "Pausado"}</p>
        </button>
        {playing && <EqBars className="h-3 text-brand" />}
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => player.stop()} aria-label="Parar">
          <XIcon className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ Barra recolhida --------------------------- */

function CollapsedRail({ onExpand }: { onExpand: () => void }) {
  const items = useHistory((s) => s.items)
  const playingKey = usePlayer((s) => (s.playing ? s.key : null))
  const mod = isMac() ? "⌘" : "Ctrl"
  return (
    <div className="flex h-full flex-col items-center gap-2 bg-sidebar py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={onExpand} aria-label="Mostrar histórico">
            <LogoMark active={Boolean(playingKey)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Mostrar histórico <Kbd className="ml-1">{mod} B</Kbd>
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onExpand} aria-label="Mostrar histórico">
            <PanelLeftOpenIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Mostrar histórico ({items.length})</TooltipContent>
      </Tooltip>
      <div className="mt-1 flex w-full flex-1 flex-col items-center gap-1.5 overflow-hidden">
        {items.slice(0, 12).map((item) => (
          <Tooltip key={item.id}>
            <TooltipTrigger asChild>
              <motion.button
                type="button"
                layout
                whileTap={{ scale: 0.88 }}
                onClick={() => void toggleHistoryPlayback(item)}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition-colors",
                  playingKey === item.id ? "border-primary bg-primary text-primary-foreground" : "border-sidebar-border bg-background hover:border-foreground/40",
                )}
              >
                {playingKey === item.id ? <EqBars className="h-2.5" bars={3} /> : item.name.slice(0, 2).toUpperCase()}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------- Sidebar -------------------------------- */

export function HistorySidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const items = useHistory((s) => s.items)
  const generations = useHistory((s) => s.generations)
  const collections = useHistory((s) => s.collections)
  const currentId = useStudio((s) => s.current?.id)
  const groupBy = useSettings((s) => s.groupBy)
  const sortBy = useSettings((s) => s.sortBy)
  const setSettings = useSettings((s) => s.set)
  const [query, setQuery] = useState("")
  const [filterRaw, setFilter] = useState<LibraryFilter>("todos")
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const now = useNow()
  const anyPlaying = usePlayer((s) => s.playing)
  const mod = isMac() ? "⌘" : "Ctrl"

  // se a coleção filtrada foi excluída, volta para "Todos"
  const filter: LibraryFilter =
    filterRaw === "todos" || filterRaw === "favoritos" || collections.some((c) => c.id === filterRaw) ? filterRaw : "todos"

  useEffect(() => {
    commands.focusSearch = () => searchRef.current?.focus()
  }, [])

  const groups = useMemo(
    () => buildLibrary({ items, generations, collections, query, filter, groupBy, sortBy }),
    [items, generations, collections, query, filter, groupBy, sortBy],
  )
  const shown = groups.reduce((n, g) => n + g.items.length, 0)
  const collectionColor = useMemo(() => new Map(collections.map((c) => [c.id, c.color])), [collections])
  const filtering = Boolean(query) || filter !== "todos"

  if (collapsed) return <CollapsedRail onExpand={onToggle} />

  const toggleGroup = (key: string) =>
    setClosed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <Logo active={anyPlaying} />
        <div className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Backup e ações do histórico">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "som" : "sons"} neste navegador
              </DropdownMenuLabel>
              <DropdownMenuItem disabled={!shown} onSelect={() => void exportAllZip(groups.flatMap((g) => g.items))}>
                <ArchiveIcon />
                Baixar {filtering ? "os sons filtrados" : "todos os sons"} (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!items.length} onSelect={() => exportBackup()}>
                <FileDownIcon />
                Exportar backup (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => importInput.current?.click()}>
                <FileUpIcon />
                Importar backup
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={!items.length} onSelect={() => setConfirmClear(true)}>
                <Trash2Icon />
                Limpar histórico
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label="Recolher histórico">
                <PanelLeftCloseIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Recolher <Kbd className="ml-1">{mod} B</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
        <input
          ref={importInput}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ""
            if (!f) return
            try {
              const added = useHistory.getState().importBackup(await readBackup(f))
              toast.success(added ? `${added} sons importados` : "Nada novo para importar")
            } catch (err) {
              toast.error("Não foi possível importar", { description: err instanceof Error ? err.message : String(err) })
            }
          }}
        />
      </div>

      <div className="px-3 pb-3">
        <Button onClick={startNew} className="h-9 w-full justify-start gap-2 px-3 text-sm">
          <PlusIcon />
          Novo som
          <span className="ml-auto text-xs font-normal opacity-60">Alt N</span>
        </Button>
      </div>

      <div className="flex items-center gap-1 px-3 pb-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Buscar som ou pedido"
            aria-label="Buscar no histórico"
            className="h-8 w-full rounded-md border border-sidebar-border bg-background/60 pr-7 pl-8 text-[13px] outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Limpar busca"
            >
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Agrupar e ordenar" className={cn((groupBy !== "geracao" || sortBy !== "recentes") && "text-brand")}>
                  <ArrowDownUpIcon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Agrupar e ordenar</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Agrupar por</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={groupBy}
              onValueChange={(v) => {
                setSettings({ groupBy: v as GroupBy })
                setClosed(new Set())
              }}
            >
              {GROUP_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.id} value={o.id}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Ordenar por</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={sortBy} onValueChange={(v) => setSettings({ sortBy: v as SortBy })}>
              {SORT_OPTIONS.map((o) => (
                <DropdownMenuRadioItem key={o.id} value={o.id}>
                  {o.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {groupBy !== "nenhum" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setClosed(new Set(groups.map((g) => g.key)))}>Recolher todos os grupos</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setClosed(new Set())}>Expandir todos os grupos</DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {items.length > 0 && <FilterChips filter={filter} setFilter={setFilter} />}

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-sidebar-border px-1.5 pb-3 scrollbar-thin">
        {items.length === 0 ? (
          <div className="px-4 pt-8">
            <p className="text-sm font-medium">Nenhum som ainda</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Cada pedido que você fizer aparece aqui com os sons que ele gerou. Tudo fica salvo neste navegador.
            </p>
          </div>
        ) : shown === 0 ? (
          <div className="px-4 pt-8">
            <p className="text-sm font-medium">Nada encontrado</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {query ? `Nenhum som ou pedido combina com “${query}”.` : "Nenhum som neste filtro."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setQuery("")
                setFilter("todos")
              }}
            >
              Mostrar todos
            </Button>
          </div>
        ) : (
          groups.map((g) => {
            const open = !closed.has(g.key)
            const headless = groupBy === "nenhum"
            return (
              <section key={g.key}>
                {!headless &&
                  (g.generation ? (
                    <GenerationHeader group={g} open={open} onToggle={() => toggleGroup(g.key)} now={now} />
                  ) : (
                    <PlainHeader group={g} open={open} onToggle={() => toggleGroup(g.key)} />
                  ))}
                <AnimatePresence initial={false}>
                  {(open || headless) && (
                    <motion.ul
                      key="items"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className={cn("overflow-hidden", headless ? "pt-2" : "ml-[13px] border-l border-sidebar-border pl-1")}
                    >
                      <AnimatePresence initial={false}>
                        {g.items.map((item) => (
                          <SoundRow
                            key={item.id}
                            item={item}
                            selected={item.id === currentId}
                            collectionColor={groupBy !== "colecao" && item.collectionId ? collectionColor.get(item.collectionId) : undefined}
                          />
                        ))}
                      </AnimatePresence>
                    </motion.ul>
                  )}
                </AnimatePresence>
              </section>
            )
          })
        )}
      </div>

      <NowPlaying />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {items.length} sons e os pedidos serão removidos deste navegador. As coleções continuam. Se quiser guardar, exporte um
              backup antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                player.stop()
                useHistory.getState().clear()
                useStudio.setState({ current: null, lastId: null })
                if (useStudio.getState().step === 3) useStudio.getState().setStep(1)
                toast.success("Histórico limpo")
              }}
            >
              Limpar histórico
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
