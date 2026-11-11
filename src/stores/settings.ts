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
      set: (patch) => set(patch),
    }),
    { name: "sonora-settings", version: 1 },
  ),
)
