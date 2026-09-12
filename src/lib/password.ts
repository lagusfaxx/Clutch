import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  clave: string | Buffer,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/**
 * scrypt del propio Node: sin dependencias nativas que compilar en el
 * contenedor y con parámetros explícitos, en vez de confiar en los de una
 * librería que puede cambiarlos entre versiones.
 *
 * N=16384, r=8, p=1 es el mínimo recomendado por RFC 9106 para uso
 * interactivo. Formato guardado: scrypt$N$r$p$sal$hash, todo en base64url.
 */
const N = 16_384
const R = 8
const P = 1
const LARGO = 64
const MAXMEM = 64 * 1024 * 1024

export const LARGO_MINIMO = 10

export async function hashearClave(clave: string): Promise<string> {
  const sal = randomBytes(16)
  const derivada = await scrypt(clave.normalize('NFKC'), sal, LARGO, { N, r: R, p: P, maxmem: MAXMEM })
  return ['scrypt', N, R, P, sal.toString('base64url'), derivada.toString('base64url')].join('$')
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$')
  const [algoritmo, n, r, p, salB64, hashB64] = partes
  if (partes.length !== 6 || algoritmo !== 'scrypt' || !salB64 || !hashB64) return false

  const esperado = Buffer.from(hashB64, 'base64url')
  const derivada = await scrypt(clave.normalize('NFKC'), Buffer.from(salB64, 'base64url'), esperado.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  })
  return derivada.length === esperado.length && timingSafeEqual(derivada, esperado)
}

/**
 * Reglas de contraseña. Largo por sobre composición: exigir símbolos empuja
 * a la gente a "Clutch123!" y no agrega entropía real.
 */
export function problemaConLaClave(clave: string): string | null {
  if (clave.length < LARGO_MINIMO) return `La contraseña necesita al menos ${LARGO_MINIMO} caracteres.`
  if (clave.length > 200) return 'La contraseña es demasiado larga.'
  if (/^\s|\s$/.test(clave)) return 'La contraseña no puede empezar ni terminar con espacios.'

  const comunes = ['contrasena', 'password', '1234567890', 'qwertyuiop', 'clutch1234', 'fortnite12']
  const normal = clave.toLowerCase().normalize('NFKC')
  if (comunes.some((c) => normal.includes(c))) return 'Esa contraseña es demasiado fácil de adivinar.'
  return null
}
