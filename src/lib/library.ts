import { dateGroup } from "@/lib/helpers"
import { generationOf, generationTitle, type Collection, type Generation, type HistoryItem } from "@/lib/history-model"
import type { GroupBy, SortBy } from "@/stores/settings"

/** Organização do histórico: busca, filtro, ordenação e agrupamento. */

export type LibraryFilter = "todos" | "favoritos" | (string & {})

export type LibraryGroup = {
  key: string
  label: string
  items: HistoryItem[]
  generation?: Generation
  collection?: Collection
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()

const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true })

const SORTERS: Record<SortBy, (a: HistoryItem, b: HistoryItem) => number> = {
  recentes: (a, b) => b.createdAt - a.createdAt,
  antigos: (a, b) => a.createdAt - b.createdAt,
  nome: (a, b) => collator.compare(a.name, b.name),
  curtos: (a, b) => a.duration - b.duration,
  longos: (a, b) => b.duration - a.duration,
}

export type LibraryInput = {
  items: HistoryItem[]
  generations: Record<string, Generation>
  collections: Collection[]
  query: string
  filter: LibraryFilter
  groupBy: GroupBy
  sortBy: SortBy
  now?: Date
}

export function filterItems({ items, generations, query, filter }: Pick<LibraryInput, "items" | "generations" | "query" | "filter">) {
  const q = normalize(query.trim())
  return items.filter((i) => {
    if (filter === "favoritos" && !i.favorite) return false
    if (filter !== "todos" && filter !== "favoritos" && i.collectionId !== filter) return false
    if (!q) return true
    const request = i.batch ? (generations[i.batch]?.request ?? "") : ""
    return normalize(`${i.name} ${i.description ?? ""} ${(i.tags ?? []).join(" ")} ${request}`).includes(q)
  })
}

export function buildLibrary(input: LibraryInput): LibraryGroup[] {
  const { generations, collections, groupBy, sortBy } = input
  const sorted = filterItems(input).sort(SORTERS[sortBy])
  const byTime = sortBy === "recentes" || sortBy === "antigos"
  const groups = new Map<string, LibraryGroup>()
  const push = (key: string, make: () => Omit<LibraryGroup, "items" | "key">, item: HistoryItem) => {
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { key, items: [], ...make() }))
    g.items.push(item)
  }

  switch (groupBy) {
    case "nenhum":
      return sorted.length ? [{ key: "todos", label: "", items: sorted }] : []

    case "geracao": {
      for (const item of sorted) {
        const gen = generationOf(item, generations)
        push(gen.id, () => ({ label: generationTitle(gen), generation: gen }), item)
      }
      const list = [...groups.values()]
      // dentro de uma geração, a ordem natural é a das variações (1, 2, 3...)
      if (byTime) for (const g of list) g.items.sort((a, b) => b.createdAt - a.createdAt)
      const dir = sortBy === "antigos" ? 1 : -1
      return list.sort((a, b) => dir * ((a.generation?.createdAt ?? 0) - (b.generation?.createdAt ?? 0)))
    }

    case "data": {
      const now = input.now ?? new Date()
      // os grupos seguem a linha do tempo; a ordenação escolhida vale dentro de cada um
      const chrono = byTime ? sorted : [...sorted].sort(SORTERS.recentes)
      for (const item of chrono) push(dateGroup(item.createdAt, now), () => ({ label: dateGroup(item.createdAt, now) }), item)
      const list = [...groups.values()]
      if (!byTime) for (const g of list) g.items.sort(SORTERS[sortBy])
      return list
    }

    case "colecao": {
      const known = new Map(collections.map((c) => [c.id, c]))
      for (const c of collections) groups.set(c.id, { key: c.id, label: c.name, collection: c, items: [] })
      for (const item of sorted) {
        const c = item.collectionId ? known.get(item.collectionId) : undefined
        if (c) groups.get(c.id)!.items.push(item)
        else push("sem-colecao", () => ({ label: "Sem coleção" }), item)
      }
      return [...groups.values()].filter((g) => g.items.length)
    }

    case "etiqueta": {
      for (const item of sorted) {
        const tag = item.tags?.[0]?.trim().toLowerCase()
        if (tag) push(`tag:${tag}`, () => ({ label: `#${tag}` }), item)
        else push("sem-etiqueta", () => ({ label: "Sem etiqueta" }), item)
      }
      return [...groups.values()].sort((a, b) => {
        if (a.key === "sem-etiqueta") return 1
        if (b.key === "sem-etiqueta") return -1
        return b.items.length - a.items.length || collator.compare(a.label, b.label)
      })
    }
  }
}
