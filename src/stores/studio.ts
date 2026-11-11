"use client"

import { toast } from "sonner"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { renderRecipe, type RenderResult } from "@/lib/audio/engine"
import { miniPeaks } from "@/lib/audio/peaks"
import { player } from "@/lib/audio/player"
import { copyText, uid } from "@/lib/helpers"
import { buildFixPrompt, buildPrompt, buildRefinePrompt } from "@/lib/recipe/prompt"
import { parseRecipeText, type Diagnostic } from "@/lib/recipe/parse"
import type { LayerType, Recipe } from "@/lib/recipe/schema"
import { decodeRecipe, MAX_SHARE_LENGTH, shareUrl } from "@/lib/recipe/share"
import { useHistory, type GenerationKind, type HistoryItem } from "./history"
import { useSettings } from "./settings"

export type Step = 1 | 2 | 3

export type CurrentSound = {
  id: string
  recipe: Recipe
  json: string
  result: RenderResult
}

/** O pedido que vai rotular a próxima geração no histórico. */
export type PendingRequest = { kind: GenerationKind; text: string; parentName?: string }

type StudioState = {
  /** pedido da próxima geração (preenchido ao copiar o prompt, pedir ajuste, abrir exemplo...) */
  request: PendingRequest | null
  /** texto do editor tal como foi carregado ou gerado; enquanto não mudar, colar substitui tudo */
  pristine: string | null
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
  /** chave da prévia que está sendo sintetizada (editor ou exemplo) */
  auditioning: string | null
  setStep: (s: Step) => void
  setDescription: (d: string) => void
  setDraft: (d: string) => void
}

export const useStudio = create<StudioState>()(
  persist(
    (set, get) => ({
      request: null,
      pristine: null,
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
      auditioning: null,
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
      partialize: (s) => ({
        description: s.description,
        draft: s.draft,
        lastId: s.current?.id ?? s.lastId,
        request: s.request,
        pristine: s.pristine,
      }),
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
    let reused = 0
    const started = performance.now()
    const batch = uid()
    const baseTime = Date.now()
    for (let i = 0; i < parsed.recipes.length; i++) {
      const recipe = parsed.recipes[i]
      const json = JSON.stringify(parsed.raws[i], null, 2)

      // Receita idêntica a uma do histórico: reaproveita em vez de duplicar
      const existing = useHistory.getState().items.find((it) => it.json === json)
      if (existing) {
        reused++
        if (!firstCurrent) {
          const r = await renderItem(existing)
          if (r) firstCurrent = { id: existing.id, recipe: r.recipe, json, result: r.result }
        }
        continue
      }

      const result = await renderRecipe(recipe)
      const id = uid()
      remember(id, result)
      items.push({
        id,
        name: recipe.name,
        description: recipe.description,
        tags: recipe.tags,
        json,
        createdAt: baseTime + (parsed.recipes.length - i),
        duration: result.duration,
        sampleRate: result.sampleRate,
        channels: result.channels.length,
        layers: recipe.layers.length,
        peaks: miniPeaks(result.channels),
        favorite: false,
        batch,
        kinds: layerKinds(recipe),
      })
      if (!firstCurrent) firstCurrent = { id, recipe, json, result }
    }
    // espera mínima para a animação de "gerando" respirar
    const elapsed = performance.now() - started
    if (elapsed < 450) await new Promise((r) => setTimeout(r, 450 - elapsed))

    if (items.length) {
      const request = useStudio.getState().request
      useHistory.getState().addGeneration(
        {
          id: batch,
          createdAt: baseTime,
          kind: request?.kind ?? "manual",
          request: request?.text.trim() ?? "",
          parentName: request?.parentName,
        },
        items,
      )
    }
    if (!firstCurrent) return
    // o pedido foi usado; o editor fica "intacto" até o usuário mexer nele
    useStudio.setState({ current: firstCurrent, muted: [], solo: null, request: null, pristine: text })
    useStudio.getState().setStep(3)

    if (parsed.warnings.length) {
      toast.warning(`${parsed.warnings.length} ${parsed.warnings.length > 1 ? "propriedades ignoradas" : "propriedade ignorada"}`, {
        description: parsed.warnings
          .slice(0, 3)
          .map((w) => w.path ?? w.message)
          .join(", "),
      })
    }
    if (items.length > 1) {
      toast.success(`${items.length} sons gerados`, { description: "Todos aparecem juntos acima do player e no histórico." })
    } else if (reused && !items.length) {
      toast.info(reused > 1 ? "Esses sons já estavam no histórico" : "Esse som já estava no histórico", {
        description: "Abri o que já existia em vez de criar uma cópia.",
      })
    }

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

function layerKinds(recipe: Recipe): LayerType[] {
  const count = new Map<LayerType, number>()
  for (const l of recipe.layers) count.set(l.type, (count.get(l.type) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

export function editRecipe(json: string, name?: string) {
  useStudio.setState({ draft: json, pristine: json, request: { kind: "edicao", text: "", parentName: name } })
  useStudio.getState().setStep(2)
}

/** Carrega uma receita de exemplo no editor. */
export function loadExample(json: string, name: string) {
  useStudio.setState({ draft: json, pristine: json, request: { kind: "exemplo", text: name } })
  useStudio.getState().setStep(2)
}

/** Começa um som do zero: limpa descrição, editor e pedido pendente. */
export function startNew() {
  player.stop()
  useStudio.setState({ description: "", draft: "", request: null, pristine: null })
  useStudio.getState().setStep(1)
}

/** Reaproveita um pedido antigo como ponto de partida. */
export function reuseRequest(text: string) {
  useStudio.setState({ description: text, draft: "", request: null, pristine: null })
  useStudio.getState().setStep(1)
}

/** Edita o texto do pedido que vai rotular a próxima geração. */
export function setRequestText(text: string) {
  const prev = useStudio.getState().request
  if (!text && (!prev || prev.kind === "manual")) useStudio.setState({ request: null })
  else useStudio.setState({ request: { kind: prev?.kind ?? "manual", text, parentName: prev?.parentName } })
}

/** Exclui sons do histórico, com opção de desfazer. */
export function removeSounds(items: HistoryItem[]) {
  if (!items.length) return
  const removed = useHistory.getState().remove(items.map((i) => i.id))
  for (const i of items) forgetRender(i.id)
  const cur = useStudio.getState().current
  if (cur && items.some((i) => i.id === cur.id)) useStudio.setState({ current: null, lastId: null })
  toast(items.length === 1 ? `“${items[0].name}” excluído` : `${items.length} sons excluídos`, {
    action: { label: "Desfazer", onClick: () => useHistory.getState().restore(removed) },
  })
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
    useStudio.setState({ request: { kind: "novo", text: useStudio.getState().description.trim() } })
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

/* ----------------------------- Ajustes rápidos ---------------------------- */

export type Tweak = { transpose?: number; speed?: number }

let tweakToken = 0

/**
 * Muda tom e/ou velocidade do som atual sem passar pela IA. O ajuste é gravado
 * na própria receita (campos "transpose" e "speed") e o histórico é atualizado.
 */
export async function applyTweak(patch: Tweak) {
  const cur = useStudio.getState().current
  if (!cur) return
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(cur.json)
  } catch {
    return
  }
  const write = (key: string, aliases: string[], value: number | undefined, neutral: number) => {
    if (value === undefined) return
    for (const a of aliases) delete raw[a]
    if (value === neutral) delete raw[key]
    else raw[key] = value
  }
  write("transpose", ["pitchShift", "semitones", "transposicao"], patch.transpose, 0)
  write("speed", ["playbackRate", "velocidade"], patch.speed, 1)

  const json = JSON.stringify(raw, null, 2)
  if (json === cur.json) return
  const parsed = parseRecipeText(json)
  if (!parsed.ok) {
    toast.error("Não foi possível aplicar o ajuste", { description: parsed.errors[0]?.message })
    return
  }
  const recipe = parsed.recipes[0]
  const token = ++tweakToken
  useStudio.setState({ rerendering: true })
  try {
    const { muted, solo } = useStudio.getState()
    const full = await renderRecipe(recipe)
    const mixed = muted.length || solo !== null ? await renderRecipe(recipe, { mutedLayers: new Set(muted), soloLayer: solo }) : full
    if (token !== tweakToken || useStudio.getState().current?.id !== cur.id) return

    remember(cur.id, full)
    useHistory.getState().update(cur.id, { json, duration: full.duration, peaks: miniPeaks(full.channels) })

    const wasPlaying = player.playing && player.key === cur.id
    const fraction = cur.result.duration > 0 ? player.position / cur.result.duration : 0
    player.invalidate(cur.id)
    useStudio.setState({ current: { id: cur.id, recipe, json, result: mixed } })
    if (wasPlaying) await player.play(cur.id, mixed, Math.min(fraction, 0.98) * mixed.duration)
    else if (useSettings.getState().autoPlay) await player.play(cur.id, mixed, 0)
  } finally {
    if (token === tweakToken) useStudio.setState({ rerendering: false })
  }
}

/* --------------------------------- Prévia --------------------------------- */

export const PREVIEW_KEY = "preview"

/** Sintetiza e toca uma receita sem salvar no histórico (prévia do editor, exemplos). */
export async function audition(key: string, text: string) {
  if (player.key === key && player.playing) {
    player.stop()
    return
  }
  const parsed = parseRecipeText(text)
  if (!parsed.ok) {
    const first = parsed.errors[0]
    toast.error("A receita ainda tem erros", { description: first ? `${first.line ? `Linha ${first.line}: ` : ""}${first.message}` : undefined })
    return
  }
  useStudio.setState({ auditioning: key })
  try {
    const result = await renderRecipe(parsed.recipes[0])
    player.invalidate(key)
    await player.play(key, result, 0)
  } catch (err) {
    toast.error("Falha ao sintetizar a prévia", { description: err instanceof Error ? err.message : String(err) })
  } finally {
    useStudio.setState({ auditioning: null })
  }
}

/* ------------------------- Pedidos para a IA e link ----------------------- */

async function copyWithToast(text: string, title: string, description: string) {
  const ok = await copyText(text)
  if (ok) toast.success(title, { description })
  else toast.error("Não foi possível copiar automaticamente", { description: "Seu navegador bloqueou a área de transferência." })
  return ok
}

export function refinePrompt(json: string, change: string, variations = 1) {
  const { includeFormat, promptExtra } = useSettings.getState()
  return buildRefinePrompt({ json, change, variations, includeFormat, extra: promptExtra })
}

export async function copyRefinePrompt(json: string, change: string, variations = 1, parentName?: string) {
  const ok = await copyWithToast(
    refinePrompt(json, change, variations),
    "Pedido de ajuste copiado!",
    "Cole na IA e traga a nova receita para a etapa Receita.",
  )
  // o editor fica pronto para receber a resposta: colar substitui a receita antiga
  if (ok) useStudio.setState({ request: { kind: "ajuste", text: change.trim(), parentName }, draft: json, pristine: json })
  return ok
}

export function copyFixPrompt(text: string, errors: Diagnostic[]) {
  const prompt = buildFixPrompt({ text, errors, includeFormat: useSettings.getState().includeFormat })
  return copyWithToast(prompt, "Pedido de correção copiado!", "Cole na IA e substitua a receita pela versão corrigida.")
}

export async function copyShareLink(json: string) {
  const url = shareUrl(json)
  if (url.length > MAX_SHARE_LENGTH) {
    toast.warning("Receita grande demais para um link", { description: "Baixe a Receita JSON em Exportar e envie o arquivo." })
    return false
  }
  return copyWithToast(url, "Link copiado!", "Quem abrir o link recebe a receita pronta para gerar o som.")
}

/** Se o endereço traz uma receita (#r=...), carrega no editor e limpa o endereço. */
export function importFromHash() {
  if (typeof window === "undefined" || !window.location.hash) return false
  const json = decodeRecipe(window.location.hash)
  if (json === null) return false
  window.history.replaceState(null, "", window.location.pathname + window.location.search)
  let name = ""
  try {
    name = String(JSON.parse(json).name ?? "")
  } catch {
    /* sem nome */
  }
  useStudio.setState({ draft: json, pristine: json, request: { kind: "link", text: name } })
  useStudio.getState().setStep(2)
  toast.success(name ? `Receita “${name}” recebida por link` : "Receita recebida por link", {
    description: "Confira no editor e clique em Gerar som.",
  })
  return true
}
