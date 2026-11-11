"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

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
}

type HistoryState = {
  items: HistoryItem[]
  add: (items: HistoryItem[]) => void
  update: (id: string, patch: Partial<HistoryItem>) => void
  remove: (id: string) => HistoryItem | undefined
  restore: (item: HistoryItem, index: number) => void
  toggleFavorite: (id: string) => void
  clear: () => void
  importItems: (items: HistoryItem[]) => number
}

const MAX_ITEMS = 500

export const useHistory = create<HistoryState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (items) => set((s) => ({ items: [...items, ...s.items].slice(0, MAX_ITEMS) })),
      update: (id, patch) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
      remove: (id) => {
        const item = get().items.find((i) => i.id === id)
        set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
        return item
      },
      restore: (item, index) =>
        set((s) => {
          if (s.items.some((i) => i.id === item.id)) return s
          const items = [...s.items]
          items.splice(Math.min(index, items.length), 0, item)
          return { items }
        }),
      toggleFavorite: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, favorite: !i.favorite } : i)) })),
      clear: () => set({ items: [] }),
      importItems: (incoming) => {
        const existing = new Set(get().items.map((i) => i.id))
        const fresh = incoming.filter((i) => i && typeof i.id === "string" && typeof i.json === "string" && !existing.has(i.id))
        set((s) => ({
          items: [...fresh, ...s.items].sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_ITEMS),
        }))
        return fresh.length
      },
    }),
    {
      name: "sonora-history",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
