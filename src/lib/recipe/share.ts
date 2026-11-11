import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate"

/**
 * Compartilhamento por link: a receita vai compactada dentro do próprio
 * endereço (depois do #), então não depende de servidor nem de banco.
 */

const PREFIX = "r="
export const MAX_SHARE_LENGTH = 12_000

function toBase64Url(bytes: Uint8Array) {
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(text: string) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/")
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function encodeRecipe(json: string): string {
  let compactJson = json
  try {
    compactJson = JSON.stringify(JSON.parse(json))
  } catch {
    /* mantém como veio */
  }
  return PREFIX + toBase64Url(deflateSync(strToU8(compactJson), { level: 9 }))
}

/** Lê a receita de um hash de URL ("#r=..."). Devolve null se não for um link do Sonora. */
export function decodeRecipe(hash: string): string | null {
  const h = hash.replace(/^#/, "")
  if (!h.startsWith(PREFIX)) return null
  try {
    const json = strFromU8(inflateSync(fromBase64Url(h.slice(PREFIX.length))))
    return JSON.stringify(JSON.parse(json), null, 2)
  } catch {
    return null
  }
}

export function shareUrl(json: string, base = `${window.location.origin}${window.location.pathname}`) {
  return `${base}#${encodeRecipe(json)}`
}
