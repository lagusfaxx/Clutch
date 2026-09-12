import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { esErrorClutch, ErrorClutch } from '@/lib/errores'
import { auth } from '../auth'
import { prisma } from '@/lib/prisma'

/**
 * Cáscara fina para /api/v1 (§1). Acá no vive lógica de negocio: solo
 * autenticación, validación del borde y traducción de errores a HTTP.
 */
export function ok<T>(datos: T, status = 200) {
  return NextResponse.json({ ok: true, datos }, { status })
}

export function fallo(e: unknown) {
  if (esErrorClutch(e)) {
    return NextResponse.json({ ok: false, codigo: e.codigo, mensaje: e.message }, { status: e.http })
  }
  if (e instanceof ZodError) {
    return NextResponse.json(
      { ok: false, codigo: 'VALIDACION', mensaje: 'Revisa los datos enviados.', detalle: e.issues },
      { status: 422 },
    )
  }
  console.error('[api] error no controlado', e)
  return NextResponse.json({ ok: false, codigo: 'INTERNO', mensaje: 'Se cayó algo de nuestro lado.' }, { status: 500 })
}

export function ipDe(req: Request): string {
  const adelante = req.headers.get('x-forwarded-for')
  return adelante?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'desconocida'
}

export async function sesionApi() {
  const sesion = await auth()
  if (!sesion?.user?.id) throw new ErrorClutch('NO_AUTORIZADO', 'Tienes que iniciar sesión.')
  return sesion.user
}

export async function sesionAdmin() {
  const usuario = await sesionApi()
  const fila = await prisma.user.findUnique({ where: { id: usuario.id }, select: { isAdmin: true } })
  if (!fila?.isAdmin) throw new ErrorClutch('PROHIBIDO', 'No tienes permisos de administración.')
  return usuario
}
