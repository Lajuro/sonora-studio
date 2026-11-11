"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  ArchiveIcon,
  BracesIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  FileDownIcon,
  FileUpIcon,
  HistoryIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  SearchIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
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
import { copyText, dateGroup, formatDuration, isMac, timeAgo } from "@/lib/helpers"
import { cn } from "@/lib/utils"
import { useHistory, type HistoryItem } from "@/stores/history"
import { editRecipe, forgetRender, openHistoryItem, toggleHistoryPlayback, useStudio } from "@/stores/studio"
import { commands, useUi } from "@/stores/ui"
import { Burst, EqBars } from "./fx"
import { Logo, LogoMark } from "./logo"
import { MiniWave } from "./mini-wave"

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

const QUICK_FORMATS = [
  { id: "wav16", label: "WAV 16-bit" },
  { id: "flac", label: "FLAC" },
  { id: "mp3-192", label: "MP3 192 kbps" },
  { id: "aiff", label: "AIFF" },
  { id: "json", label: "Receita JSON" },
]

function removeWithUndo(item: HistoryItem) {
  const items = useHistory.getState().items
  const index = items.findIndex((i) => i.id === item.id)
  useHistory.getState().remove(item.id)
  forgetRender(item.id)
  if (useStudio.getState().current?.id === item.id) useStudio.setState({ current: null, lastId: null })
  toast(`“${item.name}” excluído`, {
    action: { label: "Desfazer", onClick: () => useHistory.getState().restore(item, index) },
  })
}

/* ------------------------------------------------------------------------ */

const HistoryRow = memo(function HistoryRow({ item, selected, now }: { item: HistoryItem; selected: boolean; now: number }) {
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

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0, y: -6 }}
      animate={{ opacity: 1, height: "auto", y: 0 }}
      exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 420, damping: 36 }}
      className="overflow-hidden"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => !renaming && void openHistoryItem(item, { step: 3 })}
        onKeyDown={(e) => {
          if (renaming) return
          if (e.key === "Enter") void openHistoryItem(item, { step: 3 })
          if (e.key === " ") {
            e.preventDefault()
            e.stopPropagation()
            void toggleHistoryPlayback(item)
          }
          if (e.key === "Delete") removeWithUndo(item)
          if (e.key === "F2") useUi.getState().set({ renameId: item.id })
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
        className={cn(
          "group/row relative mx-2 flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 outline-none transition-colors",
          "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          selected && "bg-sidebar-accent",
        )}
      >
        {selected && (
          <motion.span layoutId="history-selected" className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-primary" />
        )}
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={(e) => {
            e.stopPropagation()
            void toggleHistoryPlayback(item)
          }}
          aria-label={playing ? `Pausar ${item.name}` : `Tocar ${item.name}`}
          className={cn(
            "relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border transition-colors",
            playing ? "border-primary bg-primary text-primary-foreground" : "bg-background text-foreground hover:border-primary/50 hover:text-primary",
          )}
        >
          {loading ? (
            <EqBars className="h-3" bars={3} />
          ) : playing ? (
            <>
              <EqBars className="h-3 group-hover/row:hidden" bars={3} />
              <PauseIcon className="hidden size-3.5 fill-current group-hover/row:block" />
            </>
          ) : (
            <PlayIcon className="size-3.5 translate-x-px fill-current" />
          )}
        </motion.button>

        <div className="min-w-0 flex-1">
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
              className="w-full rounded-md border border-ring bg-background px-1.5 py-0.5 text-sm outline-none"
            />
          ) : (
            <p className="truncate pr-12 text-sm font-medium" title={item.name}>
              {item.name}
            </p>
          )}
          <p className="truncate text-[11px] text-muted-foreground tabular">
            {formatDuration(item.duration)} · {item.layers} {item.layers === 1 ? "camada" : "camadas"} · {timeAgo(item.createdAt, now)}
          </p>
          <MiniWave peaks={item.peaks} progress={progress} active={selected} className="mt-1 h-4 text-foreground" />
        </div>

        <div
          className={cn(
            "absolute top-1.5 right-1.5 flex items-center gap-0.5 transition-opacity",
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
            <motion.span key={String(item.favorite)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 15 }} className="grid">
              <StarIcon className={cn(item.favorite && "fill-warning text-warning")} />
            </motion.span>
            <Burst trigger={burst} color="var(--warning)" />
          </Button>
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="Mais ações" onClick={(e) => e.stopPropagation()}>
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
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => editRecipe(item.json)}>
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <DownloadIcon />
                  Baixar como…
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
              <DropdownMenuItem variant="destructive" onSelect={() => removeWithUndo(item)}>
                <Trash2Icon />
                Excluir
                <DropdownMenuShortcut>Del</DropdownMenuShortcut>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {item.favorite && (
          <StarIcon className="absolute top-2.5 right-2.5 size-3 fill-warning text-warning transition-opacity group-hover/row:opacity-0" />
        )}
      </div>
    </motion.li>
  )
})

/* ------------------------------------------------------------------------ */

function NowPlaying() {
  const key = usePlayer((s) => s.key)
  const item = useHistory((s) => s.items.find((i) => i.id === key))
  const playing = useIsPlaying(key)
  const position = usePlaybackPosition(key)
  if (!item) return null
  const progress = item.duration ? position / item.duration : 0
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      className="mx-2 mb-2 overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          onClick={() => void toggleHistoryPlayback(item)}
          className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
          aria-label={playing ? "Pausar" : "Tocar"}
        >
          {playing ? <PauseIcon className="size-3 fill-current" /> : <PlayIcon className="size-3 translate-x-px fill-current" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{item.name}</p>
          <p className="text-[10px] text-muted-foreground">{playing ? "Tocando agora" : "Pausado"}</p>
        </div>
        {playing && <EqBars className="h-3 text-primary" />}
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => player.stop()} aria-label="Parar">
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="h-0.5 bg-muted">
        <div className="h-full bg-gradient-brand" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
    </motion.div>
  )
}

function CollapsedRail({ onExpand }: { onExpand: () => void }) {
  const items = useHistory((s) => s.items)
  const playingKey = usePlayer((s) => (s.playing ? s.key : null))
  return (
    <div className="flex h-full flex-col items-center gap-2 py-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={onExpand} aria-label="Expandir histórico">
            <LogoMark active={Boolean(playingKey)} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sonora</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onExpand} aria-label="Expandir histórico" className="mt-2">
            <PanelLeftOpenIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          Mostrar histórico <Kbd className="ml-1">{isMac() ? "⌘" : "Ctrl"} B</Kbd>
        </TooltipContent>
      </Tooltip>
      <div className="relative">
        <HistoryIcon className="size-4 text-muted-foreground" />
        {items.length > 0 && (
          <span className="absolute -top-2 -right-3 rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
            {items.length}
          </span>
        )}
      </div>
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
                  "grid size-9 shrink-0 place-items-center rounded-xl border text-xs font-semibold transition-colors",
                  playingKey === item.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/50",
                )}
              >
                {playingKey === item.id ? <EqBars className="h-3" bars={3} /> : item.name.slice(0, 2).toUpperCase()}
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="right">{item.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

export function HistorySidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const items = useHistory((s) => s.items)
  const currentId = useStudio((s) => s.current?.id)
  const [query, setQuery] = useState("")
  const [onlyFav, setOnlyFav] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const now = useNow()
  const anyPlaying = usePlayer((s) => s.playing)

  useEffect(() => {
    commands.focusSearch = () => searchRef.current?.focus()
  }, [])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return items.filter((i) => {
      if (onlyFav && !i.favorite) return false
      if (!q) return true
      return normalize(`${i.name} ${i.description ?? ""} ${(i.tags ?? []).join(" ")}`).includes(q)
    })
  }, [items, query, onlyFav])

  const groups = useMemo(() => {
    const out: { label: string; items: HistoryItem[] }[] = []
    for (const item of filtered) {
      const label = dateGroup(item.createdAt)
      const last = out[out.length - 1]
      if (last?.label === label) last.items.push(item)
      else out.push({ label, items: [item] })
    }
    return out
  }, [filtered])

  if (collapsed) return <CollapsedRail onExpand={onToggle} />

  const favCount = items.filter((i) => i.favorite).length

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <Logo active={anyPlaying} />
        <div className="ml-auto flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Ações do histórico">
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Histórico · {items.length} sons</DropdownMenuLabel>
              <DropdownMenuItem disabled={!items.length} onSelect={() => void exportAllZip(filtered.length ? filtered : items)}>
                <ArchiveIcon />
                Baixar {query || onlyFav ? "filtrados" : "todos"} (.zip)
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!items.length} onSelect={() => exportBackup(items)}>
                <FileDownIcon />
                Exportar backup (.json)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => importInput.current?.click()}>
                <FileUpIcon />
                Importar backup…
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
              Recolher <Kbd className="ml-1">{isMac() ? "⌘" : "Ctrl"} B</Kbd>
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
              const added = useHistory.getState().importItems(await readBackup(f))
              toast.success(added ? `${added} sons importados` : "Nada novo para importar")
            } catch (err) {
              toast.error("Não foi possível importar", { description: err instanceof Error ? err.message : String(err) })
            }
          }}
        />
      </div>

      <div className="space-y-2 px-3 pt-3 pb-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Buscar no histórico"
            className="h-8 w-full rounded-lg border border-sidebar-border bg-background/60 pr-7 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <XIcon className="size-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        <div className="relative flex rounded-lg bg-muted/60 p-0.5 text-xs font-medium">
          {[
            { id: false, label: `Todos`, count: items.length },
            { id: true, label: `Favoritos`, count: favCount },
          ].map((tab) => (
            <button
              key={String(tab.id)}
              type="button"
              onClick={() => setOnlyFav(tab.id)}
              className={cn(
                "relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 transition-colors",
                onlyFav === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {onlyFav === tab.id && (
                <motion.span layoutId="hist-tab" className="absolute inset-0 rounded-md bg-background shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
              )}
              <span className="relative">{tab.label}</span>
              <span className="relative rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground tabular">{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2 scrollbar-thin">
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-6 pt-10 text-center">
            <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}>
              <MiniWave peaks={[0.2, 0.4, 0.7, 1, 0.8, 0.5, 0.65, 0.9, 0.6, 0.35, 0.5, 0.3, 0.2, 0.15]} progress={0.5} className="h-8 w-28 text-muted-foreground" />
            </motion.div>
            <p className="mt-3 text-sm font-medium">Seus sons aparecem aqui</p>
            <p className="mt-1 text-xs text-muted-foreground">Tudo que você gerar fica salvo automaticamente neste navegador.</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-6 pt-8 text-center text-sm text-muted-foreground">Nada encontrado{query ? ` para “${query}”` : ""}.</p>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <h4 className="sticky top-0 z-10 bg-sidebar/90 px-4 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase backdrop-blur">
                {g.label}
              </h4>
              <ul className="space-y-0.5">
                <AnimatePresence initial={false}>
                  {g.items.map((item) => (
                    <HistoryRow key={item.id} item={item} selected={item.id === currentId} now={now} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          ))
        )}
      </div>

      <NowPlaying />

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todo o histórico?</AlertDialogTitle>
            <AlertDialogDescription>
              Os {items.length} sons serão removidos deste navegador. Se quiser guardar, exporte um backup antes.
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
              Limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
