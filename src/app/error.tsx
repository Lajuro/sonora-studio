"use client"

import { useEffect } from "react"
import { Button } from "@/components/ui/button"

/**
 * Tela de recuperação: aparece se algo inesperado quebrar a interface.
 * O histórico continua salvo; dá para tentar de novo ou descartar só o
 * rascunho, que é o que costuma causar o problema.
 */
export default function ErrorScreen({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  const message = error instanceof Error ? error.message : String(error)

  return (
    <div className="grid h-dvh place-items-center bg-background bg-glow p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
        <p className="font-pixel text-xs tracking-[0.3em] text-muted-foreground uppercase">Sonora</p>
        <h1 className="mt-3 text-xl font-semibold tracking-tight">Algo saiu do tom</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A interface encontrou um erro inesperado. Seu histórico de sons continua salvo neste navegador.
        </p>
        <pre className="mt-4 max-h-28 overflow-auto rounded-lg bg-muted p-3 text-left font-mono text-xs whitespace-pre-wrap text-muted-foreground">
          {message}
        </pre>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => retry()}>Tentar de novo</Button>
          <Button
            variant="outline"
            onClick={() => {
              try {
                localStorage.removeItem("sonora-studio")
              } catch {
                /* sem acesso ao armazenamento */
              }
              window.location.reload()
            }}
          >
            Descartar rascunho e recarregar
          </Button>
        </div>
      </div>
    </div>
  )
}
