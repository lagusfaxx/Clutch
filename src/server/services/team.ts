import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { aSlug } from '@/lib/slug'
import { registrar } from './audit'

export const esquemaEquipo = z.object({
  name: z.string().min(3).max(40),
  tag: z
    .string()
    .min(3)
    .max(5)
    .regex(/^[A-Za-z0-9]+$/, 'El tag solo acepta letras y números.'),
  logoUrl: z.string().url().optional(),
})

export async function crearEquipo(datos: z.infer<typeof esquemaEquipo>, capitanId: string, db: Db = prisma) {
  const d = esquemaEquipo.parse(datos)
  const tag = d.tag.toUpperCase()

  const tomado = await db.team.findUnique({ where: { tag } })
  if (tomado) throw new ErrorClutch('CONFLICTO', `El tag ${tag} ya está tomado.`)

  const equipo = await db.team.create({
    data: {
      name: d.name,
      tag,
      slug: await slugLibre(d.name, db),
      logoUrl: d.logoUrl ?? null,
      captainId: capitanId,
      members: { create: { userId: capitanId, role: 'CAPITAN' } },
    },
    include: { members: true },
  })
  await registrar({ actorId: capitanId, action: 'equipo.crear', entityType: 'Team', entityId: equipo.id }, db)
  return equipo
}

async function slugLibre(base: string, db: Db): Promise<string> {
  const raiz = aSlug(base) || 'equipo'
  let intento = raiz
  let n = 2
  while (await db.team.findUnique({ where: { slug: intento }, select: { id: true } })) {
    intento = `${raiz}-${n}`
    n += 1
  }
  return intento
}

export async function agregarMiembro(teamId: string, userId: string, actorId: string, db: Db = prisma) {
  const equipo = await db.team.findUnique({ where: { id: teamId } })
  if (!equipo || equipo.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese equipo no existe.')
  if (equipo.captainId !== actorId) throw new ErrorClutch('PROHIBIDO', 'Solo el capitán puede mover el roster.')

  const enTorneoActivo = await db.registration.findFirst({
    where: {
      teamId,
      deletedAt: null,
      tournament: { status: { in: ['INSCRIPCION_ABIERTA', 'CHECK_IN', 'EN_CURSO'] } },
    },
  })
  if (enTorneoActivo) {
    throw new ErrorClutch('CONFLICTO', 'El roster está congelado: el equipo tiene un torneo en curso.')
  }

  const miembro = await db.teamMember.upsert({
    where: { teamId_userId: { teamId, userId } },
    create: { teamId, userId },
    update: { leftAt: null },
  })
  await registrar(
    { actorId, action: 'equipo.agregar_miembro', entityType: 'Team', entityId: teamId, metadata: { userId } },
    db,
  )
  return miembro
}

export async function sacarMiembro(teamId: string, userId: string, actorId: string, db: Db = prisma) {
  const equipo = await db.team.findUnique({ where: { id: teamId } })
  if (!equipo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese equipo no existe.')
  if (equipo.captainId !== actorId && actorId !== userId) {
    throw new ErrorClutch('PROHIBIDO', 'Solo el capitán puede sacar a alguien del equipo.')
  }
  if (equipo.captainId === userId) {
    throw new ErrorClutch('CONFLICTO', 'El capitán no puede salir sin traspasar la capitanía.')
  }

  const miembro = await db.teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: { leftAt: new Date() },
  })
  await registrar(
    { actorId, action: 'equipo.sacar_miembro', entityType: 'Team', entityId: teamId, metadata: { userId } },
    db,
  )
  return miembro
}

export async function traspasarCapitania(teamId: string, nuevoId: string, actorId: string, db: Db = prisma) {
  const equipo = await db.team.findUnique({ where: { id: teamId } })
  if (!equipo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese equipo no existe.')
  if (equipo.captainId !== actorId) throw new ErrorClutch('PROHIBIDO', 'Solo el capitán puede traspasar la capitanía.')

  const miembro = await db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: nuevoId } } })
  if (!miembro || miembro.leftAt) throw new ErrorClutch('CONFLICTO', 'Esa persona no está en el equipo.')

  const actualizado = await db.team.update({ where: { id: teamId }, data: { captainId: nuevoId } })
  await db.teamMember.update({
    where: { teamId_userId: { teamId, userId: nuevoId } },
    data: { role: 'CAPITAN' },
  })
  await db.teamMember.update({
    where: { teamId_userId: { teamId, userId: actorId } },
    data: { role: 'MIEMBRO' },
  })
  await registrar(
    { actorId, action: 'equipo.traspasar', entityType: 'Team', entityId: teamId, metadata: { nuevoId } },
    db,
  )
  return actualizado
}

export async function equipoPorSlug(slug: string, db: Db = prisma) {
  return db.team.findFirst({
    where: { slug, deletedAt: null },
    include: {
      members: {
        where: { leftAt: null },
        include: { user: { select: { displayName: true, slug: true, avatarUrl: true } } },
      },
      registrations: {
        include: { tournament: { select: { name: true, slug: true, endsAt: true, status: true } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
    },
  })
}
