/**
 * Glicko-2 (Glickman 2013). Implementación pura, sin dependencias.
 * Escala interna μ/φ con factor 173.7178 respecto de la escala visible.
 */

export const ESCALA = 173.7178
export const RATING_BASE = 1500
export const DEVIACION_BASE = 350
export const VOLATILIDAD_BASE = 0.06

/** τ: cuánto se permite que la volatilidad cambie de una vez. Bajo = más estable. */
const TAU = 0.5
const EPSILON = 0.000001

export interface Calificacion {
  rating: number
  deviation: number
  volatility: number
}

export interface Enfrentamiento {
  rival: Calificacion
  /** 1 ganó, 0.5 empató, 0 perdió. */
  resultado: number
  /** Peso del enfrentamiento (tamaño del torneo). 1 = neutro. */
  peso?: number
}

export function calificacionInicial(): Calificacion {
  return { rating: RATING_BASE, deviation: DEVIACION_BASE, volatility: VOLATILIDAD_BASE }
}

function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
}

function e(mu: number, muRival: number, phiRival: number): number {
  return 1 / (1 + Math.exp(-g(phiRival) * (mu - muRival)))
}

function nuevaVolatilidad(phi: number, v: number, delta: number, sigma: number): number {
  const a = Math.log(sigma * sigma)
  const f = (x: number): number => {
    const ex = Math.exp(x)
    const num = ex * (delta * delta - phi * phi - v - ex)
    const den = 2 * Math.pow(phi * phi + v + ex, 2)
    return num / den - (x - a) / (TAU * TAU)
  }

  let A = a
  let B: number
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v)
  } else {
    let k = 1
    while (f(a - k * TAU) < 0) k += 1
    B = a - k * TAU
  }

  let fa = f(A)
  let fb = f(B)
  let vueltas = 0
  while (Math.abs(B - A) > EPSILON && vueltas < 100) {
    const C = A + ((A - B) * fa) / (fb - fa)
    const fc = f(C)
    if (fc * fb <= 0) {
      A = B
      fa = fb
    } else {
      fa = fa / 2
    }
    B = C
    fb = fc
    vueltas += 1
  }
  return Math.exp(A / 2)
}

/**
 * Actualiza una calificación con todos los enfrentamientos de un periodo.
 * Sin enfrentamientos, solo crece la incertidumbre (§2.5: el ranking no se congela).
 */
export function actualizar(actual: Calificacion, partidos: Enfrentamiento[]): Calificacion {
  const mu = (actual.rating - RATING_BASE) / ESCALA
  const phi = actual.deviation / ESCALA

  if (partidos.length === 0) {
    const phiNuevo = Math.min(Math.sqrt(phi * phi + actual.volatility * actual.volatility), DEVIACION_BASE / ESCALA)
    return { rating: actual.rating, deviation: phiNuevo * ESCALA, volatility: actual.volatility }
  }

  let sumaV = 0
  let sumaDelta = 0
  for (const p of partidos) {
    const peso = p.peso ?? 1
    const muR = (p.rival.rating - RATING_BASE) / ESCALA
    const phiR = p.rival.deviation / ESCALA
    const gR = g(phiR)
    const eR = e(mu, muR, phiR)
    sumaV += peso * gR * gR * eR * (1 - eR)
    sumaDelta += peso * gR * (p.resultado - eR)
  }

  const v = 1 / sumaV
  const delta = v * sumaDelta
  const sigma = nuevaVolatilidad(phi, v, delta, actual.volatility)
  const phiEstrella = Math.sqrt(phi * phi + sigma * sigma)
  const phiNuevo = 1 / Math.sqrt(1 / (phiEstrella * phiEstrella) + 1 / v)
  const muNuevo = mu + phiNuevo * phiNuevo * sumaDelta

  return {
    rating: muNuevo * ESCALA + RATING_BASE,
    deviation: Math.min(phiNuevo * ESCALA, DEVIACION_BASE),
    volatility: sigma,
  }
}

/**
 * Peso logarítmico por tamaño de torneo (§2.5): ganar con 80 inscritos
 * vale más que con 12, pero no seis veces más.
 */
export function pesoPorTamano(inscritos: number): number {
  if (inscritos <= 1) return 0
  return Math.log2(inscritos) / Math.log2(32)
}

/** Decay por inactividad: 15 puntos cada 30 días sin competir. */
export function aplicarDecay(actual: Calificacion, diasInactivo: number): Calificacion {
  const bloques = Math.floor(diasInactivo / 30)
  if (bloques <= 0) return actual
  return {
    rating: Math.max(RATING_BASE - 500, actual.rating - 15 * bloques),
    deviation: Math.min(DEVIACION_BASE, actual.deviation + 10 * bloques),
    volatility: actual.volatility,
  }
}

/**
 * Cierre de temporada: soft reset. Los puntos se comprimen hacia la media,
 * no se borran, y la incertidumbre vuelve a subir.
 */
export function softReset(actual: Calificacion): Calificacion {
  return {
    rating: RATING_BASE + (actual.rating - RATING_BASE) * 0.4,
    deviation: Math.min(DEVIACION_BASE, Math.max(actual.deviation, 150)),
    volatility: VOLATILIDAD_BASE,
  }
}

/**
 * Convierte una tabla de posiciones en enfrentamientos par a par.
 * Es lo que permite usar Glicko-2 en formato de puntos acumulados,
 * donde no hay duelos 1v1 reales.
 */
export function enfrentamientosDesdeTabla(
  tabla: { id: string; posicion: number; calificacion: Calificacion }[],
  peso: number,
): Map<string, Enfrentamiento[]> {
  const salida = new Map<string, Enfrentamiento[]>()
  for (const jugador of tabla) salida.set(jugador.id, [])

  for (let i = 0; i < tabla.length; i += 1) {
    for (let j = i + 1; j < tabla.length; j += 1) {
      const a = tabla[i]
      const b = tabla[j]
      if (!a || !b) continue
      const resultadoA = a.posicion === b.posicion ? 0.5 : a.posicion < b.posicion ? 1 : 0
      salida.get(a.id)?.push({ rival: b.calificacion, resultado: resultadoA, peso })
      salida.get(b.id)?.push({ rival: a.calificacion, resultado: 1 - resultadoA, peso })
    }
  }
  return salida
}
