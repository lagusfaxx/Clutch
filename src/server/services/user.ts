import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { aSlug } from '@/lib/slug'
import { cifrar, hashIp } from '@/lib/crypto'
import { registrar } from './audit'

export const EDAD_MINIMA = 13

export function edad(nacimiento: Date, ahora = new Date()): number {
  let años = ahora.getFullYear() - nacimiento.getFullYear()
  const mes = ahora.getMonth() - nacimiento.getMonth()
  if (mes < 0 || (mes === 0 && ahora.getDate() < nacimiento.getDate())) años -= 1
  return años
}

export function esMenor(nacimiento: Date | null | undefined): boolean {
  if (!nacimiento) return false
  return edad(nacimiento) < 18
}

/** RUT chileno con dígito verificador (módulo 11). */
export function rutValido(rut: string): boolean {
  const limpio = rut.replace(/[.\-\s]/g, '').toUpperCase()
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false
  const cuerpo = limpio.slice(0, -1)
  const dv = limpio.slice(-1)
  let suma = 0
  let factor = 2
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const resto = 11 - (suma % 11)
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return dv === esperado
}

export function normalizarRut(rut: string): string {
  const limpio = rut.replace(/[.\-\s]/g, '').toUpperCase()
  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`
}

async function slugLibre(base: string, db: Db): Promise<string> {
  const raiz = aSlug(base) || 'jugador'
  let intento = raiz
  let n = 2
  while (await db.user.findUnique({ where: { slug: intento }, select: { id: true } })) {
    intento = `${raiz}-${n}`
    n += 1
  }
  return intento
}

export interface DatosDiscord {
  discordId: string
  discordTag?: string
  displayName: string
  email?: string
  avatarUrl?: string
}

/** Login primario. Crea la cuenta en PENDING: sin Epic todavía no compite. */
export async function upsertDesdeDiscord(datos: DatosDiscord, db: Db = prisma) {
  const existente = await db.user.findUnique({ where: { discordId: datos.discordId } })
  if (existente) {
    return db.user.update({
      where: { id: existente.id },
      data: {
        discordTag: datos.discordTag ?? existente.discordTag,
        avatarUrl: datos.avatarUrl ?? existente.avatarUrl,
        email: datos.email ?? existente.email,
      },
    })
  }

  const usuario = await db.user.create({
    data: {
      discordId: datos.discordId,
      discordTag: datos.discordTag ?? null,
      displayName: datos.displayName,
      slug: await slugLibre(datos.displayName, db),
      email: datos.email ?? null,
      avatarUrl: datos.avatarUrl ?? null,
      status: 'PENDING',
    },
  })
  await registrar({ actorId: usuario.id, action: 'usuario.crear', entityType: 'User', entityId: usuario.id }, db)
  return usuario
}

export interface DatosEpic {
  epicAccountId: string
  epicNick: string
  accessToken?: string
  refreshToken?: string
  expiresAt?: Date
}

/**
 * Vincula Epic vía OAuth. Una cuenta Epic = una cuenta Clutch (§2.1).
 * Nunca se guardan usuario/contraseña de Epic, solo el token cifrado.
 */
export async function vincularEpic(userId: string, datos: DatosEpic, db: Db = prisma) {
  const ocupada = await db.user.findUnique({ where: { epicAccountId: datos.epicAccountId } })
  if (ocupada && ocupada.id !== userId) {
    throw new ErrorClutch('CONFLICTO', 'Esa cuenta de Epic ya está vinculada a otro perfil de Clutch.')
  }

  const baneada = await db.ban.findFirst({
    where: { epicAccountId: datos.epicAccountId, OR: [{ until: null }, { until: { gt: new Date() } }] },
  })
  if (baneada) throw new ErrorClutch('PROHIBIDO', 'Esa cuenta de Epic está suspendida en Clutch.')

  const usuario = await db.user.update({
    where: { id: userId },
    data: {
      epicAccountId: datos.epicAccountId,
      epicNick: datos.epicNick,
      status: 'VERIFIED',
    },
  })

  await db.oAuthAccount.upsert({
    where: { provider_providerAccountId: { provider: 'epic', providerAccountId: datos.epicAccountId } },
    create: {
      userId,
      provider: 'epic',
      providerAccountId: datos.epicAccountId,
      encryptedAccess: datos.accessToken ? cifrar(datos.accessToken) : null,
      encryptedRefresh: datos.refreshToken ? cifrar(datos.refreshToken) : null,
      expiresAt: datos.expiresAt ?? null,
    },
    update: {
      userId,
      encryptedAccess: datos.accessToken ? cifrar(datos.accessToken) : undefined,
      encryptedRefresh: datos.refreshToken ? cifrar(datos.refreshToken) : undefined,
      expiresAt: datos.expiresAt ?? undefined,
    },
  })

  await fusionarPerfilFantasma(datos.epicNick, datos.epicAccountId, userId, db)
  await registrar(
    {
      actorId: userId,
      action: 'usuario.vincular_epic',
      entityType: 'User',
      entityId: userId,
      metadata: { epicAccountId: datos.epicAccountId },
    },
    db,
  )
  return usuario
}

/** Reclamo de perfil fantasma (§2.11, caso 2). */
async function fusionarPerfilFantasma(
  epicNick: string,
  epicAccountId: string,
  userId: string,
  db: Db,
): Promise<void> {
  const fantasma = await db.ghostProfile.findFirst({
    where: { OR: [{ epicAccountId }, { epicNick: epicNick.toLowerCase() }] },
  })
  if (!fantasma || fantasma.claimedByUserId) return
  await db.ghostProfile.update({ where: { id: fantasma.id }, data: { claimedByUserId: userId } })
  await registrar(
    { actorId: userId, action: 'fantasma.reclamar', entityType: 'GhostProfile', entityId: fantasma.id },
    db,
  )
}

export const esquemaPerfil = z.object({
  displayName: z.string().min(2).max(40).optional(),
  region: z.string().max(40).optional(),
  birthDate: z.coerce.date().optional(),
  guardianEmail: z.string().email().optional(),
  statsPrivate: z.boolean().optional(),
  showPresence: z.boolean().optional(),
  dmsOpen: z.boolean().optional(),
})

export async function actualizarPerfil(userId: string, datos: z.infer<typeof esquemaPerfil>, db: Db = prisma) {
  const d = esquemaPerfil.parse(datos)
  if (d.birthDate && edad(d.birthDate) < EDAD_MINIMA) {
    throw new ErrorClutch('PROHIBIDO', `Para competir en Clutch tienes que tener ${EDAD_MINIMA} años o más.`)
  }
  return db.user.update({ where: { id: userId }, data: d })
}

/** El RUT se pide recién al reclamar premio, no al registro (§2.1). */
export async function guardarRut(userId: string, rut: string, db: Db = prisma) {
  if (!rutValido(rut)) throw new ErrorClutch('VALIDACION', 'Ese RUT no es válido. Revísalo e inténtalo de nuevo.')
  const normalizado = normalizarRut(rut)
  const ocupado = await db.user.findUnique({ where: { rut: normalizado } })
  if (ocupado && ocupado.id !== userId) {
    throw new ErrorClutch('CONFLICTO', 'Ese RUT ya está registrado en otra cuenta.')
  }
  return db.user.update({ where: { id: userId }, data: { rut: normalizado } })
}

/** TRUSTED: 3+ torneos cerrados sin reportes en contra (§2.1). */
export async function recalcularConfianza(userId: string, db: Db = prisma) {
  const usuario = await db.user.findUnique({ where: { id: userId } })
  if (!usuario || usuario.status !== 'VERIFIED') return usuario

  const [jugados, reportes] = await Promise.all([
    db.registration.count({
      where: { userId, status: { in: ['CHECKED_IN'] }, tournament: { status: 'CERRADO' } },
    }),
    db.report.count({ where: { reportedId: userId, resolvedAt: null } }),
  ])

  if (jugados >= 3 && reportes === 0) {
    return db.user.update({ where: { id: userId }, data: { status: 'TRUSTED' } })
  }
  return usuario
}

export async function banear(
  objetivo: { userId?: string; epicAccountId?: string; discordId?: string; ip?: string },
  motivo: string,
  adminId: string,
  hasta: Date | null,
  db: Db = prisma,
) {
  const ban = await db.ban.create({
    data: {
      userId: objetivo.userId ?? null,
      epicAccountId: objetivo.epicAccountId ?? null,
      discordId: objetivo.discordId ?? null,
      ipHash: hashIp(objetivo.ip),
      reason: motivo,
      until: hasta,
      createdById: adminId,
    },
  })
  if (objetivo.userId) {
    await db.user.update({ where: { id: objetivo.userId }, data: { status: 'BANNED' } })
  }
  await registrar(
    {
      actorId: adminId,
      action: 'usuario.banear',
      entityType: 'Ban',
      entityId: ban.id,
      metadata: { motivo, hasta, objetivo: { ...objetivo, ip: undefined } },
    },
    db,
  )
  return ban
}

export async function perfilPorSlug(slug: string, db: Db = prisma) {
  return db.user.findFirst({
    where: { slug, deletedAt: null },
    include: {
      ratings: { include: { season: true }, orderBy: { season: { startsAt: 'desc' } } },
      teamMembers: { where: { leftAt: null }, include: { team: true } },
      prizeClaims: { include: { prize: { include: { tournament: { select: { name: true, slug: true } } } } } },
      registrations: {
        where: { deletedAt: null, tournament: { status: 'CERRADO' } },
        include: { tournament: { select: { id: true, name: true, slug: true, endsAt: true, mode: true } } },
        orderBy: { createdAt: 'desc' },
        take: 25,
      },
    },
  })
}
