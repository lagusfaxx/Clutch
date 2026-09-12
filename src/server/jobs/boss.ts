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

const colasCreadas = new Set<string>()

/**
 * pg-boss v10 no crea la cola sola: agendar o encolar contra una cola
 * inexistente falla por llave foránea. Esto es idempotente y se cachea en
 * memoria para no golpear la base en cada envío.
 */
export async function asegurarCola(nombre: string, b?: PgBoss): Promise<void> {
  if (colasCreadas.has(nombre)) return
  const cola = b ?? (await boss())
  try {
    await cola.createQueue(nombre)
  } catch (e) {
    // Otra réplica la creó primero: es el resultado que queríamos igual.
    if (!(e instanceof Error) || !/already exists|duplicate key/i.test(e.message)) throw e
  }
  colasCreadas.add(nombre)
}

export async function encolar(nombre: string, datos: Record<string, unknown>, opciones?: PgBoss.SendOptions) {
  const b = await boss()
  await asegurarCola(nombre, b)
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
