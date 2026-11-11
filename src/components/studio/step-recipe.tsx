"use client"

import { AnimatePresence, motion } from "motion/react"
import {
  AlignLeftIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleAlertIcon,
  ClipboardPasteIcon,
  EraserIcon,
  FileUpIcon,
  Gamepad2Icon,
  MonitorSmartphoneIcon,
  MusicIcon,
  PlayIcon,
  TreesIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatBytes } from "@/lib/audio/export"
import { isMac, readClipboard } from "@/lib/helpers"
import { EXAMPLES, exampleJson, type ExampleCategory } from "@/lib/recipe/examples"
import { parseRecipeText, prettify, type Diagnostic } from "@/lib/recipe/parse"
import { cn } from "@/lib/utils"
import { generateFromDraft, useStudio } from "@/stores/studio"
import { EqBars, MotionButton } from "./fx"
import { RecipeEditor, type RecipeEditorHandle } from "./recipe-editor"
import { DiagnosticList, RecipePreview } from "./recipe-preview"

const CATEGORY_ICON: Record<ExampleCategory, typeof MusicIcon> = {
  Interface: MonitorSmartphoneIcon,
  Jogos: Gamepad2Icon,
  Música: MusicIcon,
  Ambiente: TreesIcon,
}

function ExamplesMenu({ onPick }: { onPick: (json: string, name: string) => void }) {
  const groups = useMemo(() => {
    const map = new Map<ExampleCategory, typeof EXAMPLES>()
    for (const e of EXAMPLES) map.set(e.category, [...(map.get(e.category) ?? []), e])
    return [...map.entries()]
  }, [])
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5">
          <BookOpenIcon />
          <span className="hidden sm:inline">Exemplos</span>
          <ChevronDownIcon className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70dvh] w-72 overflow-y-auto">
        {groups.map(([cat, list], gi) => {
          const Icon = CATEGORY_ICON[cat]
          return (
            <DropdownMenuGroup key={cat}>
              {gi > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5" />
                {cat}
              </DropdownMenuLabel>
              {list.map((e) => (
                <DropdownMenuItem key={e.id} onSelect={() => onPick(exampleJson(e), String(e.recipe.name))} className="flex-col items-start gap-0">
                  <span className="font-medium">{String(e.recipe.name)}</span>
                  <span className="line-clamp-1 text-xs text-muted-foreground">{String(e.recipe.description ?? "")}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StepRecipe() {
  const draft = useStudio((s) => s.draft)
  const setDraft = useStudio((s) => s.setDraft)
  const generating = useStudio((s) => s.generating)
  const editor = useRef<RecipeEditorHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })
  const [dragging, setDragging] = useState(false)
  const deferred = useDeferredValue(draft)
  const mod = isMac() ? "⌘" : "Ctrl"

  const result = useMemo(() => (deferred.trim() ? parseRecipeText(deferred) : null), [deferred])
  const diagnostics = useMemo<Diagnostic[]>(
    () => (result ? (result.ok ? result.warnings : [...result.errors, ...result.warnings]) : []),
    [result],
  )
  const empty = !draft.trim()
  const valid = Boolean(result?.ok)
  const count = result?.ok ? result.recipes.length : 0

  useEffect(() => {
    const t = setTimeout(() => editor.current?.focus(), 350)
    return () => clearTimeout(t)
  }, [])

  const loadText = (text: string, label?: string) => {
    const pretty = prettify(text)
    setDraft(pretty ?? text)
    if (label) toast.success(label)
  }

  const onPaste = async () => {
    const text = await readClipboard()
    if (text === null) {
      editor.current?.focus()
      toast.info("Use Ctrl+V dentro do editor", { description: "O navegador bloqueou a leitura direta da área de transferência." })
      return
    }
    if (!text.trim()) {
      toast.info("A área de transferência está vazia")
      return
    }
    loadText(text, "Receita colada")
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 2_000_000) {
      toast.error("Arquivo grande demais", { description: "Receitas costumam ter poucos KB." })
      return
    }
    loadText(await file.text(), `“${file.name}” carregado`)
  }

  const jump = (d: Diagnostic) => editor.current?.jumpTo(d.from, d.to)
  const submit = () => {
    if (!valid) {
      const first = result && !result.ok ? result.errors[0] : undefined
      if (first) jump(first)
    }
    void generateFromDraft(draft)
  }

  const errors = result && !result.ok ? result.errors.length : 0
  const warnings = result ? result.warnings.length : 0

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col gap-4 p-3 sm:p-5 lg:flex-row">
      {/* Editor */}
      <div
        className={cn(
          "relative flex min-h-[420px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card/80 shadow-sm backdrop-blur-sm transition-colors",
          dragging && "border-primary",
        )}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          void onFile(e.dataTransfer.files[0])
        }}
      >
        <div className="flex items-center gap-1 border-b px-2 py-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onPaste}>
                <ClipboardPasteIcon />
                <span className="hidden sm:inline">Colar</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Colar da área de transferência</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
                <FileUpIcon />
                <span className="hidden sm:inline">Abrir</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Abrir arquivo .json (ou arraste para cá)</TooltipContent>
          </Tooltip>
          <input
            ref={fileInput}
            type="file"
            accept=".json,.txt,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ""
            }}
          />
          <ExamplesMenu onPick={(json, name) => loadText(json, `Exemplo “${name}” carregado`)} />
          <div className="mx-1 h-4 w-px bg-border" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={empty}
                onClick={() => {
                  const p = prettify(draft)
                  if (p) setDraft(p)
                  else toast.error("Corrija o JSON antes de formatar")
                }}
                aria-label="Formatar"
              >
                <AlignLeftIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Formatar JSON</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" disabled={empty} onClick={() => setDraft("")} aria-label="Limpar">
                <EraserIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Limpar editor</TooltipContent>
          </Tooltip>
          <div className="ml-auto lg:hidden">
            <GenerateButton valid={valid} count={count} generating={generating} onClick={submit} compact />
          </div>
        </div>

        <div className="relative min-h-0 flex-1">
          <RecipeEditor
            ref={editor}
            value={draft}
            onChange={setDraft}
            diagnostics={diagnostics}
            onSubmit={submit}
            onCursor={(line, col) => setCursor({ line, col })}
            onCleanPaste={() => toast.success("Resposta da IA limpa", { description: "Extraí só o JSON e formatei para você." })}
          />
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-sm"
              >
                <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-2 text-primary">
                  <UploadIcon className="size-8" />
                  <span className="font-medium">Solte o arquivo .json</span>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-xs text-muted-foreground">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={empty ? "empty" : valid ? "ok" : "err"}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-1.5"
            >
              {empty ? (
                <>Cole a receita ou escolha um exemplo</>
              ) : valid ? (
                <>
                  <CheckCircle2Icon className="size-3.5 text-success" />
                  <span className="text-foreground/80">
                    {count > 1 ? `${count} receitas válidas` : "Receita válida"}
                  </span>
                </>
              ) : (
                <>
                  <CircleAlertIcon className="size-3.5 text-destructive" />
                  <span className="text-destructive">
                    {errors} {errors === 1 ? "erro" : "erros"}
                  </span>
                </>
              )}
            </motion.span>
          </AnimatePresence>
          {warnings > 0 && (
            <span className="flex items-center gap-1 text-warning">
              <TriangleAlertIcon className="size-3.5" />
              {warnings}
            </span>
          )}
          <span className="ml-auto hidden tabular sm:inline">
            Ln {cursor.line}, Col {cursor.col}
          </span>
          <span className="tabular">{formatBytes(new Blob([draft]).size)}</span>
          <span className="hidden md:inline">JSON</span>
        </div>
      </div>

      {/* Painel lateral */}
      <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[360px]">
        <div className="hidden lg:block">
          <GenerateButton valid={valid} count={count} generating={generating} onClick={submit} />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            ou <Kbd>{mod} Enter</Kbd> no editor
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin lg:pr-1">
          <RecipePreview result={result} empty={empty} onJump={jump} />
        </div>
        {result && !result.ok && result.errors.length > 0 && (
          <div className="lg:hidden">
            <DiagnosticList items={result.errors} onJump={jump} max={3} />
          </div>
        )}
      </aside>
    </div>
  )
}

function GenerateButton({
  valid,
  count,
  generating,
  onClick,
  compact,
}: {
  valid: boolean
  count: number
  generating: boolean
  onClick: () => void
  compact?: boolean
}) {
  return (
    <MotionButton
      size={compact ? "sm" : "lg"}
      onClick={onClick}
      disabled={generating}
      whileTap={{ scale: 0.96 }}
      whileHover={valid ? { y: -1 } : undefined}
      className={cn(
        "relative gap-2 overflow-hidden",
        !compact && "h-12 w-full rounded-xl text-base shadow-[0_10px_30px_-10px_var(--primary)]",
        !valid && !generating && "opacity-60",
      )}
    >
      {valid && !generating && <span className="pointer-events-none absolute inset-0 shine animate-shimmer opacity-30" />}
      {generating ? (
        <>
          <EqBars />
          Sintetizando…
        </>
      ) : (
        <>
          {compact ? <PlayIcon /> : <PlayIcon className="size-5 fill-current" />}
          {count > 1 ? `Gerar ${count} sons` : "Gerar som"}
        </>
      )}
    </MotionButton>
  )
}
