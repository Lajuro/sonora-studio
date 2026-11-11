"use client"

import { toast } from "sonner"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { renderRecipe, type RenderResult } from "@/lib/audio/engine"
import { miniPeaks } from "@/lib/audio/peaks"
import { player } from "@/lib/audio/player"
import { copyText, uid } from "@/lib/helpers"
import { buildPrompt } from "@/lib/recipe/prompt"
import { parseRecipeText } from "@/lib/recipe/parse"
import type { Recipe } from "@/lib/recipe/schema"
import { useHistory, type HistoryItem } from "./history"
import { useSettings } from "./settings"

export type Step = 1 | 2 | 3

export type CurrentSound = {
  id: string
  recipe: Recipe
  json: string
  result: RenderResult
}

type StudioState = {
  step: Step
  direction: 1 | -1
  description: string
  draft: string
  current: CurrentSound | null
  lastId: string | null
  muted: number[]
  solo: number | null
  generating: boolean
  rerendering: boolean
  loadingId: string | null
  setStep: (s: Step) => void
  setDescription: (d: string) => void
  setDraft: (d: string) => void
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      step: 1,
      direction: 1,
      description: "",
      draft: "",
      current: null,
      lastId: null,
      muted: [],
      solo: null,
      generating: false,
      rerendering: false,
      loadingId: null,
      setStep: (step) => {
        if (step === 3 && !get().current) return
        set({ step, direction: step >= get().step ? 1 : -1 })
      },
      setDescription: (description) => set({ description }),
      setDraft: (draft) => set({ draft }),
    }),
    {
      name: "sonora-studio",
      version: 1,
      partialize: (s) => ({ description: s.description, draft: s.draft, lastId: s.current?.id ?? s.lastId }),
    },
  ),
)

/* ----------------------------- Cache de render ---------------------------- */

const cache = new Map<string, RenderResult>()
const MAX_CACHE = 20

function remember(id: string, r: RenderResult) {
  cache.delete(id)
  cache.set(id, r)
  while (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value
    if (first === undefined) break
    cache.delete(first)
  }
}

async function renderItem(item: HistoryItem): Promise<{ recipe: Recipe; result: RenderResult } | null> {
  const parsed = parseRecipeText(item.json)
  if (!parsed.ok) {
    toast.error("Não foi possível abrir este som", { description: parsed.errors[0]?.message })
    return null
  }
  const recipe = parsed.recipes[0]
  const hit = cache.get(item.id)
  if (hit) return { recipe, result: hit }
  const result = await renderRecipe(recipe)
  remember(item.id, result)
  return { recipe, result }
}

/* --------------------------------- Ações ---------------------------------- */

export async function generateFromDraft(text = useStudio.getState().draft) {
  const st = useStudio.getState()
  if (st.generating) return
  const parsed = parseRecipeText(text)
  if (!parsed.ok) {
    const first = parsed.errors[0]
    toast.error(parsed.errors.length > 1 ? `${parsed.errors.length} problemas na receita` : "Receita com problema", {
      description: first ? `${first.line ? `Linha ${first.line}: ` : ""}${first.message}` : undefined,
    })
    return
  }

  useStudio.setState({ generating: true })
  try {
    const items: HistoryItem[] = []
    let firstCurrent: CurrentSound | null = null
    const started = performance.now()
    for (let i = 0; i < parsed.recipes.length; i++) {
      const recipe = parsed.recipes[i]
      const json = JSON.stringify(parsed.raws[i], null, 2)
      const result = await renderRecipe(recipe)
      const id = uid()
      remember(id, result)
      items.push({
        id,
        name: recipe.name,
        description: recipe.description,
        tags: recipe.tags,
        json,
        createdAt: Date.now() + (parsed.recipes.length - i),
        duration: result.duration,
        sampleRate: result.sampleRate,
        channels: result.channels.length,
        layers: recipe.layers.length,
        peaks: miniPeaks(result.channels),
        favorite: false,
      })
      if (!firstCurrent) firstCurrent = { id, recipe, json, result }
    }
    // espera mínima para a animação de "gerando" respirar
    const elapsed = performance.now() - started
    if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed))

    useHistory.getState().add(items)
    useStudio.setState({ current: firstCurrent, muted: [], solo: null })
    useStudio.getState().setStep(3)

    if (parsed.warnings.length) {
      toast.warning(`${parsed.warnings.length} ${parsed.warnings.length > 1 ? "propriedades ignoradas" : "propriedade ignorada"}`, {
        description: parsed.warnings
          .slice(0, 3)
          .map((w) => w.path ?? w.message)
          .join(", "),
      })
    }
    if (items.length > 1) toast.success(`${items.length} variações geradas`, { description: "Todas foram salvas no histórico." })

    if (firstCurrent && useSettings.getState().autoPlay) {
      void player.play(firstCurrent.id, firstCurrent.result, 0)
    }
  } catch (err) {
    console.error(err)
    toast.error("Falha ao sintetizar o som", { description: err instanceof Error ? err.message : String(err) })
  } finally {
    useStudio.setState({ generating: false })
  }
}

export async function openHistoryItem(item: HistoryItem, opts: { play?: boolean; step?: Step } = {}) {
  useStudio.setState({ loadingId: item.id })
  try {
    const r = await renderItem(item)
    if (!r) return
    const prev = useStudio.getState().current
    if (prev?.id !== item.id) {
      useStudio.setState({ current: { id: item.id, recipe: r.recipe, json: item.json, result: r.result }, muted: [], solo: null })
    }
    if (opts.step) useStudio.getState().setStep(opts.step)
    if (opts.play) await player.play(item.id, r.result, 0)
  } finally {
    useStudio.setState({ loadingId: null })
  }
}

export async function toggleHistoryPlayback(item: HistoryItem) {
  if (player.key === item.id) {
    const cur = useStudio.getState().current
    if (player.playing) return player.pause()
    const data = cur?.id === item.id ? cur.result : cache.get(item.id)
    return player.play(item.id, data)
  }
  const cur = useStudio.getState().current
  if (cur?.id === item.id) return player.play(item.id, cur.result, 0)
  useStudio.setState({ loadingId: item.id })
  try {
    const r = await renderItem(item)
    if (r) await player.play(item.id, r.result, 0)
  } finally {
    useStudio.setState({ loadingId: null })
  }
}

export async function getRenderForItem(item: HistoryItem) {
  const cur = useStudio.getState().current
  if (cur?.id === item.id) return { recipe: cur.recipe, result: cur.result }
  return renderItem(item)
}

/** Re-renderiza o som atual aplicando mute/solo nas camadas. */
export async function setLayerMix(muted: number[], solo: number | null) {
  const st = useStudio.getState()
  const cur = st.current
  if (!cur) return
  useStudio.setState({ muted, solo, rerendering: true })
  try {
    const result = await renderRecipe(cur.recipe, { mutedLayers: new Set(muted), soloLayer: solo })
    if (useStudio.getState().current?.id !== cur.id) return
    const wasPlaying = player.playing && player.key === cur.id
    const pos = player.position
    player.invalidate(cur.id)
    useStudio.setState({ current: { ...cur, result } })
    if (!muted.length && solo === null) remember(cur.id, result)
    if (wasPlaying) await player.play(cur.id, result, Math.min(pos, result.duration))
  } finally {
    useStudio.setState({ rerendering: false })
  }
}

export function editRecipe(json: string) {
  useStudio.setState({ draft: json })
  useStudio.getState().setStep(2)
}

export function forgetRender(id: string) {
  cache.delete(id)
  player.invalidate(id)
  if (player.key === id) player.stop()
}

/* --------------------------------- Prompt --------------------------------- */

export function currentPrompt() {
  const { promptMode, variations, promptExtra } = useSettings.getState()
  return buildPrompt({
    description: useStudio.getState().description,
    mode: promptMode,
    variations,
    extra: promptExtra,
  })
}

export async function copyPrompt() {
  const ok = await copyText(currentPrompt())
  if (ok) {
    const hasDesc = Boolean(useStudio.getState().description.trim())
    toast.success("Prompt copiado!", {
      description: hasDesc
        ? "Cole na IA da sua empresa e traga a receita JSON de volta."
        : "Cole na IA e, em seguida, descreva o som que você quer.",
    })
  } else {
    toast.error("Não foi possível copiar automaticamente", {
      description: "Abra “Ver prompt” e copie manualmente com Ctrl+C.",
    })
  }
  return ok
}
