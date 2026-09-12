import { prisma } from '@/lib/prisma'
import type { Db } from '@/lib/prisma'
import { buscarJugador } from './client'

/**
 * Captura de stats acumuladas antes y después de la ventana del torneo.
 * Estas APIs no entregan el resultado de una partida identificable, así que
 * el delta entre PRE y POST es lo único con lo que se puede contrastar
 * lo que reportó el jugador (§2.4).
 */
export async function capturar(
  userId: string,
  tournamentId: string | null,
  fase: 'PRE' | 'POST',
  db: Db = prisma,
) {
  const usuario = await db.user.findUnique({ where: { id: userId } })
  if (!usuario?.epicNick) return null

  const stats = await buscarJugador(usuario.epicNick, db)
  if (!stats) return null

  // Se persiste el payload crudo: en tres meses, para resolver una disputa,
  // hace falta el dato tal como llegó, no la interpretación de hoy.
  return db.fortniteStatsSnapshot.create({
    data: {
      userId,
      tournamentId,
      phase: fase,
      provider: stats.proveedor,
      rawPayload: stats.crudo as object,
      wins: stats.wins,
      kills: stats.kills,
      matchesPlayed: stats.matchesPlayed,
    },
  })
}

export async function capturarTorneo(tournamentId: string, fase: 'PRE' | 'POST', db: Db = prisma): Promise<number> {
  const inscritos = await db.registration.findMany({
    where: { tournamentId, deletedAt: null, status: { in: ['CONFIRMADA', 'CHECKED_IN'] } },
    select: { userId: true },
  })

  let capturados = 0
  for (const reg of inscritos) {
    const ya = await db.fortniteStatsSnapshot.findFirst({
      where: { userId: reg.userId, tournamentId, phase: fase },
      select: { id: true },
    })
    if (ya) continue
    const snap = await capturar(reg.userId, tournamentId, fase, db)
    if (snap) capturados += 1
  }
  return capturados
}

export async function deltaDeTorneo(userId: string, tournamentId: string, db: Db = prisma) {
  const [pre, post] = await Promise.all([
    db.fortniteStatsSnapshot.findFirst({
      where: { userId, tournamentId, phase: 'PRE' },
      orderBy: { capturedAt: 'desc' },
    }),
    db.fortniteStatsSnapshot.findFirst({
      where: { userId, tournamentId, phase: 'POST' },
      orderBy: { capturedAt: 'desc' },
    }),
  ])
  if (!pre || !post) return null

  return {
    kills: (post.kills ?? 0) - (pre.kills ?? 0),
    wins: (post.wins ?? 0) - (pre.wins ?? 0),
    matches: (post.matchesPlayed ?? 0) - (pre.matchesPlayed ?? 0),
    proveedor: post.provider,
  }
}
