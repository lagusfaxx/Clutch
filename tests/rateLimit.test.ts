import { beforeEach, describe, expect, it } from 'vitest'
import { limitar, limpiarLimites } from '@/lib/rateLimit'
import { ErrorClutch } from '@/lib/errores'

beforeEach(() => limpiarLimites())

describe('rate limit', () => {
  it('deja pasar hasta el máximo', () => {
    const limite = { cubo: 'prueba', max: 3, ventanaMs: 1000 }
    expect(() => {
      for (let i = 0; i < 3; i += 1) limitar(limite, 'usuario')
    }).not.toThrow()
  })

  it('corta al pasarse y dice cuánto esperar', () => {
    const limite = { cubo: 'prueba', max: 2, ventanaMs: 5000 }
    limitar(limite, 'usuario')
    limitar(limite, 'usuario')
    try {
      limitar(limite, 'usuario')
      throw new Error('debió cortar')
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorClutch)
      expect((e as ErrorClutch).message).toMatch(/Espera \d+ segundos/)
    }
  })

  it('cuenta por identificador, no globalmente', () => {
    const limite = { cubo: 'prueba', max: 1, ventanaMs: 5000 }
    limitar(limite, 'uno')
    expect(() => limitar(limite, 'dos')).not.toThrow()
  })
})
