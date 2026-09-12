import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { dias } from '@/lib/fechas'
import { registrar } from '../audit'
import { tablaTorneo } from '../tournament'
import {
  actualizar,
  aplicarDecay,
  calificacionInicial,
  enfrentamientosDesdeTabla,
  pesoPorTamano,
  softReset,
  type Calificacion,
} from './glicko2'

/** Mínimo de torneos para aparecer en la tabla pública (§2.5). */
export const MINIMO_TORNEOS_TABLA = 5

async function calificacionDe(
  userId: string,
  game: string,
  mode: string,
  seasonId: string,
  db: Db,
): Promise<Calificacion & { id: string | null }> {
  const fila = await db.rating.findUnique({
    where: { userId_game_mode_seasonId: { userId, game: game as never, mode: mode as never, seasonId } },
  })
  if (!fila) return { ...calificacionInicial(), id: null }
  return { rating: fila.rating, deviation: fila.deviation, volatility: fila.volatility, id: fila.id }
}

/**
 * Aplica los resultados de un torneo cerrado al ranking.
 * Idempotente (§5): si el torneo ya fue procesado, no vuelve a sumar.
 */
export async function aplicarTorneoAlRanking(torneoId: string, db: Db = prisma): Promise<number> {
  const torneo = await db.tournament.findUnique({ where: { id: torneoId } })
  if (!torneo || torneo.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
  if (!torneo.seasonId) throw new ErrorClutch('CONFLICTO', 'El torneo no está asociado a una temporada.')

  const yaProcesado = await db.ratingHistory.findFirst({
    where: { tournamentId: torneoId, reason: 'torneo' },
    select: { id: true },
  })
  if (yaProcesado) return 0

  const tabla = await tablaTorneo(torneoId, db)
  const participantes = tabla.filter((f) => f.partidasJugadas > 0)
  if (participantes.length < 2) return 0

  const seasonId = torneo.seasonId
  const calificaciones = new Map<string, Calificacion>()
  for (const fila of participantes) {
    const c = await calificacionDe(fila.userId, torneo.game, torneo.mode, seasonId, db)
    calificaciones.set(fila.userId, { rating: c.rating, deviation: c.deviation, volatility: c.volatility })
  }

  const peso = pesoPorTamano(participantes.length)
  const enfrentamientos = enfrentamientosDesdeTabla(
    participantes.map((f) => ({
      id: f.userId,
      posicion: f.posicion,
      calificacion: calificaciones.get(f.userId) ?? calificacionInicial(),
    })),
    peso,
  )

  let actualizados = 0
  for (const fila of participantes) {
    const antes = calificaciones.get(fila.userId) ?? calificacionInicial()
    const despues = actualizar(antes, enfrentamientos.get(fila.userId) ?? [])

    await db.rating.upsert({
      where: {
        userId_game_mode_seasonId: {
          userId: fila.userId,
          game: torneo.game,
          mode: torneo.mode,
          seasonId,
        },
      },
      create: {
        userId: fila.userId,
        game: torneo.game,
        mode: torneo.mode,
        seasonId,
        rating: despues.rating,
        deviation: despues.deviation,
        volatility: despues.volatility,
        peakRating: despues.rating,
        matchCount: 1,
        lastPlayedAt: torneo.endsAt,
      },
      update: {
        rating: despues.rating,
        deviation: despues.deviation,
        volatility: despues.volatility,
        peakRating: Math.max(despues.rating, antes.rating),
        matchCount: { increment: 1 },
        lastPlayedAt: torneo.endsAt,
      },
    })

    await db.ratingHistory.create({
      data: {
        userId: fila.userId,
        game: torneo.game,
        mode: torneo.mode,
        seasonId,
        tournamentId: torneoId,
        ratingBefore: antes.rating,
        ratingAfter: despues.rating,
        reason: 'torneo',
      },
    })
    actualizados += 1
  }

  await registrar(
    {
      action: 'ranking.aplicar_torneo',
      entityType: 'Tournament',
      entityId: torneoId,
      metadata: { participantes: actualizados, peso },
      publico: true,
    },
    db,
  )
  return actualizados
}

/** Decay por inactividad. Corre diario desde la cola. */
export async function aplicarDecayGlobal(db: Db = prisma): Promise<number> {
  const corte = new Date(Date.now() - dias(30))
  const inactivos = await db.rating.findMany({
    where: { OR: [{ lastPlayedAt: { lt: corte } }, { lastPlayedAt: null, updatedAt: { lt: corte } }] },
    take: 2000,
  })

  let tocados = 0
  for (const fila of inactivos) {
    const referencia = fila.lastPlayedAt ?? fila.updatedAt
    const diasInactivo = Math.floor((Date.now() - referencia.getTime()) / dias(1))
    const nuevo = aplicarDecay(
      { rating: fila.rating, deviation: fila.deviation, volatility: fila.volatility },
      diasInactivo,
    )
    if (Math.abs(nuevo.rating - fila.rating) < 0.01) continue

    await db.rating.update({
      where: { id: fila.id },
      data: { rating: nuevo.rating, deviation: nuevo.deviation, lastPlayedAt: new Date() },
    })
    await db.ratingHistory.create({
      data: {
        userId: fila.userId,
        game: fila.game,
        mode: fila.mode,
        seasonId: fila.seasonId,
        ratingBefore: fila.rating,
        ratingAfter: nuevo.rating,
        reason: 'decay',
      },
    })
    tocados += 1
  }
  return tocados
}

/** Cierre de temporada: archivo histórico + soft reset hacia la media. */
export async function cerrarTemporada(seasonId: string, adminId: string, db: Db = prisma): Promise<number> {
  const temporada = await db.season.findUnique({ where: { id: seasonId } })
  if (!temporada) throw new ErrorClutch('NO_ENCONTRADO', 'Esa temporada no existe.')
  if (temporada.closedAt) throw new ErrorClutch('CONFLICTO', 'Esa temporada ya está cerrada.')

  const filas = await db.rating.findMany({ where: { seasonId }, orderBy: { rating: 'desc' } })
  const posiciones = new Map<string, number>()
  const porCategoria = new Map<string, number>()
  for (const fila of filas) {
    const clave = `${fila.game}:${fila.mode}`
    const siguiente = (porCategoria.get(clave) ?? 0) + 1
    porCategoria.set(clave, siguiente)
    posiciones.set(fila.id, siguiente)
  }

  for (const fila of filas) {
    await db.ratingArchive.upsert({
      where: {
        userId_seasonId_game_mode: { userId: fila.userId, seasonId, game: fila.game, mode: fila.mode },
      },
      create: {
        userId: fila.userId,
        seasonId,
        game: fila.game,
        mode: fila.mode,
        rating: fila.rating,
        deviation: fila.deviation,
        position: posiciones.get(fila.id) ?? null,
        matchCount: fila.matchCount,
      },
      update: { rating: fila.rating, deviation: fila.deviation, position: posiciones.get(fila.id) ?? null },
    })

    const comprimido = softReset({ rating: fila.rating, deviation: fila.deviation, volatility: fila.volatility })
    await db.rating.update({
      where: { id: fila.id },
      data: { rating: comprimido.rating, deviation: comprimido.deviation, volatility: comprimido.volatility },
    })
  }

  await db.season.update({ where: { id: seasonId }, data: { closedAt: new Date() } })
  await registrar(
    {
      actorId: adminId,
      action: 'temporada.cerrar',
      entityType: 'Season',
      entityId: seasonId,
      metadata: { jugadores: filas.length },
      publico: true,
    },
    db,
  )
  return filas.length
}

export interface FiltroTabla {
  game?: 'FORTNITE' | 'CS2'
  mode?: 'SOLO' | 'DUO' | 'SQUAD'
  seasonId?: string
  region?: string
  limite?: number
  offset?: number
}

export async function tablaPublica(filtro: FiltroTabla = {}, db: Db = prisma) {
  const seasonId = filtro.seasonId ?? (await temporadaActiva(filtro.game ?? 'FORTNITE', db))?.id
  if (!seasonId) return []

  const filas = await db.rating.findMany({
    where: {
      seasonId,
      game: filtro.game ?? 'FORTNITE',
      ...(filtro.mode ? { mode: filtro.mode } : {}),
      matchCount: { gte: MINIMO_TORNEOS_TABLA },
      user: {
        deletedAt: null,
        status: { notIn: ['BANNED'] },
        ...(filtro.region ? { region: filtro.region } : {}),
      },
    },
    include: { user: { select: { id: true, displayName: true, slug: true, region: true, avatarUrl: true } } },
    orderBy: [{ rating: 'desc' }, { matchCount: 'desc' }],
    take: filtro.limite ?? 50,
    skip: filtro.offset ?? 0,
  })

  return filas.map((fila, i) => ({
    posicion: (filtro.offset ?? 0) + i + 1,
    userId: fila.userId,
    displayName: fila.user.displayName,
    slug: fila.user.slug,
    region: fila.user.region,
    avatarUrl: fila.user.avatarUrl,
    mode: fila.mode,
    rating: Math.round(fila.rating),
    deviation: Math.round(fila.deviation),
    matchCount: fila.matchCount,
  }))
}

export async function temporadaActiva(game: 'FORTNITE' | 'CS2' = 'FORTNITE', db: Db = prisma) {
  const ahora = new Date()
  return (
    (await db.season.findFirst({
      where: { game, startsAt: { lte: ahora }, endsAt: { gte: ahora }, closedAt: null },
      orderBy: { startsAt: 'desc' },
    })) ?? db.season.findFirst({ where: { game, closedAt: null }, orderBy: { startsAt: 'desc' } })
  )
}

export async function ratingsDeUsuario(userId: string, db: Db = prisma) {
  return db.rating.findMany({
    where: { userId },
    include: { season: { select: { name: true, slug: true, endsAt: true } } },
    orderBy: [{ season: { startsAt: 'desc' } }, { mode: 'asc' }],
  })
}

export async function historialDeUsuario(userId: string, db: Db = prisma) {
  return db.ratingHistory.findMany({ where: { userId }, orderBy: { createdAt: 'asc' }, take: 500 })
}
