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

const TIMEOUT_MS = 5000
const FALLOS_PARA_ABRIR = 5
const APERTURA_MS = 10 * 60 * 1000

export interface StatsJugador {
  accountId: string | null
  nick: string
  wins: number | null
  kills: number | null
  matchesPlayed: number | null
  proveedor: Proveedor
  crudo: unknown
}

const respuestaFortniteApi = z.object({
  status: z.number(),
  data: z.object({
    account: z.object({ id: z.string(), name: z.string() }),
    stats: z.object({
      all: z
        .object({
          overall: z
            .object({
              wins: z.number().nullish(),
              kills: z.number().nullish(),
              matches: z.number().nullish(),
            })
            .nullish(),
        })
        .nullish(),
    }),
  }),
})

const respuestaFortniteApiIo = z.object({
  result: z.boolean(),
  account: z.object({ id: z.string(), name: z.string() }).nullish(),
  global_stats: z
    .record(
      z.object({
        placetop1: z.number().nullish(),
        kills: z.number().nullish(),
        matchesplayed: z.number().nullish(),
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

async function desdeFortniteApi(nick: string): Promise<StatsJugador | null> {
  const key = process.env.FORTNITE_API_KEY
  if (!key) return null
  const url = `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(nick)}`
  const res = await conTimeout(url, { Authorization: key })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`fortnite-api respondió ${res.status}`)

  const json: unknown = await res.json()
  const parsed = respuestaFortniteApi.safeParse(json)
  if (!parsed.success) throw new Error('fortnite-api cambió el schema de la respuesta')

  const overall = parsed.data.data.stats.all?.overall
  return {
    accountId: parsed.data.data.account.id,
    nick: parsed.data.data.account.name,
    wins: overall?.wins ?? null,
    kills: overall?.kills ?? null,
    matchesPlayed: overall?.matches ?? null,
    proveedor: 'fortnite-api',
    crudo: json,
  }
}

async function desdeFortniteApiIo(nick: string): Promise<StatsJugador | null> {
  const key = process.env.FORTNITE_API_IO_KEY
  if (!key) return null
  const url = `https://fortniteapi.io/v1/stats?username=${encodeURIComponent(nick)}`
  const res = await conTimeout(url, { Authorization: key })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`fortniteapi.io respondió ${res.status}`)

  const json: unknown = await res.json()
  const parsed = respuestaFortniteApiIo.safeParse(json)
  if (!parsed.success) throw new Error('fortniteapi.io cambió el schema de la respuesta')
  if (!parsed.data.result || !parsed.data.account) return null

  const global = parsed.data.global_stats ?? {}
  const agregado = Object.values(global).reduce<{ wins: number; kills: number; matches: number }>(
    (acc, modo) => ({
      wins: acc.wins + (modo.placetop1 ?? 0),
      kills: acc.kills + (modo.kills ?? 0),
      matches: acc.matches + (modo.matchesplayed ?? 0),
    }),
    { wins: 0, kills: 0, matches: 0 },
  )

  return {
    accountId: parsed.data.account.id,
    nick: parsed.data.account.name,
    wins: agregado.wins,
    kills: agregado.kills,
    matchesPlayed: agregado.matches,
    proveedor: 'fortniteapi-io',
    crudo: json,
  }
}

/**
 * Primario fortnite-api.com, fallback fortniteapi.io. Si los dos caen se
 * devuelve null y el sistema degrada a reporte manual sin bloquear nada.
 */
export async function buscarJugador(nick: string, db: Db = prisma): Promise<StatsJugador | null> {
  const clave = `fn:stats:${nick.toLowerCase()}`
  const cacheado = await leer<StatsJugador>(clave, db)
  if (cacheado) return cacheado

  const intentos: [Proveedor, () => Promise<StatsJugador | null>][] = [
    ['fortnite-api', () => desdeFortniteApi(nick)],
    ['fortniteapi-io', () => desdeFortniteApiIo(nick)],
  ]

  for (const [proveedor, llamar] of intentos) {
    if (await estaCaido(proveedor, db)) continue
    try {
      const stats = await llamar()
      await anotarExito(proveedor, db)
      if (stats) {
        await guardar(clave, stats, TTL_STATS_MS, db)
        return stats
      }
    } catch (e) {
      await anotarFallo(proveedor, e instanceof Error ? e.message : String(e), db)
    }
  }
  return null
}

/** ¿Hay al menos un proveedor configurado? Sin key no hay verificación. */
export function hayProveedor(): boolean {
  return Boolean(process.env.FORTNITE_API_KEY ?? process.env.FORTNITE_API_IO_KEY)
}

export async function verificacionDisponible(db: Db = prisma): Promise<boolean> {
  if (!hayProveedor()) return false
  const [a, b] = await Promise.all([estaCaido('fortnite-api', db), estaCaido('fortniteapi-io', db)])
  return !(a && b)
}
