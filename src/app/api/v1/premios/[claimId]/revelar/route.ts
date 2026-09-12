import { revelarCodigo } from '@/server/services/prize'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { ok, fallo, sesionApi, ipDe } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

/**
 * Único lugar de todo el sistema donde un código sale en claro, y solo una
 * vez. No se loguea, no aparece en ninguna otra respuesta (§4).
 */
export async function POST(req: Request, ctx: { params: Promise<{ claimId: string }> }) {
  try {
    const usuario = await sesionApi()
    limitar(LIMITES.premio!, usuario.id)
    const { claimId } = await ctx.params
    const codigo = await revelarCodigo(claimId, usuario.id, ipDe(req))
    return ok({ codigo, aviso: 'Cópialo ahora. No se vuelve a mostrar.' })
  } catch (e) {
    return fallo(e)
  }
}
