"use client"

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { isMac } from "@/lib/helpers"
import { useUi } from "@/stores/ui"

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen)
  const set = useUi((s) => s.set)
  const mod = isMac() ? "⌘" : "Ctrl"

  const groups: { title: string; items: [string, string[]][] }[] = [
    {
      title: "Geral",
      items: [
        ["Buscar e comandos", [mod, "K"]],
        ["Mostrar/ocultar histórico", [mod, "B"]],
        ["Configurações", [mod, ","]],
        ["Atalhos de teclado", ["?"]],
        ["Ir para a etapa 1, 2 ou 3", ["Alt", "1–3"]],
      ],
    },
    {
      title: "Criação",
      items: [
        ["Copiar prompt", [mod, "Shift", "C"]],
        ["Gerar som da receita", [mod, "Enter"]],
        ["Ouvir prévia (no editor)", ["Alt", "Enter"]],
      ],
    },
    {
      title: "Reprodução",
      items: [
        ["Tocar / pausar", ["Espaço"]],
        ["Parar", ["Esc"]],
        ["Avançar / voltar (na onda)", ["←", "→"]],
      ],
    },
    {
      title: "Histórico (item focado)",
      items: [
        ["Abrir", ["Enter"]],
        ["Renomear", ["F2"]],
        ["Excluir", ["Del"]],
      ],
    },
  ]

  return (
    <Dialog open={open} onOpenChange={(o) => set({ shortcutsOpen: o })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Atalhos de teclado</DialogTitle>
          <DialogDescription>Para usar o Sonora sem tirar a mão do teclado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</p>
              <ul className="divide-y rounded-lg border">
                {g.items.map(([label, keys]) => (
                  <li key={label} className="flex items-center justify-between px-3 py-2 text-sm">
                    {label}
                    <KbdGroup>
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </KbdGroup>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
