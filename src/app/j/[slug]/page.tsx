import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { perfilPorSlug } from '@/server/services/user'
import { tablaTorneo } from '@/server/services/tournament'
import { historialDeUsuario } from '@/server/services/ranking'
import { usuarioActual } from '@/server/auth'
import { fechaCL } from '@/lib/fechas'
import { Evolucion } from '@/components/Evolucion'
import type { MotivoSinStats } from '@/server/services/fortnite/client'
import { StatsFortnite, AvisoSinStats } from '@/components/StatsFortnite'
import { leerStatsGuardadas } from '@/server/services/fortnite/guardadas'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const perfil = await perfilPorSlug(slug)
  if (perfil) {
    return {
      title: `${perfil.displayName}`,
      description: `Ranking, torneos y resultados de ${perfil.displayName} en Clutch.`,
    }
  }
  const fantasma = await prisma.ghostProfile.findUnique({ where: { slug } })
  if (fantasma) {
    return {
      title: `${fantasma.epicNick}`,
      description: `${fantasma.epicNick} todavía no compite en Clutch. Mira sus stats y desafíalo.`,
    }
  }
  return { title: 'Jugador no encontrado' }
}

export default async function PerfilPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const perfil = await perfilPorSlug(slug)
  if (!perfil) return <PerfilFantasma slug={slug} />

  const [historial, yo] = await Promise.all([historialDeUsuario(perfil.id), usuarioActual()])

  const resultados: { torneo: string; slug: string; fecha: Date; posicion: number; puntos: number }[] = []
  for (const reg of perfil.registrations) {
    const tabla = await tablaTorneo(reg.tournament.id)
    const fila = tabla.find((f) => f.userId === perfil.id)
    if (!fila || fila.partidasJugadas === 0) continue
    resultados.push({
      torneo: reg.tournament.name,
      slug: reg.tournament.slug,
      fecha: reg.tournament.endsAt,
      posicion: fila.posicion,
      puntos: fila.puntos,
    })
  }

  const mejor = resultados.length ? Math.min(...resultados.map((r) => r.posicion)) : null

  return (
    <div className="space-y-6">
      <header className="bloque flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <h1 className="text-marcador">{perfil.displayName}</h1>
          <p className="mt-1 text-[13px] text-humo">
            {perfil.epicNick && !perfil.statsPrivate ? `Epic: ${perfil.epicNick} · ` : ''}
            {perfil.region ?? 'Chile'} · cuenta {perfil.status.toLowerCase()}
          </p>
          {perfil.teamMembers.length > 0 && (
            <p className="mt-1 text-[13px]">
              {perfil.teamMembers.map((m) => (
                <Link key={m.id} href={`/equipos/${m.team.slug}`} className="mr-3">
                  [{m.team.tag}] {m.team.name}
                </Link>
              ))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="etiqueta">Torneos</p>
            <p className="cifra text-cifra">{resultados.length}</p>
          </div>
          <div>
            <p className="etiqueta">Mejor puesto</p>
            <p className="cifra text-cifra text-podio">{mejor ?? '—'}</p>
          </div>
          {yo && yo.slug !== perfil.slug && (
            <Link href={`/comparar?a=${yo.slug}&b=${perfil.slug}`} className="boton">
              Comparar conmigo
            </Link>
          )}
        </div>
      </header>

      <section className="grid gap-px bg-linea lg:grid-cols-[1fr_1fr]">
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Rating por modo</h2>
          {perfil.ratings.length === 0 ? (
            <p className="text-[13px] text-humo">Sin rating: todavía no juega torneos en Clutch.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Temporada</th>
                  <th>Modo</th>
                  <th className="num">Rating</th>
                  <th className="num">Pico</th>
                  <th className="num">Torneos</th>
                </tr>
              </thead>
              <tbody>
                {perfil.ratings.map((r) => (
                  <tr key={r.id}>
                    <td>{r.season.name}</td>
                    <td className="text-humo">{r.mode}</td>
                    <td className="num cifra text-cal">{Math.round(r.rating)}</td>
                    <td className="num cifra">{Math.round(r.peakRating)}</td>
                    <td className="num cifra text-humo">{r.matchCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {historial.length > 1 && (
            <div className="mt-4">
              <p className="etiqueta mb-1">Evolución del rating</p>
              <Evolucion
                series={[{ nombre: perfil.displayName, puntos: historial.map((h) => Math.round(h.ratingAfter)) }]}
              />
            </div>
          )}
        </div>

        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Historial de torneos</h2>
          {resultados.length === 0 ? (
            <p className="text-[13px] text-humo">Sin torneos cerrados.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th className="num">Puesto</th>
                  <th className="num">Pts</th>
                  <th className="num">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={`${r.slug}-${r.fecha.toISOString()}`}>
                    <td className="font-medium">
                      <Link href={`/torneos/${r.slug}`}>{r.torneo}</Link>
                    </td>
                    <td className="num cifra text-podio">{r.posicion}</td>
                    <td className="num cifra">{r.puntos}</td>
                    <td className="num cifra text-humo">{fechaCL(r.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {perfil.prizeClaims.length > 0 && (
        <section className="bloque p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Premios ganados</h2>
          <table className="tabla">
            <tbody>
              {perfil.prizeClaims.map((c) => (
                <tr key={c.id}>
                  <td>{c.prize.description}</td>
                  <td className="text-humo">
                    <Link href={`/torneos/${c.prize.tournament.slug}`}>{c.prize.tournament.name}</Link>
                  </td>
                  <td className="text-[12px] text-cal">{c.status.replace(/_/g, ' ').toLowerCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

/**
 * Caso 2 de §2.11: existe en Fortnite, no compite en Clutch. Página
 * indexable con reclamo de perfil, no un 404.
 */
async function PerfilFantasma({ slug }: { slug: string }) {
  const fantasma = await prisma.ghostProfile.findUnique({ where: { slug } })
  if (!fantasma || fantasma.notFound) notFound()

  const stats = leerStatsGuardadas(fantasma.cachedStats)
  const motivo = fantasma.motivo as MotivoSinStats | null

  return (
    <div className="space-y-5">
      <header className="bloque p-5">
        <h1 className="text-marcador">{fantasma.epicNick}</h1>
        <p className="mt-2 max-w-[60ch] text-[13px] text-humo">
          Este jugador todavía no compite en Clutch. Lo que ves son sus stats públicas de Fortnite, que no entran al
          ranking: el ranking solo cuenta torneos jugados acá.
        </p>
      </header>

      {motivo && <AvisoSinStats motivo={motivo} nick={fantasma.epicNick} />}
      {stats && <StatsFortnite stats={stats} />}

      <section className="bloque p-5">
        <h2 className="text-[13px] font-semibold">¿Este eres tú?</h2>
        <p className="mt-1 max-w-[60ch] text-[13px] text-humo">
          Reclama tu perfil con tu cuenta de Epic y empieza a sumar ranking. Si lo conoces, mándale el link y que se
          inscriba al próximo torneo.
        </p>
        <div className="mt-3 flex gap-3">
          <Link href="/entrar" className="boton">
            Este soy yo, reclamar perfil
          </Link>
          <Link href="/torneos" className="boton-plano">
            Ver próximos torneos
          </Link>
        </div>
      </section>
    </div>
  )
}
