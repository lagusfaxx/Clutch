import { prisma } from '@/lib/prisma'
import type { Db } from '@/lib/prisma'
import { hashearClave, verificarClave, problemaConLaClave } from '@/lib/password'
import { slugLibre } from './user'

/**
 * Cuenta de administración definida por variables de entorno.
 *
 * Sin esto no hay forma de entrar al panel en un servidor recién levantado:
 * `isAdmin` no se puede activar desde la aplicación, así que la primera
 * cuenta tenía que marcarse a mano con SQL contra la base de producción.
 *
 * El entorno manda: si la clave del panel no coincide con ADMIN_PASSWORD, se
 * reescribe al arrancar. Es lo que hace que la variable sirva para recuperar
 * el acceso, y la contrapartida es que a esta cuenta no le sirve cambiar la
 * clave desde el sitio. Para el uso diario conviene una cuenta normal con
 * `isAdmin`, y dejar esta como llave de repuesto.
 */
export async function asegurarAdminInicial(db: Db = prisma): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const clave = process.env.ADMIN_PASSWORD

  if (!email || !clave) return

  const problema = problemaConLaClave(clave)
  if (problema) {
    // No se crea nada con una clave débil: una cuenta de administración con
    // credenciales adivinables es peor que no tener cuenta.
    console.error(`[admin] ADMIN_PASSWORD no sirve: ${problema} La cuenta de administración NO se creó.`)
    return
  }

  const existente = await db.user.findUnique({ where: { email } })

  if (!existente) {
    const nombre = process.env.ADMIN_NAME?.trim() || 'Administración'
    await db.user.create({
      data: {
        email,
        passwordHash: await hashearClave(clave),
        displayName: nombre,
        slug: await slugLibre(nombre, db),
        status: 'TRUSTED',
        isAdmin: true,
        emailVerifiedAt: new Date(),
      },
    })
    console.log(`[admin] cuenta de administración creada para ${email}`)
    return
  }

  const claveAlDia = existente.passwordHash ? await verificarClave(clave, existente.passwordHash) : false
  const datos: { isAdmin?: boolean; passwordHash?: string; deletedAt?: null } = {}

  if (!existente.isAdmin) datos.isAdmin = true
  if (!claveAlDia) datos.passwordHash = await hashearClave(clave)
  if (existente.deletedAt) datos.deletedAt = null

  if (Object.keys(datos).length === 0) return

  await db.user.update({ where: { id: existente.id }, data: datos })
  console.log(`[admin] cuenta de administración actualizada para ${email}`)
}
