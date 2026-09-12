import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { Db } from '@/lib/prisma'
import { leer, guardar, TTL_STATS_MS } from './cache'

/**
 * Cliente propio contra APIs NO OFICIALES de Fortnite. Ninguna está avalada
 * por Epic (§2.4): son fuente de conveniencia, jamás de verdad. Todo lo que
 * entra se valida con Zod porque estas APIs cambian el schema sin avisar.
 */

export type Proveedor = 'fortnite-api' | 'fortniteapi-io'

/** Modos de juego que la API separa. `overall` es la suma de todos. */
export type Modo = 'overall' | 'solo' | 'duo' | 'squad' | 'ltm'
/** Dispositivo con el que se jugó. `all` es el total. */
export type Entrada = 'all' | 'keyboardMouse' | 'gamepad' | 'touch'

export const MODOS: Modo[] = ['overall', 'solo', 'duo', 'squad', 'ltm']
export const ENTRADAS: Entrada[] = ['all', 'keyboardMouse', 'gamepad', 'touch']

const TIMEOUT_MS = 5000
const FALLOS_PARA_ABRIR = 5
const APERTURA_MS = 10 * 60 * 1000

export interface StatsModo {
  score: number | null
  scorePerMin: number | null
  scorePerMatch: number | null
  wins: number | null
  top3: number | null
  top5: number | null
  top6: number | null
  top10: number | null
  top12: number | null
  top25: number | null
  kills: number | null
  killsPerMin: number | null
  killsPerMatch: number | null
  deaths: number | null
  kd: number | null
  matches: number | null
  winRate: number | null
  minutesPlayed: number | null
  playersOutlived: number | null
  lastModified: string | null
}

export interface StatsJugador {
  accountId: string | null
  nick: string
  nivelPase: number | null
  /** Todo lo que la API entregó, por dispositivo y modo. */
  detalle: Partial<Record<Entrada, Partial<Record<Modo, StatsModo>>>>
  /** Atajos al total general, que es lo que se guarda en los snapshots. */
  wins: number | null
  kills: number | null
  matchesPlayed: number | null
  proveedor: Proveedor
  crudo: unknown
}

/**
 * Por qué no hay stats. La diferencia importa: un perfil privado no es un
 * nick mal escrito, y decirle "no existe" a alguien que sí existe lo manda a
 * corregir un nick que está bien.
 */
export type MotivoSinStats = 'privadas' | 'sin-partidas' | 'no-existe' | 'no-disponible'

export type Consulta =
  | { estado: 'ok'; stats: StatsJugador }
  | { estado: 'sin-stats'; motivo: MotivoSinStats }

/** Cuál gana cuando dos proveedores dicen cosas distintas: la más informativa. */
const PRIORIDAD: Record<MotivoSinStats, number> = {
  privadas: 3,
  'sin-partidas': 2,
  'no-existe': 1,
  'no-disponible': 0,
}

const numero = z.number().nullish()

const modoSchema = z.object({
  score: numero,
  scorePerMin: numero,
  scorePerMatch: numero,
  wins: numero,
  top3: numero,
  top5: numero,
  top6: numero,
  top10: numero,
  top12: numero,
  top25: numero,
  kills: numero,
  killsPerMin: numero,
  killsPerMatch: numero,
  deaths: numero,
  kd: numero,
  matches: numero,
  winRate: numero,
  minutesPlayed: numero,
  playersOutlived: numero,
  lastModified: z.string().nullish(),
})

const porModoSchema = z
  .object({
    overall: modoSchema.nullish(),
    solo: modoSchema.nullish(),
    duo: modoSchema.nullish(),
    squad: modoSchema.nullish(),
    ltm: modoSchema.nullish(),
  })
  .nullish()

const respuestaFortniteApi = z.object({
  status: z.number(),
  data: z.object({
    account: z.object({ id: z.string(), name: z.string() }),
    battlePass: z.object({ level: numero }).nullish(),
    stats: z.object({
      all: porModoSchema,
      keyboardMouse: porModoSchema,
      gamepad: porModoSchema,
      touch: porModoSchema,
    }),
  }),
})

const respuestaFortniteApiIo = z.object({
  result: z.boolean(),
  account: z.object({ id: z.string(), name: z.string() }).nullish(),
  global_stats: z
    .record(
      z.object({
        placetop1: numero,
        kills: numero,
        matchesplayed: numero,
        kd: numero,
        winrate: numero,
        minutesplayed: numero,
        playersoutlived: numero,
      }),
    )
    .nullish(),
})

async function conTimeout(url: string, headers: Record<string, string>): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { headers, signal: ctrl.signal, cache: 'no-store' })
  } finally {
    clearTimeout(t)
  }
}

/** Circuit breaker: 5 fallos seguidos y el proveedor queda fuera 10 min. */
async function estaCaido(proveedor: Proveedor, db: Db): Promise<boolean> {
  const salud = await db.providerHealth.findUnique({ where: { provider: proveedor } })
  return Boolean(salud?.openedUntil && salud.openedUntil.getTime() > Date.now())
}

async function anotarFallo(proveedor: Proveedor, error: string, db: Db): Promise<void> {
  const salud = await db.providerHealth.upsert({
    where: { provider: proveedor },
    create: { provider: proveedor, consecutiveFails: 1, lastError: error.slice(0, 500) },
    update: { consecutiveFails: { increment: 1 }, lastError: error.slice(0, 500) },
  })
  if (salud.consecutiveFails >= FALLOS_PARA_ABRIR) {
    await db.providerHealth.update({
      where: { provider: proveedor },
      data: { openedUntil: new Date(Date.now() + APERTURA_MS), consecutiveFails: 0 },
    })
  }
}

async function anotarExito(proveedor: Proveedor, db: Db): Promise<void> {
  await db.providerHealth.upsert({
    where: { provider: proveedor },
    create: { provider: proveedor, consecutiveFails: 0 },
    update: { consecutiveFails: 0, openedUntil: null, lastError: null },
  })
}

function normalizar(crudo: z.infer<typeof modoSchema>): StatsModo {
  const v = (n: number | null | undefined) => (typeof n === 'number' ? n : null)
  return {
    score: v(crudo.score),
    scorePerMin: v(crudo.scorePerMin),
    scorePerMatch: v(crudo.scorePerMatch),
    wins: v(crudo.wins),
    top3: v(crudo.top3),
    top5: v(crudo.top5),
    top6: v(crudo.top6),
    top10: v(crudo.top10),
    top12: v(crudo.top12),
    top25: v(crudo.top25),
    kills: v(crudo.kills),
    killsPerMin: v(crudo.killsPerMin),
    killsPerMatch: v(crudo.killsPerMatch),
    deaths: v(crudo.deaths),
    kd: v(crudo.kd),
    matches: v(crudo.matches),
    winRate: v(crudo.winRate),
    minutesPlayed: v(crudo.minutesPlayed),
    playersOutlived: v(crudo.playersOutlived),
    lastModified: crudo.lastModified ?? null,
  }
}

/**
 * Traduce el error de fortnite-api.com a un motivo. Los tres casos llegan
 * como 403 o 404 y significan cosas distintas para el jugador.
 *
 * Exportada para poder probarla contra los mensajes reales de la API sin
 * levantar una petición.
 */
export function motivoDeRespuesta(estado: number, mensaje: string): MotivoSinStats | null {
  if (estado === 403) return 'privadas'
  if (estado === 404) return /didnt play any match/i.test(mensaje) ? 'sin-partidas' : 'no-existe'
  return null
}

async function desdeFortniteApi(nick: string): Promise<Consulta | null> {
  const key = process.env.FORTNITE_API_KEY
  if (!key) return null
  const url = `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(nick)}`
  const res = await conTimeout(url, { Authorization: key })

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => '')
    const motivo = motivoDeRespuesta(res.status, cuerpo)
    // Un perfil privado o inexistente es una respuesta correcta del
    // proveedor, no una falla suya: no puede abrir el circuit breaker ni
    // dejar sin servicio a los demás jugadores.
    if (motivo) return { estado: 'sin-stats', motivo }
    throw new Error(`fortnite-api respondió ${res.status}`)
  }

  const json: unknown = await res.json()
  const parsed = respuestaFortniteApi.safeParse(json)
  if (!parsed.success) throw new Error('fortnite-api cambió el schema de la respuesta')

  const detalle: StatsJugador['detalle'] = {}
  for (const entrada of ENTRADAS) {
    const porModo = parsed.data.data.stats[entrada]
    if (!porModo) continue
    const modos: Partial<Record<Modo, StatsModo>> = {}
    for (const modo of MODOS) {
      const datos = porModo[modo]
      if (datos) modos[modo] = normalizar(datos)
    }
    if (Object.keys(modos).length > 0) detalle[entrada] = modos
  }

  const total = detalle.all?.overall
  return {
    estado: 'ok',
    stats: {
      accountId: parsed.data.data.account.id,
      nick: parsed.data.data.account.name,
      nivelPase: parsed.data.data.battlePass?.level ?? null,
      detalle,
      wins: total?.wins ?? null,
      kills: total?.kills ?? null,
      matchesPlayed: total?.matches ?? null,
      proveedor: 'fortnite-api',
      crudo: json,
    },
  }
}

async function desdeFortniteApiIo(nick: string): Promise<Consulta | null> {
  const key = process.env.FORTNITE_API_IO_KEY
  if (!key) return null
  const url = `https://fortniteapi.io/v1/stats?username=${encodeURIComponent(nick)}`
  const res = await conTimeout(url, { Authorization: key })
  if (res.status === 404) return { estado: 'sin-stats', motivo: 'no-existe' }
  if (res.status === 403) return { estado: 'sin-stats', motivo: 'privadas' }
  if (!res.ok) throw new Error(`fortniteapi.io respondió ${res.status}`)

  const json: unknown = await res.json()
  const parsed = respuestaFortniteApiIo.safeParse(json)
  if (!parsed.success) throw new Error('fortniteapi.io cambió el schema de la respuesta')
  if (!parsed.data.result || !parsed.data.account) return { estado: 'sin-stats', motivo: 'no-existe' }

  const global = parsed.data.global_stats ?? {}
  const agregado = Object.values(global).reduce<{
    wins: number
    kills: number
    matches: number
    deaths: number
    minutos: number
    sobrevividos: number
  }>(
    (acc, modo) => ({
      wins: acc.wins + (modo.placetop1 ?? 0),
      kills: acc.kills + (modo.kills ?? 0),
      matches: acc.matches + (modo.matchesplayed ?? 0),
      deaths: acc.deaths + ((modo.matchesplayed ?? 0) - (modo.placetop1 ?? 0)),
      minutos: acc.minutos + (modo.minutesplayed ?? 0),
      sobrevividos: acc.sobrevividos + (modo.playersoutlived ?? 0),
    }),
    { wins: 0, kills: 0, matches: 0, deaths: 0, minutos: 0, sobrevividos: 0 },
  )

  const vacio: StatsModo = {
    score: null,
    scorePerMin: null,
    scorePerMatch: null,
    wins: agregado.wins,
    top3: null,
    top5: null,
    top6: null,
    top10: null,
    top12: null,
    top25: null,
    kills: agregado.kills,
    killsPerMin: null,
    killsPerMatch: agregado.matches ? agregado.kills / agregado.matches : null,
    deaths: agregado.deaths,
    kd: agregado.deaths ? agregado.kills / agregado.deaths : null,
    matches: agregado.matches,
    winRate: agregado.matches ? (agregado.wins / agregado.matches) * 100 : null,
    minutesPlayed: agregado.minutos,
    playersOutlived: agregado.sobrevividos,
    lastModified: null,
  }

  return {
    estado: 'ok',
    stats: {
      accountId: parsed.data.account.id,
      nick: parsed.data.account.name,
      nivelPase: null,
      detalle: { all: { overall: vacio } },
      wins: agregado.wins,
      kills: agregado.kills,
      matchesPlayed: agregado.matches,
      proveedor: 'fortniteapi-io',
      crudo: json,
    },
  }
}

/**
 * Primario fortnite-api.com, fallback fortniteapi.io. Si los dos caen se
 * devuelve el motivo y el sistema degrada a reporte manual sin bloquear nada.
 */
export async function consultarJugador(nick: string, db: Db = prisma): Promise<Consulta> {
  const clave = `fn:stats:${nick.toLowerCase()}`
  const cacheado = await leer<StatsJugador>(clave, db)
  if (cacheado) return { estado: 'ok', stats: cacheado }

  const intentos: [Proveedor, () => Promise<Consulta | null>][] = [
    ['fortnite-api', () => desdeFortniteApi(nick)],
    ['fortniteapi-io', () => desdeFortniteApiIo(nick)],
  ]

  let motivo: MotivoSinStats = 'no-disponible'

  for (const [proveedor, llamar] of intentos) {
    if (await estaCaido(proveedor, db)) continue
    try {
      const resultado = await llamar()
      if (!resultado) continue
      await anotarExito(proveedor, db)
      if (resultado.estado === 'ok') {
        await guardar(clave, resultado.stats, TTL_STATS_MS, db)
        return resultado
      }
      if (PRIORIDAD[resultado.motivo] > PRIORIDAD[motivo]) motivo = resultado.motivo
    } catch (e) {
      await anotarFallo(proveedor, e instanceof Error ? e.message : String(e), db)
    }
  }
  return { estado: 'sin-stats', motivo }
}

/** Igual que consultarJugador, para quien solo necesita las stats o nada. */
export async function buscarJugador(nick: string, db: Db = prisma): Promise<StatsJugador | null> {
  const resultado = await consultarJugador(nick, db)
  return resultado.estado === 'ok' ? resultado.stats : null
}

/**
 * ¿Hay al menos un proveedor configurado? Sin key no hay verificación.
 *
 * Con `||` y no con `??`: el compose define las variables sin valor como
 * cadena vacía, que `??` da por buena.
 */
export function hayProveedor(): boolean {
  return Boolean(process.env.FORTNITE_API_KEY || process.env.FORTNITE_API_IO_KEY)
}

export async function verificacionDisponible(db: Db = prisma): Promise<boolean> {
  if (!hayProveedor()) return false
  const [a, b] = await Promise.all([estaCaido('fortnite-api', db), estaCaido('fortniteapi-io', db)])
  return !(a && b)
}
