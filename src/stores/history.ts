"use client"

import { toast } from "sonner"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"
import type { Backup, Collection, Generation, HistoryItem } from "@/lib/history-model"

export * from "@/lib/history-model"

type HistoryState = {
  items: HistoryItem[]
  generations: Record<string, Generation>
  collections: Collection[]
  addGeneration: (generation: Generation, items: HistoryItem[]) => void
  /** Define o texto do pedido de uma geração (cria o registro para sons antigos). */
  describeGeneration: (generation: Generation, itemIds: string[], request: string) => void
  update: (id: string, patch: Partial<HistoryItem>) => void
  remove: (ids: string[]) => { item: HistoryItem; index: number }[]
  restore: (removed: { item: HistoryItem; index: number }[]) => void
  toggleFavorite: (id: string) => void
  clear: () => void
  createCollection: (name: string, color: string) => string
  updateCollection: (id: string, patch: Partial<Collection>) => void
  removeCollection: (id: string) => void
  moveToCollection: (ids: string[], collectionId: string | null) => void
  importBackup: (backup: Backup) => number
}

const MAX_ITEMS = 500

/** localStorage que avisa (uma vez) em vez de quebrar o app quando o espaço acaba. */
let warnedQuota = false
const safeStorage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = {
  getItem: (key) => localStorage.getItem(key),
  removeItem: (key) => localStorage.removeItem(key),
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      if (warnedQuota) return
      warnedQuota = true
      toast.error("O armazenamento do navegador está cheio", {
        description: "Os sons novos podem não ficar salvos. Exporte um backup e apague itens antigos do histórico.",
        duration: 12000,
      })
    }
  },
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Descarta registros de gerações que não têm mais nenhum som. */
function pruneGenerations(generations: Record<string, Generation>, items: HistoryItem[]) {
  const used = new Set(items.map((i) => i.batch))
  const out: Record<string, Generation> = {}
  for (const [id, g] of Object.entries(generations)) if (used.has(id)) out[id] = g
  return out
}

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      generations: {},
      collections: [],
      addGeneration: (generation, items) =>
        set((s) => {
          const next = [...items, ...s.items].slice(0, MAX_ITEMS)
          return { items: next, generations: pruneGenerations({ ...s.generations, [generation.id]: generation }, next) }
        }),
      describeGeneration: (generation, itemIds, request) =>
        set((s) => {
          if (s.generations[generation.id]) {
            return { generations: { ...s.generations, [generation.id]: { ...s.generations[generation.id], request } } }
          }
          const id = newId()
          const wanted = new Set(itemIds)
          return {
            generations: { ...s.generations, [id]: { ...generation, id, request } },
            items: s.items.map((i) => (wanted.has(i.id) ? { ...i, batch: id } : i)),
          }
        }),
      update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      remove: (ids) => {
        const wanted = new Set(ids)
        const removed = get()
          .items.map((item, index) => ({ item, index }))
          .filter((r) => wanted.has(r.item.id))
        // os registros das gerações ficam: se o usuário desfizer, o pedido volta junto
        set((s) => ({ items: s.items.filter((i) => !wanted.has(i.id)) }))
        return removed
      },
      restore: (removed) =>
        set((s) => {
          const items = [...s.items]
          for (const { item, index } of [...removed].sort((a, b) => a.index - b.index)) {
            if (items.some((i) => i.id === item.id)) continue
            items.splice(Math.min(index, items.length), 0, item)
          }
          return { items }
        }),
      toggleFavorite: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, favorite: !i.favorite } : i)) })),
      clear: () => set({ items: [], generations: {} }),
      createCollection: (name, color) => {
        const id = newId()
        set((s) => ({ collections: [...s.collections, { id, name: name.trim() || "Coleção", color }] }))
        return id
      },
      updateCollection: (id, patch) =>
        set((s) => ({ collections: s.collections.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCollection: (id) =>
        set((s) => ({
          collections: s.collections.filter((c) => c.id !== id),
          items: s.items.map((i) => (i.collectionId === id ? { ...i, collectionId: undefined } : i)),
        })),
      moveToCollection: (ids, collectionId) => {
        const wanted = new Set(ids)
        set((s) => ({
          items: s.items.map((i) => (wanted.has(i.id) ? { ...i, collectionId: collectionId ?? undefined } : i)),
        }))
      },
      importBackup: (backup) => {
        const existing = new Set(get().items.map((i) => i.id))
        const fresh = backup.items.filter(
          (i) => i && typeof i.id === "string" && typeof i.json === "string" && !existing.has(i.id),
        )
        set((s) => {
          const items = [...fresh, ...s.items].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS)
          const knownCollections = new Set(s.collections.map((c) => c.id))
          const collections = [...s.collections, ...(backup.collections ?? []).filter((c) => c?.id && !knownCollections.has(c.id))]
          const validCollections = new Set(collections.map((c) => c.id))
          return {
            items: items.map((i) => (i.collectionId && !validCollections.has(i.collectionId) ? { ...i, collectionId: undefined } : i)),
            generations: pruneGenerations({ ...(backup.generations ?? {}), ...s.generations }, items),
            collections,
          }
        })
        return fresh.length
      },
    }),
    {
      name: "sonora-history",
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted) => {
        const s = (persisted ?? {}) as Partial<HistoryState>
        return { ...s, items: s.items ?? [], generations: s.generations ?? {}, collections: s.collections ?? [] } as HistoryState
      },
    },
  ),
)
