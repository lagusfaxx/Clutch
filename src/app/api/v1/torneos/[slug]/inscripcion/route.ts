import { z } from 'zod'
import { inscribir, cancelarInscripcion } from '@/server/services/registration'
import { torneoPorSlug } from '@/server/services/tournament'
import { ErrorClutch } from '@/lib/errores'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { ok, fallo, sesionApi, ipDe } from '@/server/api/respuesta'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const cuerpoInscripcion = z.object({ teamId: z.string().optional() })

export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const usuario = await sesionApi()
    limitar(LIMITES.inscripcion!, usuario.id)

    const { slug } = await ctx.params
    const torneo = await torneoPorSlug(slug)
    if (!torneo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')

    const cuerpo = cuerpoInscripcion.parse(await req.json().catch(() => ({})))
    const inscripcion = await inscribir(torneo.id, usuario.id, { teamId: cuerpo.teamId, ip: ipDe(req) })
    return ok(inscripcion, 201)
  } catch (e) {
    return fallo(e)
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const usuario = await sesionApi()
    const { slug } = await ctx.params
    const torneo = await torneoPorSlug(slug)
    if (!torneo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')

    const inscripcion = await prisma.registration.findUnique({
      where: { tournamentId_userId: { tournamentId: torneo.id, userId: usuario.id } },
    })
    if (!inscripcion) throw new ErrorClutch('NO_ENCONTRADO', 'No estás inscrito en ese torneo.')

    return ok(await cancelarInscripcion(inscripcion.id, usuario.id))
  } catch (e) {
    return fallo(e)
  }
}
