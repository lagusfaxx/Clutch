import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { aSlug } from '@/lib/slug'
import { cifrar, hashIp } from '@/lib/crypto'
import { hashearClave, verificarClave, problemaConLaClave } from '@/lib/password'
import { buscarJugador, hayProveedor } from './fortnite/client'
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

export const esquemaRegistro = z.object({
  email: z.string().email('Ese correo no parece válido.'),
  password: z.string(),
  displayName: z.string().min(2, 'El nombre necesita al menos 2 caracteres.').max(40),
  epicNick: z.string().min(3).max(40).optional(),
  birthDate: z.coerce.date().optional(),
  region: z.string().max(40).optional(),
})

export type DatosRegistro = z.infer<typeof esquemaRegistro>

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Registro con correo y contraseña. La cuenta nace en PENDING: para
 * inscribirse a un torneo hay que confirmar el nick de Epic (§2.1).
 */
export async function registrarConEmail(datos: DatosRegistro, db: Db = prisma) {
  const d = esquemaRegistro.parse(datos)

  const problema = problemaConLaClave(d.password)
  if (problema) throw new ErrorClutch('VALIDACION', problema)
  if (d.birthDate && edad(d.birthDate) < EDAD_MINIMA) {
    throw new ErrorClutch('PROHIBIDO', `Para competir en Clutch tienes que tener ${EDAD_MINIMA} años o más.`)
  }

  const email = normalizarEmail(d.email)
  const tomado = await db.user.findUnique({ where: { email } })
  if (tomado) throw new ErrorClutch('CONFLICTO', 'Ya hay una cuenta con ese correo.')

  const usuario = await db.user.create({
    data: {
      email,
      passwordHash: await hashearClave(d.password),
      displayName: d.displayName,
      slug: await slugLibre(d.displayName, db),
      birthDate: d.birthDate ?? null,
      region: d.region ?? null,
      status: 'PENDING',
    },
  })

  await registrar(
    { actorId: usuario.id, action: 'usuario.registrar', entityType: 'User', entityId: usuario.id },
    db,
  )

  // Si vino con nick, se intenta confirmar de una: un paso menos.
  if (d.epicNick) {
    await vincularEpicPorNick(usuario.id, d.epicNick, db).catch(() => undefined)
  }
  return db.user.findUniqueOrThrow({ where: { id: usuario.id } })
}

/**
 * Login. Devuelve null en cualquier caso de fracaso, sin distinguir entre
 * correo inexistente y contraseña mala: decir cuál de los dos falló le
 * regala a un atacante la lista de correos registrados.
 */
export async function autenticarConEmail(email: string, password: string, db: Db = prisma) {
  const usuario = await db.user.findUnique({ where: { email: normalizarEmail(email) } })
  if (!usuario?.passwordHash || usuario.deletedAt) return null
  if (!(await verificarClave(password, usuario.passwordHash))) return null
  if (usuario.status === 'BANNED') throw new ErrorClutch('PROHIBIDO', 'Tu cuenta está suspendida.')
  return usuario
}

export async function cambiarClave(userId: string, actual: string, nueva: string, db: Db = prisma) {
  const usuario = await db.user.findUnique({ where: { id: userId } })
  if (!usuario?.passwordHash) throw new ErrorClutch('NO_ENCONTRADO', 'Esa cuenta no existe.')
  if (!(await verificarClave(actual, usuario.passwordHash))) {
    throw new ErrorClutch('PROHIBIDO', 'La contraseña actual no coincide.')
  }
  const problema = problemaConLaClave(nueva)
  if (problema) throw new ErrorClutch('VALIDACION', problema)

  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashearClave(nueva) } })
  await registrar({ actorId: userId, action: 'usuario.cambiar_clave', entityType: 'User', entityId: userId }, db)
}

/**
 * Sustituto de Epic OAuth mientras no esté disponible: se resuelve el nick
 * contra fortnite-api.com y se guarda el accountId que devuelve, con
 * constraint único.
 *
 * Ojo con lo que esto sí y no garantiza: asegura que una cuenta de Fortnite
 * corresponda a una sola cuenta de Clutch, que es lo que corta el grueso del
 * smurfing. No prueba que quien registra sea el dueño de esa cuenta, cosa
 * que solo el OAuth de Epic puede afirmar.
 */
export async function vincularEpicPorNick(userId: string, nick: string, db: Db = prisma) {
  const limpio = nick.trim()
  if (limpio.length < 3) throw new ErrorClutch('VALIDACION', 'Escribe tu nick de Epic completo.')

  // Sin proveedor configurado el lookup devuelve null igual que un nick
  // inexistente. Decirle al jugador que su nick no existe cuando el que
  // está mal configurado es el servidor manda a soporte a gente que no
  // tiene ningún problema.
  if (!hayProveedor()) {
    throw new ErrorClutch(
      'EXTERNO',
      'La verificación de nicks no está disponible ahora. No es problema tuyo: escríbenos y te la activamos a mano.',
    )
  }

  const stats = await buscarJugador(limpio, db)
  if (!stats) {
    throw new ErrorClutch(
      'NO_ENCONTRADO',
      `No encontramos el nick "${limpio}" en Fortnite. Revisa que esté escrito igual que en el juego.`,
    )
  }
  if (!stats.accountId) {
    throw new ErrorClutch('EXTERNO', 'La verificación no está disponible ahora. Inténtalo en unos minutos.')
  }

  return vincularEpic(userId, { epicAccountId: stats.accountId, epicNick: stats.nick }, db, 'API')
}

/** Verificación manual desde el panel, para cuando la API no responde. */
export async function vincularEpicManual(
  userId: string,
  epicAccountId: string,
  epicNick: string,
  adminId: string,
  db: Db = prisma,
) {
  const usuario = await vincularEpic(userId, { epicAccountId, epicNick }, db, 'ADMIN')
  await registrar(
    {
      actorId: adminId,
      action: 'usuario.vincular_epic_manual',
      entityType: 'User',
      entityId: userId,
      metadata: { epicAccountId, epicNick },
    },
    db,
  )
  return usuario
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
export async function vincularEpic(
  userId: string,
  datos: DatosEpic,
  db: Db = prisma,
  metodo: 'OAUTH' | 'API' | 'ADMIN' = 'OAUTH',
) {
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
      epicLinkMethod: metodo,
      status: 'VERIFIED',
    },
  })

  if (metodo === 'OAUTH') await guardarTokensEpic(userId, datos, db)
  await fusionarPerfilFantasma(datos.epicNick, datos.epicAccountId, userId, db)
  await registrar(
    {
      actorId: userId,
      action: 'usuario.vincular_epic',
      entityType: 'User',
      entityId: userId,
      metadata: { epicAccountId: datos.epicAccountId, metodo },
    },
    db,
  )
  return usuario
}

async function guardarTokensEpic(userId: string, datos: DatosEpic, db: Db): Promise<void> {
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
