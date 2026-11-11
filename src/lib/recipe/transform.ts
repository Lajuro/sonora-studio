import type { Effect, Envelope, Filter, Layer, Lfo, ParamSpec, Recipe } from "./schema"

/**
 * Aplica os ajustes globais da receita ("transpose" e "speed") direto nas
 * camadas, devolvendo uma receita equivalente que o motor toca sem saber
 * que eles existem. Os campos continuam na receita só para exibição.
 *
 * - transpose: multiplica as frequências de tone, fm, pluck e das notas das
 *   sequências. Bateria e ruído ficam como estão.
 * - speed: encolhe ou estica todos os tempos (inícios, durações, envelopes,
 *   automações, bpm, ecos). A afinação não muda.
 */
export function applyGlobals(recipe: Recipe): Recipe {
  const ratio = Math.pow(2, recipe.transpose / 12)
  const k = 1 / recipe.speed
  if (ratio === 1 && k === 1) return recipe

  return {
    ...recipe,
    bpm: recipe.bpm !== undefined ? recipe.bpm * recipe.speed : undefined,
    duration: recipe.duration !== undefined ? recipe.duration * k : undefined,
    master: { ...recipe.master, effects: recipe.master.effects?.map((fx) => scaleEffect(fx, k, recipe.speed)) },
    layers: recipe.layers.map((layer) => transformLayer(layer, ratio, k, recipe.speed, recipe.bpm !== undefined)),
  }
}

function scaleParam(spec: ParamSpec, value: number, time: number): ParamSpec {
  switch (spec.kind) {
    case "static":
      return { kind: "static", value: spec.value * value }
    case "ramp":
      return {
        ...spec,
        from: spec.from * value,
        to: spec.to * value,
        time: spec.time !== undefined ? spec.time * time : undefined,
        delay: spec.delay * time,
      }
    case "points":
      return { ...spec, points: spec.points.map((p) => ({ time: p.time * time, value: p.value * value })) }
  }
}

const scaleEnvelope = (env: Envelope | undefined, k: number): Envelope | undefined =>
  env && { ...env, attack: env.attack * k, decay: env.decay * k, release: env.release * k }

const scaleFilters = (filters: Filter[] | undefined, k: number) =>
  filters?.map((f) => ({ ...f, frequency: scaleParam(f.frequency, 1, k) }))

const scaleLfos = (lfos: Lfo[] | undefined, k: number, speed: number) =>
  lfos?.map((l) => ({ ...l, rate: l.rate * speed, delay: l.delay * k, fadeIn: l.fadeIn * k }))

function scaleEffect(fx: Effect, k: number, speed: number): Effect {
  switch (fx.type) {
    case "delay":
      return { ...fx, time: Math.max(0.005, fx.time * k) }
    case "tremolo":
      return { ...fx, rate: fx.rate * speed }
    case "filter":
      return { ...fx, frequency: scaleParam(fx.frequency, 1, k) }
    default:
      return fx
  }
}

function transformLayer(layer: Layer, ratio: number, k: number, speed: number, recipeHasBpm: boolean): Layer {
  const common = {
    start: layer.start * k,
    pan: layer.pan && scaleParam(layer.pan, 1, k),
    filter: scaleFilters(layer.filter, k),
    lfo: scaleLfos(layer.lfo, k, speed),
    effects: layer.effects?.map((fx) => scaleEffect(fx, k, speed)),
    repeat: layer.repeat && {
      ...layer.repeat,
      interval: layer.repeat.interval !== undefined ? layer.repeat.interval * k : undefined,
    },
  }

  switch (layer.type) {
    case "tone":
      return {
        ...layer,
        ...common,
        duration: layer.duration * k,
        frequency: scaleParam(layer.frequency, ratio, k),
        envelope: scaleEnvelope(layer.envelope, k),
      }
    case "fm":
      return {
        ...layer,
        ...common,
        duration: layer.duration * k,
        frequency: scaleParam(layer.frequency, ratio, k),
        envelope: scaleEnvelope(layer.envelope, k),
        modulator: { ...layer.modulator, envelope: scaleEnvelope(layer.modulator.envelope, k) },
      }
    case "pluck":
      return {
        ...layer,
        ...common,
        duration: layer.duration * k,
        frequency: scaleParam(layer.frequency, ratio, k),
        envelope: scaleEnvelope(layer.envelope, k),
      }
    case "noise":
      return { ...layer, ...common, duration: layer.duration * k, envelope: scaleEnvelope(layer.envelope, k) }
    case "drum":
      return { ...layer, ...common, duration: layer.duration !== undefined ? layer.duration * k : undefined }
    case "sequence": {
      const v = layer.voice
      const inBeats = layer.bpm !== undefined || recipeHasBpm
      const voice =
        v.type === "drum"
          ? { ...v, filter: scaleFilters(v.filter, k), lfo: scaleLfos(v.lfo, k, speed) }
          : v.type === "fm"
            ? {
                ...v,
                filter: scaleFilters(v.filter, k),
                lfo: scaleLfos(v.lfo, k, speed),
                envelope: scaleEnvelope(v.envelope, k),
                modulator: { ...v.modulator, envelope: scaleEnvelope(v.modulator.envelope, k) },
              }
            : { ...v, filter: scaleFilters(v.filter, k), lfo: scaleLfos(v.lfo, k, speed), envelope: scaleEnvelope(v.envelope, k) }
      return {
        ...layer,
        ...common,
        // com bpm, os tempos das notas estão em batidas: basta acelerar o bpm
        bpm: layer.bpm !== undefined ? layer.bpm * speed : undefined,
        voice,
        notes: layer.notes.map((n) => ({
          ...n,
          time: inBeats ? n.time : n.time * k,
          duration: n.duration === undefined || inBeats ? n.duration : n.duration * k,
          pitches: v.type === "drum" ? n.pitches : n.pitches.map((p) => p * ratio),
        })),
      }
    }
  }
}

/** A receita tem alguma camada com afinação (onde "transpose" faz efeito)? */
export function hasPitchedLayers(recipe: Recipe) {
  return recipe.layers.some(
    (l) => l.type === "tone" || l.type === "fm" || l.type === "pluck" || (l.type === "sequence" && l.voice.type !== "drum" && l.voice.type !== "noise"),
  )
}
