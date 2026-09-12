import { describe, expect, it } from 'vitest'
import { evaluar } from '@/server/services/fortnite/reconcile'
import { UMBRAL_CONFIANZA } from '@/server/services/result'

describe('reconciliación por delta de snapshots', () => {
  it('sin snapshots queda neutro y no bloquea', () => {
    const c = evaluar({ kills: 8, wins: 1, matches: 6 }, null)
    expect(c.score).toBe(0.5)
  })

  it('pilla el fraude grosero: reportó 8 kills y el contador subió 2', () => {
    const c = evaluar({ kills: 8, wins: 0, matches: 6 }, { kills: 2, wins: 0, matches: 6 })
    expect(c.score).toBeLessThan(UMBRAL_CONFIANZA)
  })

  it('acepta lo que calza con el contador', () => {
    const c = evaluar({ kills: 11, wins: 1, matches: 6 }, { kills: 12, wins: 1, matches: 6 })
    expect(c.score).toBeGreaterThan(UMBRAL_CONFIANZA)
  })

  it('marca cuando el contador de partidas ni se movió', () => {
    const c = evaluar({ kills: 4, wins: 0, matches: 3 }, { kills: 0, wins: 0, matches: 0 })
    expect(c.score).toBeLessThan(UMBRAL_CONFIANZA)
  })

  it('tolera diferencias chicas dentro del margen', () => {
    const c = evaluar({ kills: 21, wins: 0, matches: 6 }, { kills: 20, wins: 0, matches: 6 })
    expect(c.score).toBeGreaterThan(UMBRAL_CONFIANZA)
  })
})
