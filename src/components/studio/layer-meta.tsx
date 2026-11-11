import { AudioWaveformIcon, BellIcon, DrumIcon, GuitarIcon, ListMusicIcon, WindIcon, type LucideIcon } from "lucide-react"
import type { LayerType } from "@/lib/recipe/schema"

export const LAYER_META: Record<LayerType, { label: string; icon: LucideIcon; color: string; hint: string }> = {
  tone: { label: "Tom", icon: AudioWaveformIcon, color: "var(--type-tone)", hint: "Oscilador" },
  noise: { label: "Ruído", icon: WindIcon, color: "var(--type-noise)", hint: "Ruído filtrado" },
  fm: { label: "FM", icon: BellIcon, color: "var(--type-fm)", hint: "Síntese FM" },
  pluck: { label: "Corda", icon: GuitarIcon, color: "var(--type-pluck)", hint: "Karplus-Strong" },
  drum: { label: "Bateria", icon: DrumIcon, color: "var(--type-drum)", hint: "Percussão sintetizada" },
  sequence: { label: "Sequência", icon: ListMusicIcon, color: "var(--type-sequence)", hint: "Notas em sequência" },
}
