import { crearEquipo } from '@/server/services/team'
import { ok, fallo, sesionApi } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const usuario = await sesionApi()
    const cuerpo: unknown = await req.json()
    return ok(await crearEquipo(cuerpo as never, usuario.id), 201)
  } catch (e) {
    return fallo(e)
  }
}
