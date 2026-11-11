"use client"

import { useTheme } from "next-themes"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { EXPORT_FORMATS } from "@/lib/audio/export"
import { useSettings } from "@/stores/settings"
import { useUi } from "@/stores/ui"

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen)
  const setUi = useUi((s) => s.set)
  const s = useSettings()
  const { theme, setTheme } = useTheme()

  return (
    <Dialog open={open} onOpenChange={(o) => setUi({ settingsOpen: o })}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
          <DialogDescription>Ficam salvas neste navegador.</DialogDescription>
        </DialogHeader>

        <section>
          <h4 className="pt-2 text-sm font-semibold">Prompt</h4>
          <div className="divide-y">
            <Row title="Versão do prompt" hint="Compacto ajuda em chats com limite de caracteres">
              <ToggleGroup type="single" size="sm" variant="outline" value={s.promptMode} onValueChange={(v) => v && s.set({ promptMode: v as "full" | "compact" })}>
                <ToggleGroupItem value="full" className="px-2.5 text-xs">
                  Completo
                </ToggleGroupItem>
                <ToggleGroupItem value="compact" className="px-2.5 text-xs">
                  Compacto
                </ToggleGroupItem>
              </ToggleGroup>
            </Row>
            <Row title="Variações por pedido" hint="A IA devolve várias receitas de uma vez">
              <ToggleGroup type="single" size="sm" variant="outline" value={String(s.variations)} onValueChange={(v) => v && s.set({ variations: Number(v) })}>
                {[1, 2, 3, 4].map((n) => (
                  <ToggleGroupItem key={n} value={String(n)} className="w-8 text-xs">
                    {n}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Row>
            <Row title="Formato nos pedidos de ajuste" hint="Pedidos de ajuste e correção levam a referência do formato">
              <Switch checked={s.includeFormat} onCheckedChange={(v) => s.set({ includeFormat: v })} />
            </Row>
            <div className="space-y-2 py-3">
              <Label htmlFor="extra" className="text-sm font-medium">
                Instruções extras
              </Label>
              <Textarea
                id="extra"
                value={s.promptExtra}
                onChange={(e) => s.set({ promptExtra: e.target.value })}
                placeholder="Ex.: sons sempre curtos e discretos, adequados para um ambiente de escritório; evite frequências muito agudas."
                className="min-h-20 text-sm"
              />
              <p className="text-xs text-muted-foreground">Entram em todo prompt e pedido de ajuste copiado.</p>
            </div>
          </div>
        </section>

        <section>
          <h4 className="pt-2 text-sm font-semibold">Reprodução e exportação</h4>
          <div className="divide-y">
            <Row title="Tocar ao gerar" hint="Reproduz automaticamente o som recém-criado">
              <Switch checked={s.autoPlay} onCheckedChange={(v) => s.set({ autoPlay: v })} />
            </Row>
            <Row title="Formato padrão">
              <Select value={s.defaultFormat} onValueChange={(v) => s.set({ defaultFormat: v })}>
                <SelectTrigger size="sm" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMATS.filter((f) => f.available()).map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
            <Row title="Tema">
              <ToggleGroup type="single" size="sm" variant="outline" value={theme} onValueChange={(v) => v && setTheme(v)}>
                <ToggleGroupItem value="light" className="px-2.5 text-xs">
                  Claro
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" className="px-2.5 text-xs">
                  Escuro
                </ToggleGroupItem>
                <ToggleGroupItem value="system" className="px-2.5 text-xs">
                  Sistema
                </ToggleGroupItem>
              </ToggleGroup>
            </Row>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  )
}
