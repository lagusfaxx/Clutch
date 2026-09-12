import { z } from 'zod'
import { iniciarPago } from '@/server/services/payment'
import { webpay } from '@/server/services/webpay'
import { ok, fallo, sesionApi } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({ tournamentId: z.string().min(1) })

export async function POST(req: Request) {
  try {
    const usuario = await sesionApi()
    const { tournamentId } = cuerpo.parse(await req.json())
    const sitio = process.env.SITE_URL ?? 'https://clutch.cl'

    const pago = await iniciarPago(
      { userId: usuario.id, tournamentId, returnUrl: `${sitio}/api/v1/pagos/webhook` },
      await webpay(),
    )
    return ok(pago, 201)
  } catch (e) {
    return fallo(e)
  }
}
