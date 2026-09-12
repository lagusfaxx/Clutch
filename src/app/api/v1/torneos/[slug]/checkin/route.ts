import { hacerCheckIn } from '@/server/services/registration'
import { torneoPorSlug } from '@/server/services/tournament'
import { ErrorClutch } from '@/lib/errores'
import { ok, fallo, sesionApi } from '@/server/api/respuesta'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const usuario = await sesionApi()
    const { slug } = await ctx.params
    const torneo = await torneoPorSlug(slug)
    if (!torneo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')

    const inscripcion = await prisma.registration.findUnique({
      where: { tournamentId_userId: { tournamentId: torneo.id, userId: usuario.id } },
    })
    if (!inscripcion) throw new ErrorClutch('NO_ENCONTRADO', 'No estás inscrito en ese torneo.')

    return ok(await hacerCheckIn(inscripcion.id, usuario.id))
  } catch (e) {
    return fallo(e)
  }
}
