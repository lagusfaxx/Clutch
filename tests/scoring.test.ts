import { describe, expect, it } from 'vitest'
import { calcularPuntos, leerConfig, totalTorneo, PUNTAJE_FNCS } from '@/server/services/scoring'
import { ErrorClutch } from '@/lib/errores'

describe('puntaje', () => {
  it('suma posición más eliminaciones', () => {
    expect(calcularPuntos(PUNTAJE_FNCS, 1, 5)).toBe(70)
    expect(calcularPuntos(PUNTAJE_FNCS, 12, 0)).toBe(20)
  })

  it('respeta el tope de eliminaciones cuando está configurado', () => {
    const config = { ...PUNTAJE_FNCS, topeEliminaciones: 3 }
    expect(calcularPuntos(config, 1, 10)).toBe(66)
  })

  it('da cero fuera de los tramos definidos', () => {
    expect(calcularPuntos(PUNTAJE_FNCS, 500, 0)).toBe(0)
  })

  it('rechaza posiciones inválidas', () => {
    expect(() => calcularPuntos(PUNTAJE_FNCS, 0, 1)).toThrow(ErrorClutch)
  })

  it('cuenta solo las mejores N partidas', () => {
    expect(totalTorneo([10, 50, 30, 5, 40, 20, 60, 1], 6)).toBe(210)
  })

  it('rechaza una tabla de puntaje mal armada', () => {
    expect(() => leerConfig({ porPosicion: [] })).toThrow(ErrorClutch)
  })
})
