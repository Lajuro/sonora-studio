"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PromptMode } from "@/lib/recipe/prompt"

export type GroupBy = "geracao" | "data" | "colecao" | "etiqueta" | "nenhum"
export type SortBy = "recentes" | "antigos" | "nome" | "curtos" | "longos"

type SettingsState = {
  promptMode: PromptMode
  variations: number
  promptExtra: string
  autoPlay: boolean
  defaultFormat: string
  sidebarCollapsed: boolean
  /** pedidos de ajuste/correção levam junto a referência do formato */
  includeFormat: boolean
  /** como o histórico é agrupado e ordenado na barra lateral */
  groupBy: GroupBy
  sortBy: SortBy
  set: (patch: Partial<Omit<SettingsState, "set">>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      promptMode: "full",
      variations: 1,
      promptExtra: "",
      autoPlay: true,
      defaultFormat: "wav16",
      sidebarCollapsed: false,
      includeFormat: true,
      groupBy: "geracao",
      sortBy: "recentes",
      set: (patch) => set(patch),
    }),
    { name: "sonora-settings", version: 1 },
  ),
)
