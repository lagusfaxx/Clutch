import { perfilPorSlug } from '@/server/services/user'
import { ErrorClutch } from '@/lib/errores'
import { ok, fallo } from '@/server/api/respuesta'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params
    const perfil = await perfilPorSlug(slug)
    if (!perfil) throw new ErrorClutch('NO_ENCONTRADO', 'Ese jugador no existe en Clutch.')

    // La privacidad esconde stats, nunca resultados de torneo: el ranking
    // depende de que los resultados sean públicos (§2.10).
    return ok({
      slug: perfil.slug,
      displayName: perfil.displayName,
      epicNick: perfil.statsPrivate ? null : perfil.epicNick,
      region: perfil.region,
      status: perfil.status,
      avatarUrl: perfil.avatarUrl,
      ratings: perfil.ratings.map((r) => ({
        game: r.game,
        mode: r.mode,
        temporada: r.season.name,
        rating: Math.round(r.rating),
        pico: Math.round(r.peakRating),
        torneos: r.matchCount,
      })),
      equipos: perfil.teamMembers.map((m) => ({ nombre: m.team.name, tag: m.team.tag, slug: m.team.slug })),
      torneos: perfil.registrations.map((r) => ({
        nombre: r.tournament.name,
        slug: r.tournament.slug,
        modo: r.tournament.mode,
        fecha: r.tournament.endsAt,
      })),
    })
  } catch (e) {
    return fallo(e)
  }
}
