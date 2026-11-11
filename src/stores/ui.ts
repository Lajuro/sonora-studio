"use client"

import { create } from "zustand"

type UiState = {
  paletteOpen: boolean
  settingsOpen: boolean
  shortcutsOpen: boolean
  mobileHistoryOpen: boolean
  promptPreviewOpen: boolean
  renameId: string | null
  /** geração cuja descrição está sendo editada na barra lateral */
  editGenerationId: string | null
  exportOpen: boolean
  /** diálogo de coleção: criar (opcionalmente já movendo sons) ou renomear */
  collectionDialog: { mode: "criar"; moveIds?: string[] } | { mode: "renomear"; id: string } | null
  set: (patch: Partial<Omit<UiState, "set">>) => void
}

export const useUi = create<UiState>()((set) => ({
  paletteOpen: false,
  settingsOpen: false,
  shortcutsOpen: false,
  mobileHistoryOpen: false,
  promptPreviewOpen: false,
  renameId: null,
  editGenerationId: null,
  exportOpen: false,
  collectionDialog: null,
  set: (patch) => set(patch),
}))

/** Comandos que outros componentes podem disparar (ex.: alternar a barra lateral). */
type Commands = {
  toggleSidebar?: () => void
  focusSearch?: () => void
  focusDescription?: () => void
}
export const commands: Commands = {}
