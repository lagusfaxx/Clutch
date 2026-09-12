import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { tablaTorneo } from './tournament'

export interface ResumenJugador {
  userId: string
  slug: string
  displayName: string
  ratingActual: number | null
  pico: number | null
  torneos: number
  mejorPosicion: number | null
  posicionPromedio: number | null
  porModo: { mode: string; rating: number; matchCount: number }[]
}

export interface Cruce {
  tournamentId: string
  tournamentName: string
  slug: string
  fecha: Date
  posicionA: number
  posicionB: number
  ganador: 'A' | 'B' | 'EMPATE'
}

export interface Comparacion {
  a: ResumenJugador
  b: ResumenJugador
  cruces: Cruce[]
  marcador: { a: number; b: number; empates: number }
  evolucion: { fecha: Date; ratingA: number | null; ratingB: number | null }[]
}

/**
 * Comparación cabeza a cabeza (§2.12). Solo datos de torneos de Clutch:
 * mezclar stats globales de la API corrompe el sentido del número.
 */
export async function compararJugadores(slugA: string, slugB: string, db: Db = prisma): Promise<Comparacion> {
  const [a, b] = await Promise.all([resumen(slugA, db), resumen(slugB, db)])
  const cruces = await encuentrosDirectos(a.userId, b.userId, db)

  const marcador = cruces.reduce(
    (acc, c) => {
      if (c.ganador === 'A') acc.a += 1
      else if (c.ganador === 'B') acc.b += 1
      else acc.empates += 1
      return acc
    },
    { a: 0, b: 0, empates: 0 },
  )

  return { a, b, cruces, marcador, evolucion: await evolucion(a.userId, b.userId, db) }
}

async function resumen(slug: string, db: Db): Promise<ResumenJugador> {
  const usuario = await db.user.findFirst({
    where: { slug, deletedAt: null },
    include: {
      ratings: { orderBy: { rating: 'desc' } },
      registrations: {
        where: { deletedAt: null, tournament: { status: 'CERRADO', deletedAt: null } },
        select: { tournamentId: true },
      },
    },
  })
  if (!usuario) throw new ErrorClutch('NO_ENCONTRADO', `No encontramos al jugador ${slug}.`)

  const posiciones: number[] = []
  for (const reg of usuario.registrations) {
    const tabla = await tablaTorneo(reg.tournamentId, db)
    const fila = tabla.find((f) => f.userId === usuario.id)
    if (fila && fila.partidasJugadas > 0) posiciones.push(fila.posicion)
  }

  const mejorRating = usuario.ratings[0]
  return {
    userId: usuario.id,
    slug: usuario.slug,
    displayName: usuario.displayName,
    ratingActual: mejorRating ? Math.round(mejorRating.rating) : null,
    pico: mejorRating ? Math.round(mejorRating.peakRating) : null,
    torneos: posiciones.length,
    mejorPosicion: posiciones.length ? Math.min(...posiciones) : null,
    posicionPromedio: posiciones.length
      ? Math.round((posiciones.reduce((s, p) => s + p, 0) / posiciones.length) * 10) / 10
      : null,
    porModo: usuario.ratings.map((r) => ({ mode: r.mode, rating: Math.round(r.rating), matchCount: r.matchCount })),
  }
}

/** El dato más adictivo: cuántas veces coincidieron y quién quedó arriba. */
async function encuentrosDirectos(userA: string, userB: string, db: Db): Promise<Cruce[]> {
  const torneosA = await db.registration.findMany({
    where: { userId: userA, deletedAt: null, tournament: { status: 'CERRADO', deletedAt: null } },
    select: { tournamentId: true },
  })
  const idsA = new Set(torneosA.map((t) => t.tournamentId))

  const compartidos = await db.registration.findMany({
    where: { userId: userB, deletedAt: null, tournamentId: { in: [...idsA] } },
    include: { tournament: { select: { id: true, name: true, slug: true, endsAt: true } } },
    orderBy: { tournament: { endsAt: 'desc' } },
    take: 40,
  })

  const cruces: Cruce[] = []
  for (const reg of compartidos) {
    const tabla = await tablaTorneo(reg.tournament.id, db)
    const filaA = tabla.find((f) => f.userId === userA)
    const filaB = tabla.find((f) => f.userId === userB)
    if (!filaA || !filaB || filaA.partidasJugadas === 0 || filaB.partidasJugadas === 0) continue

    cruces.push({
      tournamentId: reg.tournament.id,
      tournamentName: reg.tournament.name,
      slug: reg.tournament.slug,
      fecha: reg.tournament.endsAt,
      posicionA: filaA.posicion,
      posicionB: filaB.posicion,
      ganador: filaA.posicion === filaB.posicion ? 'EMPATE' : filaA.posicion < filaB.posicion ? 'A' : 'B',
    })
  }
  return cruces
}

async function evolucion(userA: string, userB: string, db: Db) {
  const historial = await db.ratingHistory.findMany({
    where: { userId: { in: [userA, userB] } },
    orderBy: { createdAt: 'asc' },
    take: 400,
  })

  const puntos = new Map<number, { fecha: Date; ratingA: number | null; ratingB: number | null }>()
  let ultimoA: number | null = null
  let ultimoB: number | null = null

  for (const h of historial) {
    if (h.userId === userA) ultimoA = Math.round(h.ratingAfter)
    else ultimoB = Math.round(h.ratingAfter)
    const clave = Math.floor(h.createdAt.getTime() / 86_400_000)
    puntos.set(clave, { fecha: h.createdAt, ratingA: ultimoA, ratingB: ultimoB })
  }
  return [...puntos.values()]
}
