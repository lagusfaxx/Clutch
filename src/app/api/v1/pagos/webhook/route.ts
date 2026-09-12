import { NextResponse } from 'next/server'
import { confirmarPago } from '@/server/services/payment'
import { webpay } from '@/server/services/webpay'
import { fallo } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

/**
 * Confirmación servidor-a-servidor. El redirect del navegador no confirma
 * nada: solo este handler mueve la inscripción a CONFIRMADA (§2.7).
 * Transbank reintenta, así que confirmarPago es idempotente.
 */
async function procesar(token: string | null) {
  const sitio = process.env.SITE_URL ?? 'https://clutch.cl'
  if (!token) return NextResponse.redirect(`${sitio}/pago/rechazado`, 303)

  const pago = await confirmarPago(token, await webpay())
  const destino = pago.status === 'AUTORIZADO' ? '/pago/listo' : '/pago/rechazado'
  return NextResponse.redirect(`${sitio}${destino}`, 303)
}

export async function POST(req: Request) {
  try {
    const formulario = await req.formData().catch(() => null)
    const token =
      (formulario?.get('token_ws') as string | null) ?? new URL(req.url).searchParams.get('token_ws')
    return await procesar(token)
  } catch (e) {
    return fallo(e)
  }
}

export async function GET(req: Request) {
  try {
    return await procesar(new URL(req.url).searchParams.get('token_ws'))
  } catch (e) {
    return fallo(e)
  }
}
