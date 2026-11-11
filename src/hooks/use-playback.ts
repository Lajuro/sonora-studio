"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { player, usePlayer } from "@/lib/audio/player"

/** Posição de reprodução atualizada a cada quadro, só para o som indicado. */
export function usePlaybackPosition(key: string | null | undefined) {
  const playing = usePlayer((s) => s.playing && s.key === key)
  const activeKey = usePlayer((s) => s.key)
  const version = usePlayer((s) => s.version)
  const [pos, setPos] = useState(0)
  const raf = useRef(0)

  const active = Boolean(key) && activeKey === key

  useEffect(() => {
    if (!active) return
    const tick = () => {
      setPos(player.position)
      if (player.playing) raf.current = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf.current)
  }, [active, playing, version])

  return active ? pos : 0
}

export function useIsPlaying(key: string | null | undefined) {
  return usePlayer((s) => Boolean(key) && s.playing && s.key === key)
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
