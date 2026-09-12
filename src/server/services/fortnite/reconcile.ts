import { prisma } from '@/lib/prisma'
import type { Db } from '@/lib/prisma'
import { registrar } from '../audit'
import { UMBRAL_CONFIANZA } from '../result'
import { deltaDeTorneo } from './snapshot'

export interface Confianza {
  score: number
  motivo: string
}

/**
 * Compara lo reportado contra el delta de snapshots y devuelve un score.
 * Sirve para pillar fraude grosero (reportó 8 kills y su contador subió 2),
 * no para una verificación perfecta que la API no permite.
 */
export function evaluar(
  reportado: { kills: number; wins: number; matches: number },
  delta: { kills: number; wins: number; matches: number } | null,
): Confianza {
  if (!delta) return { score: 0.5, motivo: 'Sin snapshots: no hay con qué contrastar.' }
  if (delta.matches <= 0) {
    return { score: 0.2, motivo: 'El contador de partidas del jugador no se movió durante la ventana.' }
  }
  if (reportado.matches > delta.matches + 1) {
    return { score: 0.25, motivo: `Reportó ${reportado.matches} partidas y el contador subió ${delta.matches}.` }
  }
  if (reportado.wins > delta.wins) {
    return { score: 0.3, motivo: `Reportó ${reportado.wins} victorias y el contador subió ${delta.wins}.` }
  }

  const margen = Math.max(2, Math.ceil(delta.kills * 0.15))
  const exceso = reportado.kills - delta.kills
  if (exceso > margen) {
    return { score: 0.3, motivo: `Reportó ${reportado.kills} eliminaciones y el contador subió ${delta.kills}.` }
  }
  if (exceso > 0) {
    return { score: 0.7, motivo: 'Diferencia menor entre lo reportado y el contador, dentro del margen.' }
  }
  return { score: 0.95, motivo: 'Lo reportado calza con el movimiento del contador.' }
}

/**
 * El delta nunca decide solo (§2.4): escribe confidenceScore y, bajo el
 * umbral, manda el resultado a la cola de revisión humana.
 */
export async function reconciliarTorneo(tournamentId: string, db: Db = prisma): Promise<number> {
  const inscritos = await db.registration.findMany({
    where: { tournamentId, deletedAt: null },
    include: { results: { where: { deletedAt: null, status: 'REPORTADO' } } },
  })

  let evaluados = 0
  for (const reg of inscritos) {
    if (reg.results.length === 0) continue
    const delta = await deltaDeTorneo(reg.userId, tournamentId, db)

    const reportado = {
      kills: reg.results.reduce((s, r) => s + r.eliminations, 0),
      wins: reg.results.filter((r) => r.placement === 1).length,
      matches: reg.results.length,
    }
    const confianza = evaluar(reportado, delta)

    for (const resultado of reg.results) {
      await db.matchResult.update({
        where: { id: resultado.id },
        data: {
          confidenceScore: confianza.score,
          ...(confianza.score < UMBRAL_CONFIANZA ? { status: 'EN_DISPUTA' as const } : {}),
        },
      })
    }

    if (confianza.score < UMBRAL_CONFIANZA) {
      await registrar(
        {
          action: 'resultado.baja_confianza',
          entityType: 'Registration',
          entityId: reg.id,
          metadata: { score: confianza.score, motivo: confianza.motivo, reportado, delta },
          publico: true,
        },
        db,
      )
    }
    evaluados += 1
  }
  return evaluados
}
