import { LRUCache } from 'lru-cache'
import { ErrorClutch } from './errores'

interface Ventana {
  conteo: number
  reinicia: number
}

const registros = new LRUCache<string, Ventana>({ max: 20_000 })

export interface Limite {
  /** Nombre del cubo: 'reporte', 'inscripcion', 'login', 'premio'. */
  cubo: string
  max: number
  ventanaMs: number
}

export const LIMITES: Record<string, Limite> = {
  reporte: { cubo: 'reporte', max: 20, ventanaMs: 60_000 },
  inscripcion: { cubo: 'inscripcion', max: 10, ventanaMs: 60_000 },
  login: { cubo: 'login', max: 10, ventanaMs: 300_000 },
  premio: { cubo: 'premio', max: 5, ventanaMs: 300_000 },
  busqueda: { cubo: 'busqueda', max: 60, ventanaMs: 60_000 },
  mensaje: { cubo: 'mensaje', max: 30, ventanaMs: 60_000 },
}

/**
 * Rate limit en memoria del proceso. Con un solo contenedor alcanza (§5);
 * si algún día hay dos réplicas, esto se mueve a la tabla `Cache`.
 */
export function limitar(limite: Limite, identificador: string): void {
  const clave = `${limite.cubo}:${identificador}`
  const ahora = Date.now()
  const actual = registros.get(clave)

  if (!actual || actual.reinicia <= ahora) {
    registros.set(clave, { conteo: 1, reinicia: ahora + limite.ventanaMs })
    return
  }
  if (actual.conteo >= limite.max) {
    const segundos = Math.ceil((actual.reinicia - ahora) / 1000)
    throw new ErrorClutch('LIMITE', `Vas muy rápido. Espera ${segundos} segundos.`)
  }
  actual.conteo += 1
  registros.set(clave, actual)
}

export function limpiarLimites(): void {
  registros.clear()
}
