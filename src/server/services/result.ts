import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { minutos } from '@/lib/fechas'
import { calcularPuntos, leerConfig } from './scoring'
import { registrar } from './audit'

export const DEADLINE_REPORTE_MIN = 30
/** Bajo este umbral el resultado va a revisión humana (§2.4). */
export const UMBRAL_CONFIANZA = 0.55

export const esquemaReporte = z.object({
  matchId: z.string().min(1),
  placement: z.number().int().min(1).max(200),
  eliminations: z.number().int().min(0).max(100),
  evidenceUrl: z.string().url().optional(),
})

export type DatosReporte = z.infer<typeof esquemaReporte>

/**
 * Capa 1: reporte del jugador. Los puntos se calculan acá, nunca llegan
 * del cliente. El screenshot es obligatorio salvo que el admin lo exima.
 */
export async function reportarResultado(
  datos: DatosReporte,
  userId: string,
  db: Db = prisma,
  opciones: { exigirEvidencia?: boolean; ip?: string | null } = {},
) {
  const d = esquemaReporte.parse(datos)
  const exigir = opciones.exigirEvidencia ?? true
  if (exigir && !d.evidenceUrl) {
    throw new ErrorClutch('VALIDACION', 'Sube el screenshot del resultado. Tiene que verse posición, elims y tu nick.')
  }

  const partida = await db.match.findUnique({ where: { id: d.matchId }, include: { tournament: true } })
  if (!partida || partida.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Esa partida no existe.')

  const inscripcion = await db.registration.findUnique({
    where: { tournamentId_userId: { tournamentId: partida.tournamentId, userId } },
  })
  if (!inscripcion || inscripcion.deletedAt) throw new ErrorClutch('PROHIBIDO', 'No estás inscrito en este torneo.')
  if (inscripcion.status === 'NO_SHOW' || inscripcion.status === 'RETIRADA') {
    throw new ErrorClutch('PROHIBIDO', 'Tu inscripción no está activa en este torneo.')
  }
  if (d.placement > partida.tournament.maxSlots) {
    throw new ErrorClutch('VALIDACION', 'Esa posición no existe en este torneo.')
  }

  const cierre = partida.closesAt ?? new Date(partida.tournament.endsAt.getTime() + minutos(DEADLINE_REPORTE_MIN))
  if (Date.now() > cierre.getTime() + minutos(DEADLINE_REPORTE_MIN)) {
    throw new ErrorClutch('CONFLICTO', 'Se pasó el plazo de 30 minutos para reportar esta partida.')
  }

  const existente = await db.matchResult.findUnique({
    where: { matchId_registrationId: { matchId: d.matchId, registrationId: inscripcion.id } },
  })
  if (existente && existente.status === 'VERIFICADO') {
    throw new ErrorClutch('CONFLICTO', 'Ese resultado ya está verificado y no se puede cambiar.')
  }

  const config = leerConfig(partida.tournament.scoringConfig)
  const puntos = calcularPuntos(config, d.placement, d.eliminations)

  const resultado = existente
    ? await db.matchResult.update({
        where: { id: existente.id },
        data: {
          placement: d.placement,
          eliminations: d.eliminations,
          points: puntos,
          evidenceUrl: d.evidenceUrl ?? existente.evidenceUrl,
          status: 'REPORTADO',
          reportedAt: new Date(),
        },
      })
    : await db.matchResult.create({
        data: {
          matchId: d.matchId,
          registrationId: inscripcion.id,
          placement: d.placement,
          eliminations: d.eliminations,
          points: puntos,
          evidenceUrl: d.evidenceUrl ?? null,
          status: 'REPORTADO',
        },
      })

  await registrar(
    {
      actorId: userId,
      action: 'resultado.reportar',
      entityType: 'MatchResult',
      entityId: resultado.id,
      metadata: { matchId: d.matchId, placement: d.placement, eliminations: d.eliminations, puntos },
      ip: opciones.ip ?? null,
      publico: true,
    },
    db,
  )

  await verificacionCruzada(d.matchId, db)
  return resultado
}

/**
 * Capa 2: verificación cruzada. Dos equipos que reclaman la misma posición
 * en la misma partida se van los dos a revisión, sin preguntar.
 */
export async function verificacionCruzada(matchId: string, db: Db = prisma): Promise<number> {
  const resultados = await db.matchResult.findMany({
    where: { matchId, deletedAt: null, status: { in: ['REPORTADO', 'VERIFICADO'] } },
    include: { registration: { select: { teamId: true, userId: true } } },
  })

  const porPosicion = new Map<number, typeof resultados>()
  for (const r of resultados) {
    const lista = porPosicion.get(r.placement) ?? []
    lista.push(r)
    porPosicion.set(r.placement, lista)
  }

  const conflictivos = new Set<string>()
  for (const [, lista] of porPosicion) {
    const equipos = new Set(lista.map((r) => r.registration.teamId ?? r.registration.userId))
    if (equipos.size > 1) for (const r of lista) conflictivos.add(r.id)
  }

  // Escuadras: los miembros del mismo equipo deben reportar lo mismo.
  const porEquipo = new Map<string, typeof resultados>()
  for (const r of resultados) {
    if (!r.registration.teamId) continue
    const lista = porEquipo.get(r.registration.teamId) ?? []
    lista.push(r)
    porEquipo.set(r.registration.teamId, lista)
  }
  for (const [, lista] of porEquipo) {
    const distintos = new Set(lista.map((r) => `${r.placement}:${r.eliminations}`))
    if (distintos.size > 1) for (const r of lista) conflictivos.add(r.id)
  }

  if (conflictivos.size > 0) {
    await db.matchResult.updateMany({
      where: { id: { in: [...conflictivos] } },
      data: { status: 'EN_DISPUTA' },
    })
    await registrar(
      {
        action: 'resultado.flag_cruzado',
        entityType: 'Match',
        entityId: matchId,
        metadata: { resultados: [...conflictivos] },
        publico: true,
      },
      db,
    )
  }
  return conflictivos.size
}

export async function verificarResultado(
  resultadoId: string,
  adminId: string,
  decision: 'VERIFICADO' | 'RECHAZADO',
  nota: string | null,
  db: Db = prisma,
) {
  const resultado = await db.matchResult.findUnique({ where: { id: resultadoId } })
  if (!resultado || resultado.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese resultado no existe.')

  const actualizado = await db.matchResult.update({
    where: { id: resultadoId },
    data: { status: decision, verifiedById: adminId, verifiedAt: new Date(), notes: nota },
  })
  await registrar(
    {
      actorId: adminId,
      action: 'resultado.resolver',
      entityType: 'MatchResult',
      entityId: resultadoId,
      metadata: { decision, nota },
      publico: true,
    },
    db,
  )
  return actualizado
}

export async function colaRevision(db: Db = prisma) {
  return db.matchResult.findMany({
    where: {
      deletedAt: null,
      OR: [{ status: 'EN_DISPUTA' }, { confidenceScore: { lt: UMBRAL_CONFIANZA } }],
    },
    include: {
      match: { include: { tournament: { select: { name: true, slug: true } } } },
      registration: { include: { user: { select: { displayName: true, slug: true } } } },
    },
    orderBy: { reportedAt: 'asc' },
    take: 100,
  })
}

export async function resultadosDePartida(matchId: string, db: Db = prisma) {
  return db.matchResult.findMany({
    where: { matchId, deletedAt: null },
    include: { registration: { include: { user: { select: { displayName: true, slug: true } }, team: true } } },
    orderBy: { placement: 'asc' },
  })
}
