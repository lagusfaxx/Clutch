import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { dias } from '@/lib/fechas'
import { esMenor, edad } from './user'
import { registrar } from './audit'

export const LIMITE_CONVERSACIONES_NUEVAS = 10
export const RETENCION_MESES = 12

export const esquemaMensaje = z.object({
  body: z.string().min(1).max(2000),
})

/**
 * Reglas de contacto (§2.13). Ninguna de estas es configurable por el
 * usuario: son la diferencia entre una plataforma seria y un problema grave.
 */
async function puedeEscribir(deId: string, aId: string, db: Db): Promise<void> {
  if (deId === aId) throw new ErrorClutch('VALIDACION', 'No puedes escribirte a ti mismo.')

  const [emisor, receptor] = await Promise.all([
    db.user.findUnique({ where: { id: deId } }),
    db.user.findUnique({ where: { id: aId } }),
  ])
  if (!emisor || !receptor || emisor.deletedAt || receptor.deletedAt) {
    throw new ErrorClutch('NO_ENCONTRADO', 'Esa cuenta no existe.')
  }
  if (emisor.status === 'PENDING' || emisor.status === 'BANNED' || emisor.status === 'FLAGGED') {
    throw new ErrorClutch('PROHIBIDO', 'Vincula tu cuenta de Epic para poder mandar mensajes.')
  }

  const bloqueo = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: aId, blockedId: deId },
        { blockerId: deId, blockedId: aId },
      ],
    },
  })
  if (bloqueo) throw new ErrorClutch('PROHIBIDO', 'No puedes escribirle a esta persona.')

  // Menores: bandeja cerrada por defecto y sin DMs de mayores fuera del equipo.
  if (esMenor(receptor.birthDate)) {
    const emisorEsMayor = emisor.birthDate ? edad(emisor.birthDate) >= 18 : true
    if (emisorEsMayor && !(await compartenEquipo(deId, aId, db))) {
      throw new ErrorClutch('PROHIBIDO', 'Esta persona no recibe mensajes directos.')
    }
  }
  if (!receptor.dmsOpen && !(await compartenEquipo(deId, aId, db))) {
    throw new ErrorClutch('PROHIBIDO', 'Esta persona tiene los mensajes cerrados.')
  }
}

async function compartenEquipo(a: string, b: string, db: Db): Promise<boolean> {
  const equiposA = await db.teamMember.findMany({ where: { userId: a, leftAt: null }, select: { teamId: true } })
  if (equiposA.length === 0) return false
  const coincide = await db.teamMember.findFirst({
    where: { userId: b, leftAt: null, teamId: { in: equiposA.map((e) => e.teamId) } },
  })
  return Boolean(coincide)
}

/** Rate limit anti-spam de invitaciones masivas: 10 conversaciones nuevas al día. */
async function verificarLimite(userId: string, db: Db): Promise<void> {
  const torneos = await db.registration.count({
    where: { userId, deletedAt: null, tournament: { status: 'CERRADO' } },
  })
  if (torneos >= 3) return

  const desde = new Date(Date.now() - dias(1))
  const nuevas = await db.conversationMember.count({
    where: { userId, conversation: { createdAt: { gte: desde } } },
  })
  if (nuevas >= LIMITE_CONVERSACIONES_NUEVAS) {
    throw new ErrorClutch('LIMITE', 'Llegaste al máximo de conversaciones nuevas por hoy.')
  }
}

export async function abrirConversacion(deId: string, aId: string, db: Db = prisma) {
  await puedeEscribir(deId, aId, db)

  const existente = await db.conversation.findFirst({
    where: { AND: [{ participants: { some: { userId: deId } } }, { participants: { some: { userId: aId } } }] },
    include: { participants: true },
  })
  if (existente) return existente

  await verificarLimite(deId, db)
  return db.conversation.create({
    data: { participants: { create: [{ userId: deId }, { userId: aId }] } },
    include: { participants: true },
  })
}

/**
 * Sin adjuntos ni imágenes en el MVP. Los links externos se guardan como
 * texto: la UI no los hace clickeables hasta que la cuenta sea TRUSTED.
 */
export async function enviarMensaje(conversationId: string, senderId: string, cuerpo: string, db: Db = prisma) {
  const { body } = esquemaMensaje.parse({ body: cuerpo })

  const miembro = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId: senderId } },
  })
  if (!miembro || miembro.leftAt) throw new ErrorClutch('PROHIBIDO', 'No participas en esa conversación.')

  const otro = await db.conversationMember.findFirst({
    where: { conversationId, userId: { not: senderId } },
  })
  if (otro) await puedeEscribir(senderId, otro.userId, db)

  const mensaje = await db.message.create({
    data: { conversationId, senderId, body: body.trim() },
  })
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } })
  return mensaje
}

export function linksClickeables(estado: string): boolean {
  return estado === 'TRUSTED'
}

export async function bandeja(userId: string, db: Db = prisma) {
  return db.conversation.findMany({
    where: { participants: { some: { userId, leftAt: null } }, archivedAt: null },
    include: {
      participants: { include: { user: { select: { displayName: true, slug: true, avatarUrl: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  })
}

export async function mensajes(conversationId: string, userId: string, db: Db = prisma) {
  const miembro = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  if (!miembro) throw new ErrorClutch('PROHIBIDO', 'No participas en esa conversación.')

  await db.conversationMember.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadAt: new Date() },
  })
  return db.message.findMany({
    where: { conversationId },
    include: { sender: { select: { displayName: true, slug: true, status: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
}

export async function bloquear(blockerId: string, blockedId: string, db: Db = prisma) {
  return db.block.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  })
}

export async function reportar(
  reporterId: string,
  reportedId: string,
  contexto: string,
  contextoId: string | null,
  motivo: string,
  db: Db = prisma,
) {
  const reporte = await db.report.create({
    data: { reporterId, reportedId, context: contexto, contextId: contextoId, reason: motivo },
  })
  await registrar(
    {
      actorId: reporterId,
      action: 'moderacion.reportar',
      entityType: 'Report',
      entityId: reporte.id,
      metadata: { reportedId, contexto },
    },
    db,
  )
  return reporte
}

/** Retención: 12 meses y se archiva. Los reportes conservan el contexto. */
export async function archivarAntiguas(db: Db = prisma): Promise<number> {
  const corte = new Date(Date.now() - dias(30 * RETENCION_MESES))
  const { count } = await db.conversation.updateMany({
    where: { archivedAt: null, lastMessageAt: { lt: corte } },
    data: { archivedAt: new Date() },
  })
  return count
}
