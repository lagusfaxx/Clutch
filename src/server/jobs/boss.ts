import PgBoss from 'pg-boss'
import { registrarTrabajos } from './handlers'

/**
 * Cola sobre el mismo Postgres (§5). Sin Redis: pg-boss usa SKIP LOCKED y
 * aguanta de sobra el volumen de esta plataforma.
 */
let instancia: PgBoss | null = null

export async function boss(): Promise<PgBoss> {
  if (instancia) return instancia
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Falta DATABASE_URL para levantar la cola.')

  instancia = new PgBoss({
    connectionString: url,
    schema: 'pgboss',
    retryLimit: 3,
    retryBackoff: true,
    deleteAfterDays: 14,
  })
  instancia.on('error', (e) => console.error('[cola] error', e))
  await instancia.start()
  return instancia
}

export async function encolar(nombre: string, datos: Record<string, unknown>, opciones?: PgBoss.SendOptions) {
  const b = await boss()
  return b.send(nombre, datos, opciones ?? {})
}

export async function startWorkers(): Promise<void> {
  const b = await boss()
  await registrarTrabajos(b)
  console.log('[cola] trabajadores arriba')
}

export async function stopWorkers(): Promise<void> {
  if (!instancia) return
  await instancia.stop({ graceful: true, timeout: 15_000 })
  instancia = null
}
