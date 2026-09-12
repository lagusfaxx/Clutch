import { z } from 'zod'
import { abrirConversacion, bandeja } from '@/server/services/message'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { ok, fallo, sesionApi } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({ paraUserId: z.string().min(1) })

export async function GET() {
  try {
    const usuario = await sesionApi()
    return ok(await bandeja(usuario.id))
  } catch (e) {
    return fallo(e)
  }
}

export async function POST(req: Request) {
  try {
    const usuario = await sesionApi()
    limitar(LIMITES.mensaje!, usuario.id)
    const { paraUserId } = cuerpo.parse(await req.json())
    return ok(await abrirConversacion(usuario.id, paraUserId), 201)
  } catch (e) {
    return fallo(e)
  }
}
