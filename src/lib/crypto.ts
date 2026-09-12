import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const ALGORITMO = 'aes-256-gcm'

function clave(): Buffer {
  const bruta = process.env.PRIZE_ENCRYPTION_KEY
  if (!bruta) throw new Error('Falta PRIZE_ENCRYPTION_KEY. Sin esa clave no se guardan ni se leen códigos.')
  const buf = Buffer.from(bruta, 'base64')
  if (buf.length !== 32) {
    throw new Error('PRIZE_ENCRYPTION_KEY debe ser una clave de 32 bytes en base64.')
  }
  return buf
}

/** Formato guardado: iv.tag.ciphertext, todo en base64url separado por puntos. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITMO, clave(), iv)
  const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), enc.toString('base64url')].join('.')
}

export function descifrar(guardado: string): string {
  const partes = guardado.split('.')
  const [ivB64, tagB64, datoB64] = partes
  if (partes.length !== 3 || !ivB64 || !tagB64 || !datoB64) {
    throw new Error('Contenido cifrado con formato inválido.')
  }
  const decipher = createDecipheriv(ALGORITMO, clave(), Buffer.from(ivB64, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(datoB64, 'base64url')), decipher.final()]).toString('utf8')
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const sal = process.env.AUTH_SECRET ?? ''
  return createHash('sha256').update(`${sal}:${ip}`).digest('hex')
}

export function comparaSegura(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}
