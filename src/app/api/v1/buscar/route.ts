import { buscar, guardarBusqueda } from '@/server/services/search'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { ok, fallo, ipDe } from '@/server/api/respuesta'
import { auth } from '@/server/auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const termino = new URL(req.url).searchParams.get('q') ?? ''
    limitar(LIMITES.busqueda!, ipDe(req))

    const resultados = await buscar(termino)
    const sesion = await auth()
    if (sesion?.user?.id && termino.trim().length >= 2) {
      await guardarBusqueda(sesion.user.id, termino)
    }
    return ok(resultados)
  } catch (e) {
    return fallo(e)
  }
}
