import { describe, expect, it } from 'vitest'
import { motivoDeRespuesta } from '@/server/services/fortnite/client'
import { leerStatsGuardadas } from '@/server/services/fortnite/guardadas'

/**
 * Los cuerpos son los que devuelve fortnite-api.com hoy, copiados tal cual
 * de respuestas reales. Si la API cambia el texto, este test avisa antes de
 * que un perfil privado vuelva a mostrarse como "no existe".
 */
describe('motivo de una respuesta sin stats', () => {
  it('distingue el perfil privado', () => {
    expect(motivoDeRespuesta(403, '{"status":403,"error":"the requested account\'s stats are not public"}')).toBe(
      'privadas',
    )
  })

  it('distingue la cuenta sin partidas de la que no existe', () => {
    expect(motivoDeRespuesta(404, '{"status":404,"error":"the requested profile didnt play any match yet"}')).toBe(
      'sin-partidas',
    )
    expect(motivoDeRespuesta(404, '{"status":404,"error":"the requested account does not exist"}')).toBe('no-existe')
  })

  it('deja pasar como falla lo que no sabe interpretar', () => {
    expect(motivoDeRespuesta(500, 'boom')).toBeNull()
    expect(motivoDeRespuesta(429, 'rate limited')).toBeNull()
  })
})

describe('stats guardadas en perfiles fantasma', () => {
  it('lee el formato actual', () => {
    const leido = leerStatsGuardadas({
      nivelPase: 49,
      detalle: { all: { overall: { wins: 417, kills: 9120, matches: 4300 } } },
    })
    expect(leido?.nivelPase).toBe(49)
    expect(leido?.detalle.all?.overall?.wins).toBe(417)
  })

  it('lee las filas viejas, que guardaban tres números sueltos', () => {
    const leido = leerStatsGuardadas({ wins: 10, kills: 200, matchesPlayed: 350 })
    expect(leido?.detalle.all?.overall?.wins).toBe(10)
    expect(leido?.detalle.all?.overall?.matches).toBe(350)
    expect(leido?.nivelPase).toBeNull()
  })

  it('no inventa nada cuando no hay datos', () => {
    expect(leerStatsGuardadas(null)).toBeNull()
    expect(leerStatsGuardadas({})).toBeNull()
    expect(leerStatsGuardadas({ wins: null, kills: null, matchesPlayed: null })).toBeNull()
  })
})
