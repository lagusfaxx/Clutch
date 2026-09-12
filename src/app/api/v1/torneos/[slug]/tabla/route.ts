import { tablaTorneo, torneoPorSlug } from '@/server/services/tournament'
import { ErrorClutch } from '@/lib/errores'
import { ok, fallo } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params
    const torneo = await torneoPorSlug(slug)
    if (!torneo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
    return ok(await tablaTorneo(torneo.id))
  } catch (e) {
    return fallo(e)
  }
}
