'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { signIn } from '@/server/auth'
import { usuarioActual } from '@/server/auth'
import { registrarConEmail, vincularEpicPorNick, cambiarClave } from '@/server/services/user'
import { esErrorClutch } from '@/lib/errores'
import { limitar, LIMITES } from '@/lib/rateLimit'

export type Respuesta = { ok: true; mensaje?: string } | { ok: false; mensaje: string }

async function ip(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'desconocida'
}

export async function accionEntrar(formulario: FormData): Promise<Respuesta> {
  const email = String(formulario.get('email') ?? '')
  const password = String(formulario.get('password') ?? '')

  try {
    limitar(LIMITES.login!, await ip())
    await signIn('credentials', { email, password, redirect: false })
  } catch (e) {
    if (e instanceof AuthError) {
      return { ok: false, mensaje: 'Correo o contraseña incorrectos.' }
    }
    if (esErrorClutch(e)) return { ok: false, mensaje: e.message }
    throw e
  }
  redirect('/')
}

export async function accionRegistrar(formulario: FormData): Promise<Respuesta> {
  const email = String(formulario.get('email') ?? '')
  const password = String(formulario.get('password') ?? '')

  try {
    limitar(LIMITES.login!, await ip())
    await registrarConEmail({
      email,
      password,
      displayName: String(formulario.get('displayName') ?? ''),
      epicNick: String(formulario.get('epicNick') ?? '') || undefined,
      birthDate: String(formulario.get('birthDate') ?? '') ? new Date(String(formulario.get('birthDate'))) : undefined,
      region: String(formulario.get('region') ?? '') || undefined,
    })
    await signIn('credentials', { email, password, redirect: false })
  } catch (e) {
    if (esErrorClutch(e)) return { ok: false, mensaje: e.message }
    if (e instanceof AuthError) return { ok: false, mensaje: 'Cuenta creada, pero no pudimos iniciar sesión. Entra manualmente.' }
    console.error('[registro] error', e)
    return { ok: false, mensaje: 'No pudimos crear la cuenta. Inténtalo de nuevo.' }
  }
  redirect('/cuenta')
}

export async function accionVincularEpic(formulario: FormData): Promise<Respuesta> {
  const usuario = await usuarioActual()
  if (!usuario) return { ok: false, mensaje: 'Tienes que iniciar sesión.' }

  try {
    const cuenta = await vincularEpicPorNick(usuario.id, String(formulario.get('epicNick') ?? ''))
    revalidatePath('/cuenta')
    return { ok: true, mensaje: `Listo, quedaste como ${cuenta.epicNick}. Ya puedes inscribirte a torneos.` }
  } catch (e) {
    if (esErrorClutch(e)) return { ok: false, mensaje: e.message }
    return { ok: false, mensaje: 'No pudimos confirmar ese nick. Inténtalo de nuevo.' }
  }
}

export async function accionCambiarClave(formulario: FormData): Promise<Respuesta> {
  const usuario = await usuarioActual()
  if (!usuario) return { ok: false, mensaje: 'Tienes que iniciar sesión.' }

  try {
    await cambiarClave(
      usuario.id,
      String(formulario.get('actual') ?? ''),
      String(formulario.get('nueva') ?? ''),
    )
    return { ok: true, mensaje: 'Contraseña cambiada.' }
  } catch (e) {
    if (esErrorClutch(e)) return { ok: false, mensaje: e.message }
    return { ok: false, mensaje: 'No pudimos cambiar la contraseña.' }
  }
}
