import {
  findNodeAtLocation,
  getNodePath,
  parse as parseJsonc,
  parseTree,
  printParseErrorCode,
  type Node as JsonNode,
  type ParseError,
} from "jsonc-parser"
import type { $ZodIssue } from "zod/v4/core"
import { RecipeSchema, type Recipe } from "./schema"

export type Severity = "error" | "warning"

export type Diagnostic = {
  from: number
  to: number
  severity: Severity
  message: string
  path?: string
  line?: number
  column?: number
}

export type ParseResult =
  | { ok: true; recipes: Recipe[]; warnings: Diagnostic[]; json: string; raws: unknown[] }
  | { ok: false; errors: Diagnostic[]; warnings: Diagnostic[] }

const PARSE_MESSAGES: Record<string, string> = {
  InvalidSymbol: "Símbolo inválido",
  InvalidNumberFormat: "Número em formato inválido",
  PropertyNameExpected: "Esperava o nome de uma propriedade entre aspas",
  ValueExpected: "Esperava um valor",
  ColonExpected: 'Esperava ":"',
  CommaExpected: 'Esperava ","',
  CloseBraceExpected: 'Esperava "}"',
  CloseBracketExpected: 'Esperava "]"',
  EndOfFileExpected: "Conteúdo extra depois do fim do JSON",
  InvalidCommentToken: "Comentário inválido",
  UnexpectedEndOfComment: "Comentário não fechado",
  UnexpectedEndOfString: "Texto (string) não fechado: faltam aspas",
  UnexpectedEndOfNumber: "Número incompleto",
  InvalidUnicode: "Caractere unicode inválido",
  InvalidEscapeCharacter: "Escape inválido dentro do texto",
  InvalidCharacter: "Caractere inválido",
}

/**
 * Extrai o JSON de um texto colado: remove cercas de markdown (```json) e
 * qualquer conversa antes/depois que a IA tenha incluído.
 */
export function extractJson(text: string): { json: string; offset: number } {
  const fence = /```(?:json5?|jsonc|javascript|js)?[^\n]*\n([\s\S]*?)```/i.exec(text)
  if (fence && fence.index !== undefined) {
    const inner = fence[1]
    const offset = fence.index + fence[0].indexOf(inner)
    return trimToBraces(inner, offset)
  }
  return trimToBraces(text, 0)
}

function trimToBraces(text: string, base: number) {
  const startObj = text.indexOf("{")
  const startArr = text.indexOf("[")
  const candidates = [startObj, startArr].filter((i) => i >= 0)
  if (!candidates.length) return { json: text, offset: base }
  const start = Math.min(...candidates)
  const closer = text[start] === "{" ? "}" : "]"
  const end = text.lastIndexOf(closer)
  if (end <= start) return { json: text.slice(start), offset: base + start }
  return { json: text.slice(start, end + 1), offset: base + start }
}

export function offsetToLineCol(text: string, offset: number) {
  let line = 1
  let col = 1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++
      col = 1
    } else col++
  }
  return { line, column: col }
}

export function formatPath(path: PropertyKey[]): string {
  let out = ""
  for (const p of path) {
    if (typeof p === "number") out += `[${p}]`
    else out += out ? `.${String(p)}` : String(p)
  }
  return out || "(raiz)"
}

function locate(tree: JsonNode | undefined, path: (string | number)[]): JsonNode | undefined {
  if (!tree) return undefined
  for (let n = path.length; n >= 0; n--) {
    const node = findNodeAtLocation(tree, path.slice(0, n))
    if (node) return node
  }
  return tree
}

function nodeRange(node: JsonNode | undefined, offset: number) {
  if (!node) return { from: offset, to: offset + 1 }
  // Para objetos/arrays grandes, sublinha só a primeira linha.
  const len = node.type === "object" || node.type === "array" ? 1 : Math.max(1, node.length)
  return { from: offset + node.offset, to: offset + node.offset + len }
}

function deleteAtPath(obj: unknown, path: PropertyKey[], key: string) {
  let cur: unknown = obj
  for (const p of path) {
    if (cur && typeof cur === "object") cur = (cur as Record<PropertyKey, unknown>)[p]
    else return
  }
  if (cur && typeof cur === "object" && !Array.isArray(cur)) delete (cur as Record<string, unknown>)[key]
}

type Located = { prefix: (string | number)[]; value: unknown }

function unwrap(value: unknown): Located[] {
  if (Array.isArray(value)) return value.map((v, i) => ({ prefix: [i], value: v }))
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>
    if (!("layers" in o)) {
      if (Array.isArray(o.recipes)) return o.recipes.map((v, i) => ({ prefix: ["recipes", i], value: v }))
      for (const key of ["recipe", "receita", "sound", "som"]) {
        if (o[key] && typeof o[key] === "object") return [{ prefix: [key], value: o[key] }]
      }
    }
  }
  return [{ prefix: [], value }]
}

export function parseRecipeText(text: string): ParseResult {
  const { json, offset } = extractJson(text)
  const errors: Diagnostic[] = []
  const warnings: Diagnostic[] = []

  if (!json.trim()) {
    return {
      ok: false,
      errors: [{ from: 0, to: 0, severity: "error", message: "Cole aqui a receita JSON gerada pela IA" }],
      warnings,
    }
  }

  const parseErrors: ParseError[] = []
  const value = parseJsonc(json, parseErrors, { allowTrailingComma: true, disallowComments: false })
  if (parseErrors.length) {
    for (const e of parseErrors.slice(0, 20)) {
      const code = printParseErrorCode(e.error)
      errors.push({
        from: offset + e.offset,
        to: offset + e.offset + Math.max(1, e.length),
        severity: "error",
        message: `JSON inválido: ${PARSE_MESSAGES[code] ?? code}`,
      })
    }
    return withLines(text, { ok: false, errors, warnings })
  }

  const tree = parseTree(json, [], { allowTrailingComma: true, disallowComments: false })
  const items = unwrap(value)
  const recipes: Recipe[] = []
  const raws: unknown[] = []

  for (const item of items) {
    const raw = structuredClone(item.value)
    let result = RecipeSchema.safeParse(raw)

    // Chaves desconhecidas viram avisos: removemos e tentamos de novo.
    for (let attempt = 0; attempt < 6 && !result.success; attempt++) {
      const unknownIssues = result.error.issues.filter((i) => i.code === "unrecognized_keys")
      if (!unknownIssues.length) break
      for (const issue of unknownIssues) {
        if (issue.code !== "unrecognized_keys") continue
        for (const key of issue.keys) {
          const fullPath = [...item.prefix, ...(issue.path as (string | number)[]), key]
          const node = findNodeAtLocation(tree!, fullPath)
          const keyNode = node?.parent?.children?.[0]
          const range = keyNode ? nodeRange(keyNode, offset) : nodeRange(locate(tree, fullPath), offset)
          warnings.push({
            ...range,
            severity: "warning",
            path: formatPath([...(issue.path as PropertyKey[]), key]),
            message: `Propriedade "${key}" não é reconhecida e foi ignorada`,
          })
          deleteAtPath(raw, issue.path, key)
        }
      }
      result = RecipeSchema.safeParse(raw)
    }

    if (result.success) {
      recipes.push(result.data)
      raws.push(raw)
    } else {
      for (const issue of dedupe(result.error.issues)) {
        if (issue.code === "unrecognized_keys") continue
        const fullPath = [...item.prefix, ...(issue.path as (string | number)[])]
        const node = locate(tree, fullPath)
        // mostra o caminho como está no JSON do usuário (sem detalhes internos do validador)
        const shownPath = node && node !== tree ? getNodePath(node).slice(item.prefix.length) : issue.path
        errors.push({
          ...nodeRange(node, offset),
          severity: "error",
          path: formatPath(shownPath),
          message: issue.message,
        })
      }
    }
  }

  if (errors.length) return withLines(text, { ok: false, errors, warnings })
  return withLines(text, { ok: true, recipes, warnings, json, raws })
}

function dedupe(issues: $ZodIssue[]) {
  const seen = new Set<string>()
  return issues.filter((i) => {
    const k = `${i.path.join(".")}|${i.message}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function withLines<T extends ParseResult>(text: string, r: T): T {
  const add = (d: Diagnostic) => Object.assign(d, offsetToLineCol(text, d.from))
  r.warnings.forEach(add)
  if (!r.ok) r.errors.forEach(add)
  return r
}

/** Formata o JSON bonito (2 espaços), preservando o conteúdo. */
export function prettify(text: string): string | null {
  const { json } = extractJson(text)
  const errors: ParseError[] = []
  const value = parseJsonc(json, errors, { allowTrailingComma: true })
  if (errors.length) return null
  return JSON.stringify(value, null, 2)
}
