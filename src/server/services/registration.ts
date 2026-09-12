import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { horas, minutos, dias } from '@/lib/fechas'
import { registrar } from './audit'

const ESTADOS_ABIERTOS = ['INSCRIPCION_ABIERTA', 'PUBLICADO'] as const

export interface OpcionesInscripcion {
  teamId?: string
  ip?: string | null
}

/**
 * Inscribe a un jugador. Sin Epic vinculado no hay inscripción (§2.1), sin
 * excepción: es lo único que sostiene el anti-smurf.
 */
export async function inscribir(
  torneoId: string,
  userId: string,
  opciones: OpcionesInscripcion = {},
  db: Db = prisma,
) {
  const [torneo, usuario] = await Promise.all([
    db.tournament.findUnique({
      where: { id: torneoId },
      include: { _count: { select: { registrations: { where: { deletedAt: null, status: { not: 'RETIRADA' } } } } } },
    }),
    db.user.findUnique({ where: { id: userId } }),
  ])

  if (!torneo || torneo.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
  if (!usuario || usuario.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Esa cuenta no existe.')
  if (usuario.status === 'BANNED') throw new ErrorClutch('PROHIBIDO', 'Tu cuenta está suspendida.')
  if (!usuario.epicAccountId) {
    throw new ErrorClutch(
      'PROHIBIDO',
      'Confirma tu nick de Epic antes de inscribirte. Lo haces en Mi cuenta y toma menos de un minuto.',
    )
  }
  if (!ESTADOS_ABIERTOS.includes(torneo.status as (typeof ESTADOS_ABIERTOS)[number])) {
    throw new ErrorClutch('CONFLICTO', 'Las inscripciones de este torneo no están abiertas.')
  }
  if (torneo.startsAt.getTime() <= Date.now()) {
    throw new ErrorClutch('CONFLICTO', 'Este torneo ya empezó.')
  }

  const yaInscrito = await db.registration.findUnique({
    where: { tournamentId_userId: { tournamentId: torneoId, userId } },
  })
  if (yaInscrito && yaInscrito.status !== 'RETIRADA') {
    throw new ErrorClutch('CONFLICTO', 'Ya estás inscrito en este torneo.')
  }

  await verificarRequisitos(torneo, usuario, db)
  if (opciones.teamId) await verificarEquipo(opciones.teamId, userId, torneoId, db)

  const lleno = torneo._count.registrations >= torneo.maxSlots
  const requierePago = torneo.entryFeeClp > 0

  const estado = lleno ? 'EN_ESPERA' : requierePago ? 'PENDIENTE_PAGO' : 'CONFIRMADA'
  const waitlistPos = lleno ? await proximaPosicionEspera(torneoId, db) : null

  const datos = {
    tournamentId: torneoId,
    userId,
    teamId: opciones.teamId ?? null,
    status: estado as never,
    waitlistPos,
    deletedAt: null,
    rosterLock: opciones.teamId ? await congelarRoster(opciones.teamId, db) : undefined,
  }

  const inscripcion = yaInscrito
    ? await db.registration.update({ where: { id: yaInscrito.id }, data: datos })
    : await db.registration.create({ data: datos })

  await registrar(
    {
      actorId: userId,
      action: 'inscripcion.crear',
      entityType: 'Registration',
      entityId: inscripcion.id,
      metadata: { torneoId, estado },
      ip: opciones.ip ?? null,
    },
    db,
  )
  return inscripcion
}

async function verificarRequisitos(
  torneo: { minTournaments: number; minRating: number | null; game: string; mode: string; seasonId: string | null },
  usuario: { id: string },
  db: Db,
): Promise<void> {
  if (torneo.minTournaments > 0) {
    const jugados = await db.registration.count({
      where: { userId: usuario.id, status: { in: ['CHECKED_IN', 'CONFIRMADA'] }, tournament: { status: 'CERRADO' } },
    })
    if (jugados < torneo.minTournaments) {
      throw new ErrorClutch(
        'PROHIBIDO',
        `Este torneo pide ${torneo.minTournaments} torneos jugados. Llevas ${jugados}.`,
      )
    }
  }

  if (torneo.minRating !== null && torneo.seasonId) {
    const rating = await db.rating.findUnique({
      where: {
        userId_game_mode_seasonId: {
          userId: usuario.id,
          game: torneo.game as never,
          mode: torneo.mode as never,
          seasonId: torneo.seasonId,
        },
      },
    })
    if (!rating || rating.rating < torneo.minRating) {
      throw new ErrorClutch('PROHIBIDO', `Este torneo pide ${torneo.minRating} de rating o más.`)
    }
  }
}

async function verificarEquipo(teamId: string, userId: string, torneoId: string, db: Db): Promise<void> {
  const miembro = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } })
  if (!miembro || miembro.leftAt) throw new ErrorClutch('PROHIBIDO', 'No perteneces a ese equipo.')

  const otroEquipo = await db.registration.findFirst({
    where: { tournamentId: torneoId, userId, teamId: { not: teamId }, deletedAt: null, status: { not: 'RETIRADA' } },
  })
  if (otroEquipo) {
    throw new ErrorClutch('CONFLICTO', 'Ya estás inscrito en este torneo con otro equipo.')
  }
}

/** Roster lock: el plantel queda congelado al inscribirse (§2.8). */
async function congelarRoster(teamId: string, db: Db) {
  const miembros = await db.teamMember.findMany({
    where: { teamId, leftAt: null },
    select: { userId: true, role: true },
  })
  return { congeladoEn: new Date().toISOString(), miembros } as object
}

async function proximaPosicionEspera(torneoId: string, db: Db): Promise<number> {
  const ultimo = await db.registration.findFirst({
    where: { tournamentId: torneoId, status: 'EN_ESPERA' },
    orderBy: { waitlistPos: 'desc' },
    select: { waitlistPos: true },
  })
  return (ultimo?.waitlistPos ?? 0) + 1
}

/**
 * Cancelación del jugador. Hasta 2h antes hay reembolso; después no (§2.2).
 */
export async function cancelarInscripcion(inscripcionId: string, userId: string, db: Db = prisma) {
  const inscripcion = await db.registration.findUnique({
    where: { id: inscripcionId },
    include: { tournament: true },
  })
  if (!inscripcion || inscripcion.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Esa inscripción no existe.')
  if (inscripcion.userId !== userId) throw new ErrorClutch('PROHIBIDO', 'Esa inscripción no es tuya.')
  if (inscripcion.status === 'RETIRADA') return inscripcion

  const faltan = inscripcion.tournament.startsAt.getTime() - Date.now()
  const conReembolso = faltan > horas(2)

  const actualizada = await db.registration.update({
    where: { id: inscripcionId },
    data: { status: 'RETIRADA' },
  })
  await promoverListaEspera(inscripcion.tournamentId, db)

  await registrar(
    {
      actorId: userId,
      action: 'inscripcion.cancelar',
      entityType: 'Registration',
      entityId: inscripcionId,
      metadata: { conReembolso },
    },
    db,
  )
  return actualizada
}

/**
 * Check-in. Ventana: desde checkInOpensAt hasta el inicio del torneo.
 */
export async function hacerCheckIn(inscripcionId: string, userId: string, db: Db = prisma) {
  const inscripcion = await db.registration.findUnique({
    where: { id: inscripcionId },
    include: { tournament: true },
  })
  if (!inscripcion || inscripcion.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Esa inscripción no existe.')
  if (inscripcion.userId !== userId) throw new ErrorClutch('PROHIBIDO', 'Esa inscripción no es tuya.')
  if (inscripcion.status === 'PENDIENTE_PAGO') {
    throw new ErrorClutch('CONFLICTO', 'Tu inscripción tiene el pago pendiente.')
  }
  if (inscripcion.status === 'EN_ESPERA') {
    throw new ErrorClutch('CONFLICTO', 'Estás en lista de espera. Te avisamos si se libera un cupo.')
  }

  const ahora = Date.now()
  if (ahora < inscripcion.tournament.checkInOpensAt.getTime()) {
    throw new ErrorClutch('CONFLICTO', 'El check-in todavía no abre.')
  }
  if (ahora > inscripcion.tournament.startsAt.getTime()) {
    throw new ErrorClutch('CONFLICTO', 'El check-in ya cerró.')
  }

  const actualizada = await db.registration.update({
    where: { id: inscripcionId },
    data: { status: 'CHECKED_IN', checkedInAt: new Date() },
  })
  await registrar(
    { actorId: userId, action: 'inscripcion.checkin', entityType: 'Registration', entityId: inscripcionId },
    db,
  )
  return actualizada
}

/**
 * Cierra el check-in: los que no aparecieron liberan cupo y reciben strike.
 * Idempotente (§5): correrlo dos veces no duplica strikes.
 */
export async function cerrarCheckIn(torneoId: string, db: Db = prisma) {
  const pendientes = await db.registration.findMany({
    where: { tournamentId: torneoId, status: 'CONFIRMADA', deletedAt: null },
    select: { id: true, userId: true },
  })

  for (const reg of pendientes) {
    await db.registration.update({ where: { id: reg.id }, data: { status: 'NO_SHOW' } })
    await aplicarStrike(reg.userId, 'No-show en torneo', torneoId, db)
    await registrar(
      {
        action: 'inscripcion.noshow',
        entityType: 'Registration',
        entityId: reg.id,
        metadata: { torneoId },
        publico: true,
      },
      db,
    )
  }

  await promoverListaEspera(torneoId, db)
  return pendientes.length
}

/** Promoción FIFO de la lista de espera (§2.2). */
export async function promoverListaEspera(torneoId: string, db: Db = prisma): Promise<number> {
  const torneo = await db.tournament.findUnique({ where: { id: torneoId } })
  if (!torneo) return 0

  let promovidos = 0
  for (;;) {
    const ocupados = await db.registration.count({
      where: {
        tournamentId: torneoId,
        deletedAt: null,
        status: { in: ['CONFIRMADA', 'CHECKED_IN', 'PENDIENTE_PAGO'] },
      },
    })
    if (ocupados >= torneo.maxSlots) break

    const siguiente = await db.registration.findFirst({
      where: { tournamentId: torneoId, status: 'EN_ESPERA', deletedAt: null },
      orderBy: { waitlistPos: 'asc' },
    })
    if (!siguiente) break

    await db.registration.update({
      where: { id: siguiente.id },
      data: {
        status: torneo.entryFeeClp > 0 ? 'PENDIENTE_PAGO' : 'CONFIRMADA',
        waitlistPos: null,
      },
    })
    await registrar(
      { action: 'inscripcion.promover', entityType: 'Registration', entityId: siguiente.id, metadata: { torneoId } },
      db,
    )
    promovidos += 1
  }
  return promovidos
}

/** 3 strikes en 60 días = suspensión de 2 semanas (§2.2). */
export async function aplicarStrike(
  userId: string,
  motivo: string,
  torneoId: string | null,
  db: Db = prisma,
): Promise<void> {
  await db.strike.create({ data: { userId, reason: motivo, tournamentId: torneoId } })

  const desde = new Date(Date.now() - dias(60))
  const recientes = await db.strike.count({ where: { userId, createdAt: { gte: desde } } })
  await db.user.update({ where: { id: userId }, data: { strikes: recientes } })

  if (recientes >= 3) {
    const hasta = new Date(Date.now() + dias(14))
    const yaSuspendido = await db.ban.findFirst({ where: { userId, until: { gt: new Date() } } })
    if (!yaSuspendido) {
      await db.ban.create({ data: { userId, reason: '3 strikes en 60 días', until: hasta } })
      await db.user.update({ where: { id: userId }, data: { status: 'FLAGGED' } })
      await registrar(
        { action: 'usuario.suspender', entityType: 'User', entityId: userId, metadata: { hasta, motivo: '3 strikes' } },
        db,
      )
    }
  }
}

export async function inscripcionesDeUsuario(userId: string, db: Db = prisma) {
  return db.registration.findMany({
    where: { userId, deletedAt: null },
    include: { tournament: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export const VENTANA_CHECKIN_MIN = 30
export const AVISO_CHECKIN_MIN = 45

export function abreCheckIn(inicio: Date): Date {
  return new Date(inicio.getTime() - minutos(VENTANA_CHECKIN_MIN))
}
