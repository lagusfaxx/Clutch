import type { StatsJugador, StatsModo } from './client'

/**
 * Lee las stats que quedaron guardadas en `GhostProfile.cachedStats`.
 *
 * Hay dos formatos en la base. El actual guarda el desglose completo por
 * modo y dispositivo; el anterior guardaba solo tres números sueltos. Las
 * filas viejas se siguen leyendo hasta que caduquen solas y se reescriban,
 * así que ningún perfil se queda en blanco mientras tanto.
 */
export type StatsGuardadas = Pick<StatsJugador, 'detalle' | 'nivelPase'>

interface FormatoAntiguo {
  wins?: number | null
  kills?: number | null
  matchesPlayed?: number | null
}

const MODO_VACIO: StatsModo = {
  score: null,
  scorePerMin: null,
  scorePerMatch: null,
  wins: null,
  top3: null,
  top5: null,
  top6: null,
  top10: null,
  top12: null,
  top25: null,
  kills: null,
  killsPerMin: null,
  killsPerMatch: null,
  deaths: null,
  kd: null,
  matches: null,
  winRate: null,
  minutesPlayed: null,
  playersOutlived: null,
  lastModified: null,
}

export function leerStatsGuardadas(valor: unknown): StatsGuardadas | null {
  if (!valor || typeof valor !== 'object') return null

  const registro = valor as Record<string, unknown>

  if (registro.detalle && typeof registro.detalle === 'object') {
    return {
      detalle: registro.detalle as StatsJugador['detalle'],
      nivelPase: typeof registro.nivelPase === 'number' ? registro.nivelPase : null,
    }
  }

  const antiguo = registro as FormatoAntiguo
  if (antiguo.wins == null && antiguo.kills == null && antiguo.matchesPlayed == null) return null

  return {
    nivelPase: null,
    detalle: {
      all: {
        overall: {
          ...MODO_VACIO,
          wins: antiguo.wins ?? null,
          kills: antiguo.kills ?? null,
          matches: antiguo.matchesPlayed ?? null,
        },
      },
    },
  }
}
