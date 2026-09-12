import { describe, expect, it } from 'vitest'
import { aResultados, leerResumenDemo } from '@/server/services/cs2/demo'
import { ErrorClutch } from '@/lib/errores'

const demo = {
  mapa: 'de_mirage',
  duracionSeg: 2400,
  equipos: [
    {
      nombre: 'Equipo A',
      rondasGanadas: 13,
      jugadores: [{ steamId: '1', nick: 'uno', kills: 20, deaths: 12, assists: 4, adr: 88.5 }],
    },
    {
      nombre: 'Equipo B',
      rondasGanadas: 9,
      jugadores: [{ steamId: '2', nick: 'dos', kills: 15, deaths: 18, assists: 2, adr: 70.1 }],
    },
  ],
}

describe('demo de CS2', () => {
  it('traduce el demo al vocabulario del motor de torneos', () => {
    const resultados = aResultados(leerResumenDemo(demo))
    expect(resultados.find((r) => r.nick === 'uno')?.placement).toBe(1)
    expect(resultados.find((r) => r.nick === 'dos')?.placement).toBe(2)
    expect(resultados.find((r) => r.nick === 'uno')?.eliminations).toBe(20)
  })

  it('rechaza un resumen con formato inesperado', () => {
    expect(() => leerResumenDemo({ mapa: 'de_dust2' })).toThrow(ErrorClutch)
  })
})
