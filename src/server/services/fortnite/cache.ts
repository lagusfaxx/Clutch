import { LRUCache } from 'lru-cache'
import { prisma } from '@/lib/prisma'
import type { Db } from '@/lib/prisma'

export const TTL_STATS_MS = 15 * 60 * 1000
export const TTL_ESTATICO_MS = 24 * 60 * 60 * 1000

const memoria = new LRUCache<string, { valor: unknown; expira: number }>({ max: 2000 })

/**
 * Dos niveles: memoria del proceso (rápido, se pierde en el redeploy) y
 * tabla `Cache` en Postgres (sobrevive). Sin caché la cuota se revienta
 * en la primera semana (§2.4).
 */
export async function leer<T>(clave: string, db: Db = prisma): Promise<T | null> {
  const enMemoria = memoria.get(clave)
  if (enMemoria && enMemoria.expira > Date.now()) return enMemoria.valor as T
  if (enMemoria) memoria.delete(clave)

  const fila = await db.cache.findUnique({ where: { key: clave } })
  if (!fila) return null
  if (fila.expiresAt.getTime() <= Date.now()) {
    await db.cache.delete({ where: { key: clave } }).catch(() => undefined)
    return null
  }

  memoria.set(clave, { valor: fila.value, expira: fila.expiresAt.getTime() })
  return fila.value as T
}

export async function guardar(clave: string, valor: unknown, ttlMs: number, db: Db = prisma): Promise<void> {
  const expira = new Date(Date.now() + ttlMs)
  memoria.set(clave, { valor, expira: expira.getTime() })
  await db.cache.upsert({
    where: { key: clave },
    create: { key: clave, value: valor as object, expiresAt: expira },
    update: { value: valor as object, expiresAt: expira },
  })
}

export async function limpiarVencidos(db: Db = prisma): Promise<number> {
  const { count } = await db.cache.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  return count
}

export function limpiarMemoria(): void {
  memoria.clear()
}
