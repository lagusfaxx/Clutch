import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { aSlug } from '@/lib/slug'
import { minutos } from '@/lib/fechas'
import { esquemaPuntaje, leerConfig, calcularPuntos, totalTorneo, PUNTAJE_FNCS } from './scoring'
import { registrar } from './audit'

export const esquemaCrearTorneo = z
  .object({
    name: z.string().min(3).max(120),
    description: z.string().max(4000).optional(),
    game: z.enum(['FORTNITE', 'CS2']).default('FORTNITE'),
    format: z.enum(['PUNTOS', 'ELIMINACION_SIMPLE', 'ELIMINACION_DOBLE', 'LIGA']).default('PUNTOS'),
    mode: z.enum(['SOLO', 'DUO', 'SQUAD']),
    platformRule: z.enum(['CUALQUIERA', 'SOLO_PC', 'SOLO_CONSOLA', 'SOLO_MOBILE']).default('CUALQUIERA'),
    serverRegion: z.string().min(2).max(12).default('BR'),
    region: z.string().max(40).optional(),
    seasonId: z.string().optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    checkInOpensAt: z.coerce.date().optional(),
    maxSlots: z.number().int().min(2).max(5000),
    minSlots: z.number().int().min(0).default(0),
    entryFeeClp: z.number().int().min(0).default(0),
    matchesCounted: z.number().int().min(1).max(50).default(6),
    matchesTotal: z.number().int().min(1).max(50).default(8),
    minRating: z.number().int().optional(),
    minTournaments: z.number().int().min(0).default(0),
    scoringConfig: esquemaPuntaje.default(PUNTAJE_FNCS),
    rulesUrl: z.string().url().optional(),
  })
  .refine((t) => t.endsAt > t.startsAt, { message: 'El torneo no puede terminar antes de empezar.', path: ['endsAt'] })
  .refine((t) => t.minSlots <= t.maxSlots, { message: 'El cupo mínimo no puede superar al máximo.', path: ['minSlots'] })
  .refine((t) => t.matchesCounted <= t.matchesTotal, {
    message: 'No puedes contar más partidas de las que se juegan.',
    path: ['matchesCounted'],
  })

export type DatosCrearTorneo = z.infer<typeof esquemaCrearTorneo>

async function slugLibre(base: string, db: Db): Promise<string> {
  const raiz = aSlug(base) || 'torneo'
  let intento = raiz
  let n = 2
  while (await db.tournament.findUnique({ where: { slug: intento }, select: { id: true } })) {
    intento = `${raiz}-${n}`
    n += 1
  }
  return intento
}

export async function crearTorneo(datos: DatosCrearTorneo, actorId: string, db: Db = prisma) {
  const d = esquemaCrearTorneo.parse(datos)
  const slug = await slugLibre(d.name, db)
  const checkIn = d.checkInOpensAt ?? new Date(d.startsAt.getTime() - minutos(30))

  const torneo = await db.tournament.create({
    data: {
      slug,
      name: d.name,
      description: d.description ?? null,
      game: d.game,
      format: d.format,
      mode: d.mode,
      platformRule: d.platformRule,
      serverRegion: d.serverRegion,
      region: d.region ?? null,
      seasonId: d.seasonId ?? null,
      startsAt: d.startsAt,
      endsAt: d.endsAt,
      checkInOpensAt: checkIn,
      maxSlots: d.maxSlots,
      minSlots: d.minSlots,
      entryFeeClp: d.entryFeeClp,
      matchesCounted: d.matchesCounted,
      matchesTotal: d.matchesTotal,
      minRating: d.minRating ?? null,
      minTournaments: d.minTournaments,
      scoringConfig: d.scoringConfig as object,
      rulesUrl: d.rulesUrl ?? null,
      createdById: actorId,
      status: 'DRAFT',
    },
  })

  await db.match.createMany({
    data: Array.from({ length: d.matchesTotal }, (_, i) => ({ tournamentId: torneo.id, index: i + 1 })),
  })

  await registrar(
    { actorId, action: 'torneo.crear', entityType: 'Tournament', entityId: torneo.id, metadata: { slug } },
    db,
  )
  return torneo
}

/** Clonar: un semanal recurrente no se configura 52 veces (§2.14). */
export async function clonarTorneo(
  torneoId: string,
  corrimiento: { startsAt: Date; endsAt: Date; name?: string },
  actorId: string,
  db: Db = prisma,
) {
  const base = await db.tournament.findUnique({ where: { id: torneoId }, include: { prizes: true } })
  if (!base || base.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')

  const nuevo = await crearTorneo(
    {
      name: corrimiento.name ?? base.name,
      description: base.description ?? undefined,
      game: base.game,
      format: base.format,
      mode: base.mode,
      platformRule: base.platformRule,
      serverRegion: base.serverRegion,
      region: base.region ?? undefined,
      seasonId: base.seasonId ?? undefined,
      startsAt: corrimiento.startsAt,
      endsAt: corrimiento.endsAt,
      maxSlots: base.maxSlots,
      minSlots: base.minSlots,
      entryFeeClp: base.entryFeeClp,
      matchesCounted: base.matchesCounted,
      matchesTotal: base.matchesTotal,
      minRating: base.minRating ?? undefined,
      minTournaments: base.minTournaments,
      scoringConfig: leerConfig(base.scoringConfig),
      rulesUrl: base.rulesUrl ?? undefined,
    },
    actorId,
    db,
  )

  if (base.prizes.length > 0) {
    await db.prize.createMany({
      data: base.prizes.map((p) => ({
        tournamentId: nuevo.id,
        placement: p.placement,
        type: p.type,
        faceValue: p.faceValue,
        description: p.description,
        hardwareSku: p.hardwareSku,
      })),
    })
  }

  await registrar(
    { actorId, action: 'torneo.clonar', entityType: 'Tournament', entityId: nuevo.id, metadata: { desde: torneoId } },
    db,
  )
  return nuevo
}

const TRANSICIONES: Record<string, string[]> = {
  DRAFT: ['PUBLICADO', 'CANCELADO'],
  PUBLICADO: ['INSCRIPCION_ABIERTA', 'CANCELADO'],
  INSCRIPCION_ABIERTA: ['CHECK_IN', 'CANCELADO'],
  CHECK_IN: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['EN_DISPUTA', 'CERRADO', 'CANCELADO'],
  EN_DISPUTA: ['CERRADO', 'CANCELADO'],
  CERRADO: [],
  CANCELADO: [],
}

export async function cambiarEstado(
  torneoId: string,
  nuevo: keyof typeof TRANSICIONES,
  actorId: string,
  db: Db = prisma,
) {
  const torneo = await db.tournament.findUnique({ where: { id: torneoId } })
  if (!torneo || torneo.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
  const permitidas = TRANSICIONES[torneo.status] ?? []
  if (!permitidas.includes(nuevo)) {
    throw new ErrorClutch('CONFLICTO', `No se puede pasar de ${torneo.status} a ${nuevo}.`)
  }
  const actualizado = await db.tournament.update({
    where: { id: torneoId },
    data: { status: nuevo as never },
  })
  await registrar(
    {
      actorId,
      action: 'torneo.estado',
      entityType: 'Tournament',
      entityId: torneoId,
      metadata: { desde: torneo.status, hacia: nuevo },
      publico: true,
    },
    db,
  )
  return actualizado
}

export async function eliminarTorneo(torneoId: string, actorId: string, db: Db = prisma) {
  await db.tournament.update({ where: { id: torneoId }, data: { deletedAt: new Date(), status: 'CANCELADO' } })
  await registrar({ actorId, action: 'torneo.eliminar', entityType: 'Tournament', entityId: torneoId }, db)
}

export interface FilaTabla {
  registrationId: string
  userId: string
  displayName: string
  slug: string
  teamName: string | null
  puntos: number
  partidasJugadas: number
  mejorPosicion: number | null
  eliminaciones: number
  posicion: number
  enDisputa: boolean
}

/**
 * Tabla de posiciones del torneo. Recalcula puntos desde scoringConfig cada
 * vez: lo guardado en MatchResult.points es caché, no autoridad.
 */
export async function tablaTorneo(torneoId: string, db: Db = prisma): Promise<FilaTabla[]> {
  const torneo = await db.tournament.findUnique({
    where: { id: torneoId },
    include: {
      registrations: {
        where: { deletedAt: null, status: { in: ['CONFIRMADA', 'CHECKED_IN', 'NO_SHOW'] } },
        include: {
          user: { select: { id: true, displayName: true, slug: true } },
          team: { select: { name: true } },
          results: { where: { deletedAt: null } },
        },
      },
    },
  })
  if (!torneo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
  const config = leerConfig(torneo.scoringConfig)

  const filas = torneo.registrations.map((reg) => {
    const validos = reg.results.filter((r) => r.status === 'REPORTADO' || r.status === 'VERIFICADO')
    const puntosPartida = validos.map((r) => calcularPuntos(config, r.placement, r.eliminations))
    const mejor = validos.reduce<number | null>(
      (min, r) => (min === null || r.placement < min ? r.placement : min),
      null,
    )
    return {
      registrationId: reg.id,
      userId: reg.user.id,
      displayName: reg.user.displayName,
      slug: reg.user.slug,
      teamName: reg.team?.name ?? null,
      puntos: totalTorneo(puntosPartida, torneo.matchesCounted),
      partidasJugadas: validos.length,
      mejorPosicion: mejor,
      eliminaciones: validos.reduce((s, r) => s + r.eliminations, 0),
      posicion: 0,
      enDisputa: reg.results.some((r) => r.status === 'EN_DISPUTA'),
    }
  })

  filas.sort(
    (a, b) =>
      b.puntos - a.puntos ||
      (a.mejorPosicion ?? 999) - (b.mejorPosicion ?? 999) ||
      b.eliminaciones - a.eliminaciones,
  )

  let posicion = 0
  let anterior: number | null = null
  filas.forEach((fila, i) => {
    if (anterior === null || fila.puntos !== anterior) posicion = i + 1
    fila.posicion = posicion
    anterior = fila.puntos
  })
  return filas
}

export async function torneoPorSlug(slug: string, db: Db = prisma) {
  return db.tournament.findFirst({
    where: { slug, deletedAt: null },
    include: {
      prizes: { orderBy: { placement: 'asc' } },
      season: true,
      _count: { select: { registrations: { where: { deletedAt: null } } } },
    },
  })
}

export async function proximosTorneos(limite = 10, db: Db = prisma) {
  return db.tournament.findMany({
    where: { deletedAt: null, status: { in: ['PUBLICADO', 'INSCRIPCION_ABIERTA', 'CHECK_IN', 'EN_CURSO'] } },
    orderBy: { startsAt: 'asc' },
    take: limite,
    include: { _count: { select: { registrations: { where: { deletedAt: null } } } } },
  })
}
