"use client"

import CodeMirror, { EditorView, keymap, Prec, type ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { autocompletion } from "@codemirror/autocomplete"
import { json } from "@codemirror/lang-json"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint"
import { tags as t } from "@lezer/highlight"
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { Diagnostic } from "@/lib/recipe/parse"
import { recipeCompletion } from "@/lib/recipe/completion"
import { extractJson, prettify } from "@/lib/recipe/parse"

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
    lineHeight: "1.65",
    scrollbarWidth: "thin",
  },
  ".cm-content": { caretColor: "var(--brand)", padding: "14px 0" },
  ".cm-line": { padding: "0 16px 0 6px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "color-mix(in oklch, var(--muted-foreground) 70%, transparent)",
    border: "none",
    paddingLeft: "6px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--foreground) 4%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--brand)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklch, var(--brand) 28%, transparent) !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in oklch, var(--brand) 22%, transparent)",
    outline: "1px solid color-mix(in oklch, var(--brand) 50%, transparent)",
    borderRadius: "2px",
  },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--muted-foreground)", cursor: "pointer" },
  ".cm-foldPlaceholder": {
    background: "var(--muted)",
    border: "1px solid var(--border)",
    color: "var(--muted-foreground)",
    borderRadius: "4px",
    padding: "0 4px",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)", fontStyle: "normal" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    boxShadow: "0 12px 32px -12px rgb(0 0 0 / 0.35)",
    overflow: "hidden",
  },
  ".cm-tooltip-lint": { padding: "2px" },
  ".cm-diagnostic": { padding: "6px 10px", fontFamily: "var(--font-geist-sans), sans-serif", fontSize: "12.5px" },
  ".cm-diagnostic-error": { borderLeft: "3px solid var(--destructive)" },
  ".cm-diagnostic-warning": { borderLeft: "3px solid var(--warning)" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--destructive)",
    textUnderlineOffset: "3px",
    textDecorationThickness: "1.5px",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--warning)",
    textUnderlineOffset: "3px",
  },
  ".cm-gutter-lint": { width: "14px" },
  ".cm-lint-marker": { width: "10px", height: "10px" },
  ".cm-panels": { backgroundColor: "var(--card)", color: "var(--foreground)" },
  ".cm-tooltip-autocomplete": { padding: "4px" },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-geist-mono), monospace", fontSize: "12.5px", maxHeight: "16em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px !important", borderRadius: "6px", lineHeight: "1.5" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "color-mix(in oklch, var(--brand) 18%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-completionDetail": {
    marginLeft: "12px",
    fontStyle: "normal",
    fontFamily: "var(--font-geist-sans), sans-serif",
    fontSize: "11.5px",
    color: "var(--muted-foreground)",
  },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--brand)", fontWeight: "600" },
  ".cm-searchMatch": { backgroundColor: "color-mix(in oklch, var(--warning) 35%, transparent)" },
})

const highlight = HighlightStyle.define([
  { tag: t.propertyName, color: "var(--brand)" },
  { tag: t.string, color: "var(--type-pluck)" },
  { tag: t.number, color: "var(--type-fm)" },
  { tag: [t.bool, t.null], color: "var(--type-drum)", fontWeight: "500" },
  { tag: [t.punctuation, t.bracket, t.separator], color: "color-mix(in oklch, var(--foreground) 55%, transparent)" },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
])

export type RecipeEditorHandle = {
  jumpTo: (from: number, to?: number) => void
  focus: () => void
}

type Props = {
  value: string
  onChange: (v: string) => void
  diagnostics: Diagnostic[]
  onSubmit: () => void
  onCursor?: (line: number, col: number) => void
  onCleanPaste?: () => void
}

export const RecipeEditor = forwardRef<RecipeEditorHandle, Props>(function RecipeEditor(
  { value, onChange, diagnostics, onSubmit, onCursor, onCleanPaste },
  ref,
) {
  const cm = useRef<ReactCodeMirrorRef>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const submitRef = useRef(onSubmit)
  const cleanRef = useRef(onCleanPaste)
  useEffect(() => {
    submitRef.current = onSubmit
    cleanRef.current = onCleanPaste
  }, [onSubmit, onCleanPaste])

  useImperativeHandle(ref, () => ({
    jumpTo: (from, to) => {
      const view = cm.current?.view
      if (!view) return
      const len = view.state.doc.length
      const a = Math.min(from, len)
      const b = Math.min(to ?? from, len)
      view.dispatch({ selection: { anchor: a, head: b }, effects: EditorView.scrollIntoView(a, { y: "center" }) })
      view.focus()
    },
    focus: () => cm.current?.view?.focus(),
  }))

  const extensions = useMemo(
    () => [
      json(),
      autocompletion({ override: [recipeCompletion], icons: false, activateOnTyping: true }),
      editorTheme,
      syntaxHighlighting(highlight),
      lintGutter(),
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              submitRef.current()
              return true
            },
          },
        ]),
      ),
      EditorView.domEventHandlers({
        paste: (event, view) => {
          const text = event.clipboardData?.getData("text/plain")
          if (!text) return false
          // Se o editor está vazio (ou tudo selecionado), limpa a resposta da IA automaticamente
          const sel = view.state.selection.main
          const replacingAll = view.state.doc.length === 0 || (sel.from === 0 && sel.to === view.state.doc.length)
          if (!replacingAll) return false
          const { json: extracted } = extractJson(text)
          const pretty = prettify(extracted)
          const cleaned = pretty ?? extracted
          if (cleaned.trim() === text.trim()) return false
          event.preventDefault()
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: cleaned }, selection: { anchor: 0 } })
          cleanRef.current?.()
          return true
        },
      }),
      EditorView.updateListener.of((u) => {
        if (u.selectionSet || u.docChanged) {
          const pos = u.state.selection.main.head
          const line = u.state.doc.lineAt(pos)
          onCursor?.(line.number, pos - line.from + 1)
        }
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Aplica diagnósticos vindos do validador
  useEffect(() => {
    if (!view) return
    const len = view.state.doc.length
    const diags: CmDiagnostic[] = diagnostics.map((d) => {
      const from = Math.max(0, Math.min(d.from, len))
      const to = Math.max(from, Math.min(d.to, len))
      return {
        from,
        to,
        severity: d.severity,
        message: d.path ? `${d.path}: ${d.message}` : d.message,
        source: "Sonora",
      }
    })
    view.dispatch(setDiagnostics(view.state, diags))
  }, [diagnostics, value, view])

  return (
    <CodeMirror
      ref={cm}
      value={value}
      onChange={onChange}
      onCreateEditor={(v) => setView(v)}
      theme="none"
      height="100%"
      className="h-full"
      placeholder={'Cole aqui a receita JSON gerada pela IA…\n\n{\n  "name": "Meu som",\n  "layers": [ … ]\n}'}
      extensions={extensions}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightActiveLineGutter: true,
        bracketMatching: true,
        closeBrackets: true,
        autocompletion: false,
        indentOnInput: true,
        searchKeymap: true,
        tabSize: 2,
      }}
    />
  )
})
