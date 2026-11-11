import type { Curve, Envelope, ParamSpec } from "@/lib/recipe/schema"

const EPS = 0.0001
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

type ParamOpts = { scale?: number; min?: number; max?: number }

function rampTo(param: AudioParam, from: number, to: number, time: number, curve: Curve) {
  if (curve === "exponential" && from > 0 && to > 0) param.exponentialRampToValueAtTime(to, time)
  else param.linearRampToValueAtTime(to, time)
}

/** Programa um parâmetro (valor fixo, rampa ou pontos) a partir de t0. */
export function scheduleParam(param: AudioParam, spec: ParamSpec, t0: number, dur: number, opts: ParamOpts = {}) {
  const scale = opts.scale ?? 1
  const lo = opts.min ?? -Infinity
  const hi = opts.max ?? Infinity
  const v = (x: number) => clamp(x * scale, lo, hi)

  switch (spec.kind) {
    case "static":
      param.setValueAtTime(v(spec.value), t0)
      return
    case "ramp": {
      const start = t0 + spec.delay
      const time = spec.time ?? Math.max(0.001, dur - spec.delay)
      const from = v(spec.from)
      param.setValueAtTime(from, t0)
      if (spec.delay > 0) param.setValueAtTime(from, start)
      rampTo(param, from, v(spec.to), start + Math.max(0.0005, time), spec.curve)
      return
    }
    case "points": {
      const pts = [...spec.points].sort((a, b) => a.time - b.time)
      let prevV = v(pts[0].value)
      let prevT = t0 + pts[0].time
      param.setValueAtTime(prevV, t0)
      if (pts[0].time > 0) param.setValueAtTime(prevV, prevT)
      for (let i = 1; i < pts.length; i++) {
        const t = Math.max(prevT + 0.00001, t0 + pts[i].time)
        const val = v(pts[i].value)
        rampTo(param, prevV, val, t, spec.curve)
        prevV = val
        prevT = t
      }
      return
    }
  }
}

/** Primeiro valor de um parâmetro (útil quando a automação não se aplica). */
export function initialValue(spec: ParamSpec): number {
  switch (spec.kind) {
    case "static":
      return spec.value
    case "ramp":
      return spec.from
    case "points":
      return [...spec.points].sort((a, b) => a.time - b.time)[0].value
  }
}

/**
 * Envelope ADSR. "dur" é a duração total do som, já incluindo o release.
 * Se attack + decay + release não couberem, todos são encolhidos na mesma proporção.
 */
export function scheduleEnvelope(param: AudioParam, env: Envelope, t0: number, dur: number, peak: number) {
  let a = env.attack
  let d = env.decay
  let r = env.release
  const total = a + d + r
  if (total > dur && total > 0) {
    const k = dur / total
    a *= k
    d *= k
    r *= k
  }
  a = Math.max(a, 0.0008)
  const sus = peak * env.sustain
  const exp = env.curve === "exponential"

  param.setValueAtTime(0, t0)
  param.linearRampToValueAtTime(peak, t0 + a)

  const tD = t0 + a + d
  if (d > 0.0001) {
    if (exp) {
      param.exponentialRampToValueAtTime(Math.max(EPS, sus), tD)
      if (sus <= EPS) param.setValueAtTime(0, tD + 0.0001)
    } else param.linearRampToValueAtTime(sus, tD)
  } else {
    param.setValueAtTime(sus, tD + 0.0001)
  }

  const tEnd = t0 + dur
  const tR = Math.max(tD + 0.0002, tEnd - r)
  if (sus > EPS) {
    param.setValueAtTime(sus, tR)
    if (exp) param.exponentialRampToValueAtTime(EPS, Math.max(tR + 0.0005, tEnd))
    else param.linearRampToValueAtTime(0, Math.max(tR + 0.0005, tEnd))
  }
  param.setValueAtTime(0, Math.max(tR + 0.001, tEnd + 0.0005))
}
