"use client"

import { useTheme } from "next-themes"
import {
  AudioLinesIcon,
  BookOpenIcon,
  BracesIcon,
  CopyIcon,
  KeyboardIcon,
  Link2Icon,
  MoonIcon,
  PanelLeftIcon,
  PlayIcon,
  SearchIcon,
  Settings2Icon,
  PlusIcon,
  SquareIcon,
  StarIcon,
  SunIcon,
} from "lucide-react"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { player } from "@/lib/audio/player"
import { formatDuration, isMac } from "@/lib/helpers"
import { EXAMPLES, exampleJson } from "@/lib/recipe/examples"
import { useHistory } from "@/stores/history"
import {
  copyPrompt,
  copyShareLink,
  generateFromDraft,
  loadExample,
  openHistoryItem,
  startNew,
  useStudio,
} from "@/stores/studio"
import { commands, useUi } from "@/stores/ui"
import { MiniWave } from "./mini-wave"

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const set = useUi((s) => s.set)
  const items = useHistory((s) => s.items)
  const hasDraft = useStudio((s) => Boolean(s.draft.trim()))
  const currentJson = useStudio((s) => s.current?.json)
  const { resolvedTheme, setTheme } = useTheme()
  const mod = isMac() ? "⌘" : "Ctrl"

  const run = (fn: () => void) => {
    set({ paletteOpen: false })
    setTimeout(fn, 60)
  }
  const go = (step: 1 | 2 | 3) => run(() => useStudio.getState().setStep(step))

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => set({ paletteOpen: o })}
      title="Comandos"
      description="Busque sons e ações"
      className="sm:max-w-xl"
    >
      <Command className="**:data-[slot=command-input-wrapper]:h-12">
        <CommandInput placeholder="Buscar sons, exemplos ou ações…" />
        <CommandList className="max-h-[60dvh]">
          <CommandEmpty>Nada encontrado.</CommandEmpty>
          <CommandGroup heading="Ações">
            <CommandItem onSelect={() => run(startNew)}>
              <PlusIcon />
              Novo som
              <CommandShortcut>Alt N</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => void copyPrompt())}>
              <CopyIcon />
              Copiar prompt para a IA
              <CommandShortcut>{mod}⇧C</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go(2)}>
              <BracesIcon />
              Colar receita
              <CommandShortcut>Alt 2</CommandShortcut>
            </CommandItem>
            {hasDraft && (
              <CommandItem onSelect={() => run(() => void generateFromDraft())}>
                <PlayIcon />
                Gerar som da receita atual
                <CommandShortcut>{mod}↵</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={() => go(3)}>
              <AudioLinesIcon />
              Ir para o player
              <CommandShortcut>Alt 3</CommandShortcut>
            </CommandItem>
            {currentJson && (
              <CommandItem onSelect={() => run(() => void copyShareLink(currentJson))}>
                <Link2Icon />
                Copiar link do som atual
              </CommandItem>
            )}
            <CommandItem onSelect={() => run(() => player.stop())}>
              <SquareIcon />
              Parar reprodução
              <CommandShortcut>Esc</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Interface">
            <CommandItem onSelect={() => run(() => commands.toggleSidebar?.())}>
              <PanelLeftIcon />
              Mostrar/ocultar histórico
              <CommandShortcut>{mod}B</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => commands.focusSearch?.())}>
              <SearchIcon />
              Buscar no histórico
            </CommandItem>
            <CommandItem onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}>
              {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
              Tema {resolvedTheme === "dark" ? "claro" : "escuro"}
            </CommandItem>
            <CommandItem onSelect={() => run(() => set({ settingsOpen: true }))}>
              <Settings2Icon />
              Configurações
              <CommandShortcut>{mod},</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => run(() => set({ shortcutsOpen: true }))}>
              <KeyboardIcon />
              Atalhos de teclado
              <CommandShortcut>?</CommandShortcut>
            </CommandItem>
          </CommandGroup>
          {items.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Histórico">
                {items.slice(0, 60).map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.name} ${item.tags?.join(" ") ?? ""} ${item.id}`}
                    onSelect={() => run(() => void openHistoryItem(item, { play: true, step: 3 }))}
                  >
                    {item.favorite ? <StarIcon className="fill-warning text-warning" /> : <AudioLinesIcon />}
                    <span className="truncate">{item.name}</span>
                    <CommandShortcut className="flex items-center gap-3 tracking-normal tabular">
                      <MiniWave
                        peaks={item.peaks}
                        style={{ width: 64, height: 14 }}
                        className="text-muted-foreground"
                      />
                      <span className="w-12 text-right">{formatDuration(item.duration)}</span>
                    </CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          <CommandSeparator />
          <CommandGroup heading="Exemplos">
            {EXAMPLES.map((e) => (
              <CommandItem
                key={e.id}
                value={`exemplo ${String(e.recipe.name)} ${e.category}`}
                onSelect={() =>
                  run(() => {
                    loadExample(exampleJson(e), String(e.recipe.name))
                  })
                }
              >
                <BookOpenIcon />
                {String(e.recipe.name)}
                <CommandShortcut className="tracking-normal">{e.category}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
