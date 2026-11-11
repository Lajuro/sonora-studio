"use client"

import { zipSync } from "fflate"
import { toast } from "sonner"
import { downloadBlob, getFormat, slugify } from "@/lib/audio/export"
import { useHistory, type Backup, type HistoryItem } from "@/stores/history"
import { getRenderForItem } from "@/stores/studio"

export async function quickExport(item: HistoryItem, formatId: string) {
  const format = getFormat(formatId)
  if (!format) return
  const id = toast.loading(`Preparando ${format.label}…`)
  try {
    const r = await getRenderForItem(item)
    if (!r) return toast.dismiss(id)
    const blob = await format.encode(
      { channels: r.result.channels, sampleRate: r.result.sampleRate },
      { title: item.name, recipeJson: item.json },
    )
    const filename = `${slugify(item.name)}.${format.ext}`
    downloadBlob(blob, filename)
    toast.success(`${filename} salvo`, { id })
  } catch (err) {
    toast.error("Falha ao exportar", { id, description: err instanceof Error ? err.message : String(err) })
  }
}

/** Baixa todo o histórico num .zip com áudio + receita de cada som. */
export async function exportAllZip(items: HistoryItem[], formatId = "wav16", label = "sonora") {
  if (!items.length) return
  const format = getFormat(formatId) ?? getFormat("wav16")!
  const id = toast.loading(`Empacotando 0 de ${items.length}…`)
  try {
    const files: Record<string, Uint8Array> = {}
    const used = new Map<string, number>()
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      toast.loading(`Empacotando ${i + 1} de ${items.length}…`, { id, description: item.name })
      const r = await getRenderForItem(item)
      if (!r) continue
      let base = slugify(item.name)
      const n = used.get(base) ?? 0
      used.set(base, n + 1)
      if (n) base = `${base}-${n + 1}`
      const blob = await format.encode(
        { channels: r.result.channels, sampleRate: r.result.sampleRate },
        { title: item.name, recipeJson: item.json },
      )
      files[`sonora/${base}.${format.ext}`] = new Uint8Array(await blob.arrayBuffer())
      files[`sonora/receitas/${base}.json`] = new TextEncoder().encode(item.json)
    }
    const zipped = zipSync(files, { level: 0 })
    const stamp = new Date().toISOString().slice(0, 10)
    const filename = `${slugify(label)}-${stamp}.zip`
    downloadBlob(new Blob([zipped as Uint8Array<ArrayBuffer>], { type: "application/zip" }), filename)
    toast.success(`${items.length} ${items.length === 1 ? "som exportado" : "sons exportados"}`, { id, description: filename })
  } catch (err) {
    toast.error("Falha ao gerar o .zip", { id, description: err instanceof Error ? err.message : String(err) })
  }
}

export function exportBackup() {
  const { items, generations, collections } = useHistory.getState()
  const data = JSON.stringify({ app: "sonora", version: 2, exportedAt: new Date().toISOString(), items, generations, collections }, null, 2)
  const stamp = new Date().toISOString().slice(0, 10)
  downloadBlob(new Blob([data], { type: "application/json" }), `sonora-historico-${stamp}.json`)
  toast.success("Backup do histórico salvo", { description: `${items.length} sons` })
}

export async function readBackup(file: File): Promise<Backup> {
  const parsed = JSON.parse(await file.text())
  const items = Array.isArray(parsed) ? parsed : parsed?.items
  if (!Array.isArray(items)) throw new Error("Arquivo não parece ser um backup do Sonora")
  return { items, generations: parsed?.generations, collections: parsed?.collections }
}
