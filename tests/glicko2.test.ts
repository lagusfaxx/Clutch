import { describe, expect, it } from 'vitest'
import {
  actualizar,
  aplicarDecay,
  calificacionInicial,
  enfrentamientosDesdeTabla,
  pesoPorTamano,
  softReset,
} from '@/server/services/ranking/glicko2'

describe('glicko-2', () => {
  it('reproduce el ejemplo de Glickman', () => {
    const jugador = { rating: 1500, deviation: 200, volatility: 0.06 }
    const resultado = actualizar(jugador, [
      { rival: { rating: 1400, deviation: 30, volatility: 0.06 }, resultado: 1 },
      { rival: { rating: 1550, deviation: 100, volatility: 0.06 }, resultado: 0 },
      { rival: { rating: 1700, deviation: 300, volatility: 0.06 }, resultado: 0 },
    ])
    expect(resultado.rating).toBeCloseTo(1464.06, 1)
    expect(resultado.deviation).toBeCloseTo(151.52, 1)
    expect(resultado.volatility).toBeCloseTo(0.05999, 4)
  })

  it('sube el rating al ganarle a un rival más fuerte', () => {
    const antes = calificacionInicial()
    const despues = actualizar(antes, [
      { rival: { rating: 1800, deviation: 60, volatility: 0.06 }, resultado: 1 },
    ])
    expect(despues.rating).toBeGreaterThan(antes.rating)
  })

  it('sin partidas solo crece la incertidumbre', () => {
    const antes = { rating: 1700, deviation: 80, volatility: 0.06 }
    const despues = actualizar(antes, [])
    expect(despues.rating).toBe(1700)
    expect(despues.deviation).toBeGreaterThan(antes.deviation)
  })

  it('aplica 15 puntos de decay cada 30 días', () => {
    const despues = aplicarDecay({ rating: 1600, deviation: 100, volatility: 0.06 }, 61)
    expect(despues.rating).toBe(1570)
  })

  it('no aplica decay antes de los 30 días', () => {
    const antes = { rating: 1600, deviation: 100, volatility: 0.06 }
    expect(aplicarDecay(antes, 29)).toEqual(antes)
  })

  it('el soft reset comprime hacia la media sin borrar', () => {
    const despues = softReset({ rating: 2000, deviation: 60, volatility: 0.09 })
    expect(despues.rating).toBe(1700)
    expect(despues.rating).toBeGreaterThan(1500)
    expect(despues.deviation).toBeGreaterThanOrEqual(150)
  })

  it('el peso por tamaño crece de forma logarítmica, no lineal', () => {
    const chico = pesoPorTamano(12)
    const grande = pesoPorTamano(80)
    expect(grande).toBeGreaterThan(chico)
    expect(grande / chico).toBeLessThan(80 / 12)
  })

  it('convierte una tabla de posiciones en duelos par a par', () => {
    const tabla = [
      { id: 'a', posicion: 1, calificacion: calificacionInicial() },
      { id: 'b', posicion: 2, calificacion: calificacionInicial() },
      { id: 'c', posicion: 2, calificacion: calificacionInicial() },
    ]
    const duelos = enfrentamientosDesdeTabla(tabla, 1)
    expect(duelos.get('a')?.every((d) => d.resultado === 1)).toBe(true)
    expect(duelos.get('b')?.find((d) => d.resultado === 0.5)).toBeDefined()
  })
})
