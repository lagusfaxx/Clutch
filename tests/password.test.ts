import { describe, expect, it } from 'vitest'
import { hashearClave, verificarClave, problemaConLaClave, LARGO_MINIMO } from '@/lib/password'

describe('contraseñas', () => {
  it('verifica la contraseña correcta', async () => {
    const guardado = await hashearClave('una clave larga y decente')
    expect(await verificarClave('una clave larga y decente', guardado)).toBe(true)
  })

  it('rechaza la incorrecta', async () => {
    const guardado = await hashearClave('una clave larga y decente')
    expect(await verificarClave('otra clave distinta', guardado)).toBe(false)
  })

  it('nunca guarda la contraseña en claro', async () => {
    const guardado = await hashearClave('cachorro-verde-1982')
    expect(guardado).not.toContain('cachorro')
    expect(guardado.startsWith('scrypt$16384$8$1$')).toBe(true)
  })

  it('usa una sal distinta cada vez', async () => {
    expect(await hashearClave('misma clave de siempre')).not.toBe(await hashearClave('misma clave de siempre'))
  })

  it('no revienta con un hash malformado', async () => {
    expect(await verificarClave('lo que sea', 'basura')).toBe(false)
    expect(await verificarClave('lo que sea', '')).toBe(false)
  })

  it('normaliza unicode: la misma clave escrita distinto sirve igual', async () => {
    const guardado = await hashearClave('contraseña segura')
    expect(await verificarClave('contraseña segura', guardado)).toBe(true)
  })

  it('exige largo mínimo', () => {
    expect(problemaConLaClave('a'.repeat(LARGO_MINIMO - 1))).toMatch(/al menos/)
    expect(problemaConLaClave('a'.repeat(LARGO_MINIMO))).toBeNull()
  })

  it('corta las contraseñas obvias', () => {
    expect(problemaConLaClave('password123')).toMatch(/adivinar/)
    expect(problemaConLaClave('qwertyuiop')).toMatch(/adivinar/)
  })

  it('rechaza espacios al borde, que se pierden al copiar y pegar', () => {
    expect(problemaConLaClave(' clave con espacio')).toMatch(/espacios/)
  })
})
