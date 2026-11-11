"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { PromptMode } from "@/lib/recipe/prompt"

type SettingsState = {
  promptMode: PromptMode
  variations: number
  promptExtra: string
  autoPlay: boolean
  defaultFormat: string
  sidebarCollapsed: boolean
  /** pedidos de ajuste/correção levam junto a referência do formato */
  includeFormat: boolean
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
      set: (patch) => set(patch),
    }),
    { name: "sonora-settings", version: 1 },
  ),
)
