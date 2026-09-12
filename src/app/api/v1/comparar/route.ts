import { compararJugadores } from '@/server/services/compare'
import { ErrorClutch } from '@/lib/errores'
import { ok, fallo } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams
    const a = p.get('a')
    const b = p.get('b')
    if (!a || !b) throw new ErrorClutch('VALIDACION', 'Faltan los dos jugadores a comparar.')
    return ok(await compararJugadores(a, b))
  } catch (e) {
    return fallo(e)
  }
}
