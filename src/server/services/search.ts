import { Prisma } from '@prisma/client'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { aSlug } from '@/lib/slug'
import { buscarJugador } from './fortnite/client'

export type TipoResultado = 'clutch' | 'fantasma' | 'sugerencia'

export interface ResultadoBusqueda {
  tipo: TipoResultado
  nick: string
  slug: string
  displayName: string
  rating?: number
  posicion?: number
  region?: string | null
  avatarUrl?: string | null
  similitud?: number
}

/**
 * Búsqueda de jugadores (§2.11). El índice local manda: los usuarios de
 * Clutch salen siempre de Postgres, nunca de la API externa.
 */
export async function buscar(termino: string, db: Db = prisma): Promise<ResultadoBusqueda[]> {
  const limpio = termino.trim()
  if (limpio.length < 2) return []

  const locales = await coincidenciasLocales(limpio, db)
  if (locales.length > 0) return locales

  const fantasma = await buscarOCrearFantasma(limpio, db)
  if (fantasma) return [fantasma]

  return sugerenciasPorSimilitud(limpio, db)
}

async function coincidenciasLocales(termino: string, db: Db): Promise<ResultadoBusqueda[]> {
  const usuarios = await db.user.findMany({
    where: {
      deletedAt: null,
      status: { not: 'BANNED' },
      OR: [
        { displayName: { equals: termino, mode: 'insensitive' } },
        { epicNick: { equals: termino, mode: 'insensitive' } },
        { displayName: { startsWith: termino, mode: 'insensitive' } },
        { epicNick: { startsWith: termino, mode: 'insensitive' } },
      ],
    },
    include: { ratings: { orderBy: { rating: 'desc' }, take: 1 } },
    take: 10,
  })

  return usuarios.map((u) => ({
    tipo: 'clutch' as const,
    nick: u.epicNick ?? u.displayName,
    slug: u.slug,
    displayName: u.displayName,
    rating: u.ratings[0] ? Math.round(u.ratings[0].rating) : undefined,
    region: u.region,
    avatarUrl: u.avatarUrl,
  }))
}

/**
 * Sugerencias difusas con pg_trgm. Los typos en nicks son constantes,
 * y un 404 seco es la peor respuesta posible acá.
 */
async function sugerenciasPorSimilitud(termino: string, db: Db): Promise<ResultadoBusqueda[]> {
  const filas = await db.$queryRaw<
    { slug: string; displayName: string; epicNick: string | null; region: string | null; similitud: number }[]
  >`
    SELECT u.slug,
           u."displayName",
           u."epicNick",
           u.region,
           GREATEST(
             similarity(u."displayName", ${termino}),
             similarity(COALESCE(u."epicNick", ''), ${termino})
           ) AS similitud
    FROM "User" u
    WHERE u."deletedAt" IS NULL
      AND u.status <> 'BANNED'
      AND (u."displayName" % ${termino} OR COALESCE(u."epicNick", '') % ${termino})
    ORDER BY similitud DESC
    LIMIT 8
  `

  return filas.map((f) => ({
    tipo: 'sugerencia' as const,
    nick: f.epicNick ?? f.displayName,
    slug: f.slug,
    displayName: f.displayName,
    region: f.region,
    similitud: Number(f.similitud),
  }))
}

/**
 * Caso 2 de §2.11: existe en Epic pero no compite en Clutch. Genera una
 * página indexable con CTA, no un 404. Caché de 24h incluso en negativo.
 */
export async function buscarOCrearFantasma(nick: string, db: Db = prisma): Promise<ResultadoBusqueda | null> {
  const clave = nick.toLowerCase()
  const guardado = await db.ghostProfile.findUnique({ where: { epicNick: clave } })

  const fresco =
    guardado?.lastSyncedAt && Date.now() - guardado.lastSyncedAt.getTime() < 24 * 3_600_000

  if (guardado && fresco) {
    return guardado.notFound ? null : aResultado(guardado)
  }

  const externo = await buscarJugador(nick, db).catch(() => null)

  const datos = {
    epicNick: clave,
    slug: guardado?.slug ?? (await slugFantasmaLibre(nick, db)),
    epicAccountId: externo?.accountId ?? guardado?.epicAccountId ?? null,
    cachedStats: externo
      ? ({ wins: externo.wins, kills: externo.kills, matchesPlayed: externo.matchesPlayed } as object)
      : Prisma.DbNull,
    notFound: externo === null,
    lastSyncedAt: new Date(),
  }

  const fila = guardado
    ? await db.ghostProfile.update({ where: { id: guardado.id }, data: datos })
    : await db.ghostProfile.create({ data: datos })

  return fila.notFound ? null : aResultado(fila)
}

function aResultado(fila: { epicNick: string; slug: string }): ResultadoBusqueda {
  return { tipo: 'fantasma', nick: fila.epicNick, slug: fila.slug, displayName: fila.epicNick }
}

async function slugFantasmaLibre(nick: string, db: Db): Promise<string> {
  const raiz = aSlug(nick) || 'jugador'
  let intento = raiz
  let n = 2
  while (
    (await db.ghostProfile.findUnique({ where: { slug: intento }, select: { id: true } })) ??
    (await db.user.findUnique({ where: { slug: intento }, select: { id: true } }))
  ) {
    intento = `${raiz}-${n}`
    n += 1
  }
  return intento
}

export async function guardarBusqueda(userId: string, termino: string, db: Db = prisma): Promise<void> {
  await db.searchQuery.create({ data: { userId, term: termino.slice(0, 80) } })
}

export async function busquedasRecientes(userId: string, db: Db = prisma) {
  const filas = await db.searchQuery.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })
  const vistos = new Set<string>()
  return filas.filter((f) => (vistos.has(f.term) ? false : (vistos.add(f.term), true))).slice(0, 8)
}
