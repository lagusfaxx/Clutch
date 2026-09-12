import { prisma } from '@/lib/prisma'
import { crearTorneo, proximosTorneos } from '@/server/services/tournament'
import { ok, fallo, sesionAdmin } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const estado = url.searchParams.get('estado')
    if (estado === 'cerrados') {
      const cerrados = await prisma.tournament.findMany({
        where: { deletedAt: null, status: 'CERRADO' },
        orderBy: { endsAt: 'desc' },
        take: 20,
      })
      return ok(cerrados)
    }
    return ok(await proximosTorneos(20))
  } catch (e) {
    return fallo(e)
  }
}

export async function POST(req: Request) {
  try {
    const admin = await sesionAdmin()
    const cuerpo: unknown = await req.json()
    const torneo = await crearTorneo(cuerpo as never, admin.id)
    return ok(torneo, 201)
  } catch (e) {
    return fallo(e)
  }
}
