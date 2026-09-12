import { describe, expect, it } from 'vitest'
import { rutValido, normalizarRut, edad, esMenor } from '@/server/services/user'
import { aSlug, slugUnico } from '@/lib/slug'

describe('RUT', () => {
  it('valida el dígito verificador', () => {
    expect(rutValido('11.111.111-1')).toBe(true)
    expect(rutValido('12345678-5')).toBe(true)
    expect(rutValido('12345678-9')).toBe(false)
  })

  it('acepta dígito verificador K', () => {
    expect(rutValido('20347511-K')).toBe(true)
  })

  it('normaliza el formato', () => {
    expect(normalizarRut('11.111.111-1')).toBe('11111111-1')
  })
})

describe('edad', () => {
  it('calcula los años cumplidos', () => {
    const hoy = new Date('2026-09-12T12:00:00Z')
    expect(edad(new Date('2010-09-13T00:00:00Z'), hoy)).toBe(15)
    expect(edad(new Date('2010-09-11T00:00:00Z'), hoy)).toBe(16)
  })

  it('reconoce a un menor de 18', () => {
    const nacimiento = new Date(Date.now() - 16 * 365.25 * 86_400_000)
    expect(esMenor(nacimiento)).toBe(true)
    expect(esMenor(null)).toBe(false)
  })
})

describe('slugs', () => {
  it('limpia tildes y símbolos', () => {
    expect(aSlug('Ñandú Pro_2024!')).toBe('nandu-pro-2024')
  })

  it('desempata contra los ya tomados', () => {
    expect(slugUnico('manuel', new Set(['manuel', 'manuel-2']))).toBe('manuel-3')
  })
})
