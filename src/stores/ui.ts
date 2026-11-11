"use client"

import { create } from "zustand"

type UiState = {
  paletteOpen: boolean
  settingsOpen: boolean
  shortcutsOpen: boolean
  mobileHistoryOpen: boolean
  promptPreviewOpen: boolean
  renameId: string | null
  set: (patch: Partial<Omit<UiState, "set">>) => void
}

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  mobileHistoryOpen: false,
  promptPreviewOpen: false,
  renameId: null,
  set: (patch) => set(patch),
}))

/** Comandos que outros componentes podem disparar (ex.: alternar a barra lateral). */
type Commands = {
  toggleSidebar?: () => void
  focusSearch?: () => void
  copyPrompt?: () => void
}
export const commands: Commands = {}
