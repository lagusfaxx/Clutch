import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { horas } from '@/lib/fechas'
import { registrar } from './audit'

export const VENTANA_IMPUGNACION_H = 2

export const esquemaDisputa = z.object({
  tournamentId: z.string().min(1),
  matchResultId: z.string().min(1).optional(),
  reason: z.string().min(20).max(2000),
  evidenceUrl: z.string().url(),
})

export type DatosDisputa = z.infer<typeof esquemaDisputa>

/** El que impugna adjunta evidencia. Sin evidencia no hay disputa (§2.3). */
export async function abrirDisputa(datos: DatosDisputa, userId: string, db: Db = prisma) {
  const d = esquemaDisputa.parse(datos)
  const torneo = await db.tournament.findUnique({ where: { id: d.tournamentId } })
  if (!torneo || torneo.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')

  const limite = torneo.endsAt.getTime() + horas(VENTANA_IMPUGNACION_H)
  if (Date.now() > limite) {
    throw new ErrorClutch('CONFLICTO', 'La ventana de 2 horas para impugnar ya cerró.')
  }

  const inscrito = await db.registration.findUnique({
    where: { tournamentId_userId: { tournamentId: d.tournamentId, userId } },
  })
  if (!inscrito) throw new ErrorClutch('PROHIBIDO', 'Solo los inscritos pueden impugnar un resultado.')

  const disputa = await db.dispute.create({
    data: {
      tournamentId: d.tournamentId,
      matchResultId: d.matchResultId ?? null,
      openedById: userId,
      reason: d.reason,
      evidenceUrl: d.evidenceUrl,
      status: 'ABIERTA',
    },
  })

  // EN_DISPUTA bloquea el pago de premios hasta que se resuelva.
  if (torneo.status === 'EN_CURSO' || torneo.status === 'CERRADO') {
    await db.tournament.update({ where: { id: torneo.id }, data: { status: 'EN_DISPUTA' } })
  }
  if (d.matchResultId) {
    await db.matchResult.update({ where: { id: d.matchResultId }, data: { status: 'EN_DISPUTA' } })
  }

  await registrar(
    {
      actorId: userId,
      action: 'disputa.abrir',
      entityType: 'Dispute',
      entityId: disputa.id,
      metadata: { torneoId: d.tournamentId, motivo: d.reason },
      publico: true,
    },
    db,
  )
  return disputa
}

/** Resolución con log auditable y público: quién, cuándo, qué y por qué. */
export async function resolverDisputa(
  disputaId: string,
  adminId: string,
  decision: 'RESUELTA' | 'DESESTIMADA',
  resolucion: string,
  db: Db = prisma,
) {
  if (resolucion.trim().length < 20) {
    throw new ErrorClutch('VALIDACION', 'Escribe el motivo de la decisión. El log es público.')
  }
  const disputa = await db.dispute.update({
    where: { id: disputaId },
    data: { status: decision, resolvedById: adminId, resolution: resolucion, resolvedAt: new Date() },
  })

  const abiertas = await db.dispute.count({
    where: { tournamentId: disputa.tournamentId, status: { in: ['ABIERTA', 'EN_REVISION'] } },
  })
  if (abiertas === 0) {
    const torneo = await db.tournament.findUnique({ where: { id: disputa.tournamentId } })
    if (torneo?.status === 'EN_DISPUTA') {
      await db.tournament.update({ where: { id: torneo.id }, data: { status: 'CERRADO' } })
    }
  }

  await registrar(
    {
      actorId: adminId,
      action: 'disputa.resolver',
      entityType: 'Dispute',
      entityId: disputaId,
      metadata: { decision, resolucion },
      publico: true,
    },
    db,
  )
  return disputa
}

export async function disputasDeTorneo(tournamentId: string, db: Db = prisma) {
  return db.dispute.findMany({
    where: { tournamentId },
    include: {
      openedBy: { select: { displayName: true, slug: true } },
      resolvedBy: { select: { displayName: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}
