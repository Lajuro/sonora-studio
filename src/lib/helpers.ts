/** Utilitários gerais da interface. */

export function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID()
    } catch {
      /* contexto inseguro (http) */
    }
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Copia texto para a área de transferência. Em redes corporativas o app pode
 * rodar em http (sem a Clipboard API), então há um plano B com execCommand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* cai para o plano B */
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.position = "fixed"
    ta.style.top = "-1000px"
    ta.style.opacity = "0"
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export async function readClipboard(): Promise<string | null> {
  try {
    if (navigator.clipboard?.readText && window.isSecureContext) return await navigator.clipboard.readText()
  } catch {
    /* permissão negada */
  }
  return null
}

export function formatTime(seconds: number, precise = true) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  if (!precise) return `${m}:${Math.floor(s).toString().padStart(2, "0")}`
  return `${m}:${s.toFixed(2).padStart(5, "0")}`
}

export function formatDuration(seconds: number) {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1).replace(".", ",")} s`
  return formatTime(seconds, false)
}

export function formatDb(db: number) {
  if (!Number.isFinite(db)) return "−∞ dB"
  return `${db.toFixed(1).replace(".", ",").replace("-", "−")} dB`
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" }) : null

export function timeAgo(ts: number, now = Date.now()) {
  const diff = (ts - now) / 1000
  const abs = Math.abs(diff)
  if (!rtf) return new Date(ts).toLocaleString("pt-BR")
  if (abs < 45) return "agora"
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour")
  if (abs < 86400 * 7) return rtf.format(Math.round(diff / 86400), "day")
  return new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
}

export function dateGroup(ts: number, now = new Date()): string {
  const d = new Date(ts)
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((start(now) - start(d)) / 86400000)
  if (days <= 0) return "Hoje"
  if (days === 1) return "Ontem"
  if (days < 7) return "Esta semana"
  if (days < 31) return "Este mês"
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
}

export const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
