"use client"

import dynamic from "next/dynamic"
import { LogoMark } from "./logo"

function Splash() {
  return (
    <div className="grid h-dvh place-items-center bg-background bg-glow">
      <div className="flex flex-col items-center gap-4">
        <LogoMark active className="size-12 rounded-2xl" />
        <span className="font-pixel text-xs tracking-[0.3em] text-muted-foreground uppercase">Sonora</span>
      </div>
    </div>
  )
}

/** O estúdio depende de Web Audio e localStorage: renderiza só no navegador. */
const AppShell = dynamic(() => import("./app-shell").then((m) => m.AppShell), {
  ssr: false,
  loading: Splash,
})

export function StudioRoot() {
  return <AppShell />
}
