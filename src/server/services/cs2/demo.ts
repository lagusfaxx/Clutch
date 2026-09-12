/**
 * CS2 (fase 3). El demo es un archivo que descarga el propio organizador:
 * a diferencia de las stats de Fortnite, no depende de ninguna API de
 * terceros que puedan cortar.
 *
 * El parseo real se hace con demoinfocs-golang en un binario aparte que
 * escribe este mismo JSON por stdout. Acá vive solo el contrato y la
 * conversión a MatchResult, para que el motor de torneos no cambie.
 */
import { z } from 'zod'
import { ErrorClutch } from '@/lib/errores'

export const esquemaDemo = z.object({
  mapa: z.string(),
  duracionSeg: z.number().int().min(0),
  equipos: z
    .array(
      z.object({
        nombre: z.string(),
        rondasGanadas: z.number().int().min(0),
        jugadores: z.array(
          z.object({
            steamId: z.string(),
            nick: z.string(),
            kills: z.number().int().min(0),
            deaths: z.number().int().min(0),
            assists: z.number().int().min(0),
            adr: z.number().min(0),
          }),
        ),
      }),
    )
    .length(2),
})

export type ResumenDemo = z.infer<typeof esquemaDemo>

export function leerResumenDemo(bruto: unknown): ResumenDemo {
  const parsed = esquemaDemo.safeParse(bruto)
  if (!parsed.success) {
    throw new ErrorClutch('VALIDACION', 'El resumen del demo no tiene el formato esperado.', parsed.error.issues)
  }
  return parsed.data
}

export interface ResultadoCs2 {
  nick: string
  steamId: string
  placement: number
  eliminations: number
}

/** Traduce el demo al mismo vocabulario (posición + eliminaciones) del motor. */
export function aResultados(resumen: ResumenDemo): ResultadoCs2[] {
  const [uno, dos] = resumen.equipos
  if (!uno || !dos) throw new ErrorClutch('VALIDACION', 'El demo no trae los dos equipos.')

  const ganador = uno.rondasGanadas >= dos.rondasGanadas ? uno : dos
  return resumen.equipos.flatMap((equipo) =>
    equipo.jugadores.map((j) => ({
      nick: j.nick,
      steamId: j.steamId,
      placement: equipo === ganador ? 1 : 2,
      eliminations: j.kills,
    })),
  )
}
