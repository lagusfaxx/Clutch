import { tablaPublica } from '@/server/services/ranking'
import { ok, fallo } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams
    const tabla = await tablaPublica({
      game: (p.get('juego') as 'FORTNITE' | 'CS2' | null) ?? 'FORTNITE',
      mode: (p.get('modo') as 'SOLO' | 'DUO' | 'SQUAD' | null) ?? undefined,
      region: p.get('region') ?? undefined,
      seasonId: p.get('temporada') ?? undefined,
      limite: Math.min(Number(p.get('limite') ?? 50), 200),
      offset: Number(p.get('offset') ?? 0),
    })
    return ok(tabla)
  } catch (e) {
    return fallo(e)
  }
}
