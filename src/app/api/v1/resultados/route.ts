import { reportarResultado } from '@/server/services/result'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { ok, fallo, sesionApi, ipDe } from '@/server/api/respuesta'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const usuario = await sesionApi()
    limitar(LIMITES.reporte!, usuario.id)
    const cuerpo: unknown = await req.json()
    const resultado = await reportarResultado(cuerpo as never, usuario.id, prisma, { ip: ipDe(req) })
    return ok(resultado, 201)
  } catch (e) {
    return fallo(e)
  }
}
