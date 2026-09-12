import { z } from 'zod'
import { enviarMensaje, mensajes } from '@/server/services/message'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { ok, fallo, sesionApi } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

const cuerpo = z.object({ body: z.string().min(1).max(2000) })

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await sesionApi()
    const { id } = await ctx.params
    return ok(await mensajes(id, usuario.id))
  } catch (e) {
    return fallo(e)
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const usuario = await sesionApi()
    limitar(LIMITES.mensaje!, usuario.id)
    const { id } = await ctx.params
    const { body } = cuerpo.parse(await req.json())
    return ok(await enviarMensaje(id, usuario.id, body), 201)
  } catch (e) {
    return fallo(e)
  }
}
