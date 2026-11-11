"use client"

import { CheckIcon } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { COLLECTION_COLORS, useHistory } from "@/stores/history"
import { useUi } from "@/stores/ui"

function CollectionForm({ onDone }: { onDone: () => void }) {
  const dialog = useUi((s) => s.collectionDialog)!
  const existing = useHistory((s) => (dialog.mode === "renomear" ? s.collections.find((c) => c.id === dialog.id) : undefined))
  const count = useHistory((s) => s.collections.length)
  const [name, setName] = useState(existing?.name ?? "")
  const [color, setColor] = useState(existing?.color ?? COLLECTION_COLORS[count % COLLECTION_COLORS.length])
  const moving = dialog.mode === "criar" ? (dialog.moveIds?.length ?? 0) : 0

  const save = () => {
    const h = useHistory.getState()
    if (dialog.mode === "renomear") h.updateCollection(dialog.id, { name: name.trim() || existing?.name || "Coleção", color })
    else {
      const id = h.createCollection(name, color)
      if (dialog.moveIds?.length) h.moveToCollection(dialog.moveIds, id)
    }
    onDone()
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      className="contents"
    >
      <DialogHeader>
        <DialogTitle>{dialog.mode === "renomear" ? "Editar coleção" : "Nova coleção"}</DialogTitle>
        <DialogDescription>
          {moving
            ? `${moving === 1 ? "O som escolhido vai" : `Os ${moving} sons escolhidos vão`} direto para ela.`
            : "Coleções juntam sons de pedidos diferentes, como as pastas de um projeto."}
        </DialogDescription>
      </DialogHeader>
      <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: App do banco, Notificações, Jogo" maxLength={40} />
      <div className="flex items-center gap-2" role="radiogroup" aria-label="Cor da coleção">
        {COLLECTION_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={color === c}
            aria-label={`Cor ${c}`}
            onClick={() => setColor(c)}
            className={cn(
              "grid size-7 place-items-center rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring",
              color === c && "scale-110",
            )}
            style={{ background: c }}
          >
            {color === c && <CheckIcon className="size-3.5 text-black/70" strokeWidth={3} />}
          </button>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit">{dialog.mode === "renomear" ? "Salvar" : "Criar coleção"}</Button>
      </DialogFooter>
    </form>
  )
}

export function CollectionDialog() {
  const dialog = useUi((s) => s.collectionDialog)
  const close = () => useUi.getState().set({ collectionDialog: null })
  return (
    <Dialog open={Boolean(dialog)} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-sm">{dialog && <CollectionForm onDone={close} />}</DialogContent>
    </Dialog>
  )
}
