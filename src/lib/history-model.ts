import type { LayerType } from "@/lib/recipe/schema"

/** Tipos e leituras do histórico, sem depender do navegador (dá para testar no Node). */

export type HistoryItem = {
  id: string
  name: string
  description?: string
  tags?: string[]
  json: string
  createdAt: number
  duration: number
  sampleRate: number
  channels: number
  layers: number
  peaks: number[]
  favorite: boolean
  /** id da geração (pedido) que criou este som */
  batch?: string
  /** tipos de camada presentes, do mais frequente ao menos */
  kinds?: LayerType[]
  collectionId?: string
}

/** De onde veio a receita de uma geração. */
export type GenerationKind = "novo" | "ajuste" | "exemplo" | "link" | "edicao" | "manual"

/** Uma geração é um pedido e os sons que ele produziu de uma vez. */
export type Generation = {
  id: string
  createdAt: number
  kind: GenerationKind
  /** o que foi pedido à IA (descrição do som ou alteração) */
  request: string
  /** som de origem, em ajustes e edições */
  parentName?: string
}

export type Collection = {
  id: string
  name: string
  color: string
}

export const COLLECTION_COLORS = ["#5b8cff", "#3ccb7f", "#ff6b57", "#e26bd0", "#36c5d8", "#f2c230", "#9aa3ad"]

export type Backup = {
  items: HistoryItem[]
  generations?: Record<string, Generation>
  collections?: Collection[]
}

/* ----------------------------- Leitura de gerações ------------------------ */

/** Geração de um som. Sons antigos (sem registro) viram uma geração "manual" própria. */
export function generationOf(item: HistoryItem, generations: Record<string, Generation>): Generation {
  const g = item.batch ? generations[item.batch] : undefined
  return g ?? { id: item.batch ?? `solo:${item.id}`, createdAt: item.createdAt, kind: "manual", request: "" }
}

export function generationKindLabel(g: Generation): string {
  switch (g.kind) {
    case "novo":
      return "Pedido novo"
    case "ajuste":
      return g.parentName ? `Ajuste de ${g.parentName}` : "Ajuste"
    case "exemplo":
      return "Exemplo"
    case "link":
      return "Recebido por link"
    case "edicao":
      return g.parentName ? `Edição de ${g.parentName}` : "Receita editada"
    case "manual":
      return "Receita colada"
  }
}

/** Título de uma geração: o pedido, ou um texto padrão quando não há pedido. */
export function generationTitle(g: Generation, fallbackName?: string): string {
  const text = g.request.trim()
  if (text) return text
  switch (g.kind) {
    case "novo":
      return "Pedido feito direto na conversa com a IA"
    case "ajuste":
      return g.parentName ? `Variação de ${g.parentName}` : "Variação"
    case "edicao":
      return g.parentName ? `Edição de ${g.parentName}` : "Receita editada"
    default:
      return fallbackName ?? generationKindLabel(g)
  }
}
