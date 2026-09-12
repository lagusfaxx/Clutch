import { z } from 'zod'
import { ErrorClutch } from '@/lib/errores'

/**
 * Tabla de puntaje configurable por torneo. Vive en Tournament.scoringConfig
 * y es la única fuente para calcular puntos: el cliente nunca los manda (§3).
 */
export const esquemaPuntaje = z.object({
  /** Puntos por tramo de posición, de mejor a peor. `hasta` es inclusivo. */
  porPosicion: z
    .array(z.object({ hasta: z.number().int().positive(), puntos: z.number().int().min(0) }))
    .min(1),
  porEliminacion: z.number().int().min(0).default(1),
  /** Tope de eliminaciones contabilizadas por partida. 0 = sin tope. */
  topeEliminaciones: z.number().int().min(0).default(0),
})

export type ConfigPuntaje = z.infer<typeof esquemaPuntaje>

export const PUNTAJE_FNCS: ConfigPuntaje = {
  porPosicion: [
    { hasta: 1, puntos: 60 },
    { hasta: 3, puntos: 45 },
    { hasta: 5, puntos: 35 },
    { hasta: 10, puntos: 25 },
    { hasta: 15, puntos: 20 },
    { hasta: 25, puntos: 10 },
    { hasta: 100, puntos: 3 },
  ],
  porEliminacion: 2,
  topeEliminaciones: 0,
}

export function leerConfig(bruto: unknown): ConfigPuntaje {
  const parsed = esquemaPuntaje.safeParse(bruto)
  if (!parsed.success) {
    throw new ErrorClutch('VALIDACION', 'La tabla de puntaje del torneo está mal configurada.', parsed.error.issues)
  }
  return parsed.data
}

export function puntosPorPosicion(config: ConfigPuntaje, posicion: number): number {
  const tramos = [...config.porPosicion].sort((a, b) => a.hasta - b.hasta)
  for (const tramo of tramos) {
    if (posicion <= tramo.hasta) return tramo.puntos
  }
  return 0
}

/** Cálculo autoritativo. Siempre en el servidor, siempre desde scoringConfig. */
export function calcularPuntos(config: ConfigPuntaje, posicion: number, eliminaciones: number): number {
  if (posicion < 1) throw new ErrorClutch('VALIDACION', 'La posición tiene que ser 1 o mayor.')
  if (eliminaciones < 0) throw new ErrorClutch('VALIDACION', 'Las eliminaciones no pueden ser negativas.')
  const elims = config.topeEliminaciones > 0 ? Math.min(eliminaciones, config.topeEliminaciones) : eliminaciones
  return puntosPorPosicion(config, posicion) + elims * config.porEliminacion
}

/**
 * Suma del torneo: solo las mejores `matchesCounted` partidas (ej: 6 de 8).
 */
export function totalTorneo(puntosPorPartida: number[], matchesCounted: number): number {
  return [...puntosPorPartida]
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, matchesCounted))
    .reduce((suma, p) => suma + p, 0)
}
