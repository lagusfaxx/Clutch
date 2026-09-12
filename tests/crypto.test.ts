import { beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { cifrar, descifrar, hashIp } from '@/lib/crypto'

beforeAll(() => {
  process.env.PRIZE_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  process.env.AUTH_SECRET = 'secreto-de-pruebas'
})

describe('cifrado de códigos de premio', () => {
  it('va y vuelve sin perder el contenido', () => {
    const codigo = 'ABCD-EFGH-IJKL-MNOP'
    expect(descifrar(cifrar(codigo))).toBe(codigo)
  })

  it('nunca produce el mismo texto cifrado dos veces', () => {
    expect(cifrar('mismo')).not.toBe(cifrar('mismo'))
  })

  it('falla si alguien altera el texto cifrado', () => {
    const guardado = cifrar('ABCD-EFGH')
    const partes = guardado.split('.')
    const alterado = `${partes[0]}.${partes[1]}.${Buffer.from('otra cosa').toString('base64url')}`
    expect(() => descifrar(alterado)).toThrow()
  })

  it('rechaza un formato inválido', () => {
    expect(() => descifrar('cualquier-cosa')).toThrow()
  })

  it('hashea la IP de forma estable', () => {
    expect(hashIp('190.1.1.1')).toBe(hashIp('190.1.1.1'))
    expect(hashIp(null)).toBeNull()
  })
})
