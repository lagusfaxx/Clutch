import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { torneoPorSlug, tablaTorneo } from '@/server/services/tournament'
import { leerConfig } from '@/server/services/scoring'
import { disputasDeTorneo } from '@/server/services/dispute'
import { bitacoraPublica } from '@/server/services/audit'
import { verificacionDisponible } from '@/server/services/fortnite/client'
import { usuarioActual } from '@/server/auth'
import { fechaCL } from '@/lib/fechas'
import { CuentaRegresiva } from '@/components/CuentaRegresiva'
import { Podio } from '@/components/Marcador'
import { PanelJugador } from '@/components/PanelJugador'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const torneo = await torneoPorSlug(slug)
  if (!torneo) return { title: 'Torneo no encontrado' }
  return {
    title: torneo.name,
    description: `${torneo.mode} · ${torneo.maxSlots} cupos · ${fechaCL(torneo.startsAt)}. Tabla en vivo, reglas y premios.`,
  }
}

export default async function TorneoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const torneo = await torneoPorSlug(slug)
  if (!torneo) notFound()

  const [tabla, usuario, disputas, bitacora, apiViva] = await Promise.all([
    tablaTorneo(torneo.id),
    usuarioActual(),
    disputasDeTorneo(torneo.id),
    bitacoraPublica('Tournament', torneo.id),
    verificacionDisponible(),
  ])

  const inscripcion = usuario
    ? await prisma.registration.findUnique({
        where: { tournamentId_userId: { tournamentId: torneo.id, userId: usuario.id } },
      })
    : null

  const partidas = await prisma.match.findMany({
    where: { tournamentId: torneo.id, deletedAt: null },
    orderBy: { index: 'asc' },
    include: inscripcion ? { results: { where: { registrationId: inscripcion.id } } } : undefined,
  })

  const config = leerConfig(torneo.scoringConfig)
  const ahora = Date.now()
  const checkInAbierto = ahora >= torneo.checkInOpensAt.getTime() && ahora < torneo.startsAt.getTime()

  return (
    <div className="space-y-6">
      <header className="bloque p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-marcador">{torneo.name}</h1>
            <p className="mt-1 text-[13px] text-humo">
              {torneo.mode} · {torneo.format.replace(/_/g, ' ').toLowerCase()} · servidor {torneo.serverRegion}
              {torneo.platformRule !== 'CUALQUIERA' && ` · ${torneo.platformRule.replace('_', ' ').toLowerCase()}`}
            </p>
          </div>
          <CuentaRegresiva hasta={torneo.startsAt.toISOString()} etiqueta="parte en" />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-5">
          <Dato titulo="Inscritos" valor={`${torneo._count.registrations}/${torneo.maxSlots}`} resaltado />
          <Dato titulo="Partidas" valor={`mejores ${torneo.matchesCounted} de ${torneo.matchesTotal}`} />
          <Dato titulo="Check-in" valor={fechaCL(torneo.checkInOpensAt)} />
          <Dato titulo="Termina" valor={fechaCL(torneo.endsAt)} />
          <Dato
            titulo="Entrada"
            valor={torneo.entryFeeClp > 0 ? `$${torneo.entryFeeClp.toLocaleString('es-CL')}` : 'Gratis'}
          />
        </dl>

        {torneo.description && <p className="mt-4 max-w-[70ch] text-[13px]">{torneo.description}</p>}

        <div className="mt-4">
          {usuario ? (
            <PanelJugador
              torneoId={torneo.id}
              slug={torneo.slug}
              estadoInscripcion={inscripcion?.status ?? null}
              checkInAbierto={checkInAbierto}
              inscripcionesAbiertas={['PUBLICADO', 'INSCRIPCION_ABIERTA'].includes(torneo.status)}
              partidas={partidas.map((p) => ({
                id: p.id,
                index: p.index,
                reportado: 'results' in p && Array.isArray(p.results) ? p.results.length > 0 : false,
              }))}
            />
          ) : (
            <Link href="/entrar" className="boton">
              Entra con Discord para inscribirte
            </Link>
          )}
        </div>

        {!apiViva && (
          <p className="mt-3 border border-linea px-3 py-2 text-[12px] text-podio">
            Verificación automática no disponible en este momento. El torneo corre igual con el reporte manual.
          </p>
        )}
      </header>

      <section className="grid gap-px bg-linea lg:grid-cols-[1.6fr_1fr]">
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Tabla del torneo</h2>
          {tabla.length === 0 ? (
            <p className="text-[13px] text-humo">Nadie ha reportado resultados todavía.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th className="num w-10">#</th>
                  <th>Jugador</th>
                  <th>Equipo</th>
                  <th className="num">Pts</th>
                  <th className="num">Partidas</th>
                  <th className="num">Mejor</th>
                  <th className="num">Elim</th>
                </tr>
              </thead>
              <tbody>
                {tabla.map((f) => (
                  <tr key={f.registrationId}>
                    <td className="num">
                      <Podio posicion={f.posicion} />
                    </td>
                    <td className="font-medium">
                      <Link href={`/j/${f.slug}`}>{f.displayName}</Link>
                      {f.enDisputa && <span className="ml-2 text-[11px] text-podio">en disputa</span>}
                    </td>
                    <td className="text-humo">{f.teamName ?? '—'}</td>
                    <td className="num cifra text-cal">{f.puntos}</td>
                    <td className="num cifra">{f.partidasJugadas}</td>
                    <td className="num cifra">{f.mejorPosicion ?? '—'}</td>
                    <td className="num cifra">{f.eliminaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="space-y-5 bg-panel p-5">
          <div>
            <h2 className="mb-2 text-[13px] font-semibold text-humo">Puntaje</h2>
            <table className="tabla">
              <tbody>
                {config.porPosicion.map((tramo, i) => {
                  const desde = i === 0 ? 1 : (config.porPosicion[i - 1]?.hasta ?? 0) + 1
                  return (
                    <tr key={tramo.hasta}>
                      <td>{desde === tramo.hasta ? `Puesto ${desde}` : `Puestos ${desde} a ${tramo.hasta}`}</td>
                      <td className="num cifra text-cal">{tramo.puntos}</td>
                    </tr>
                  )
                })}
                <tr>
                  <td>Por eliminación</td>
                  <td className="num cifra text-cal">{config.porEliminacion}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {torneo.prizes.length > 0 && (
            <div>
              <h2 className="mb-2 text-[13px] font-semibold text-humo">Premios</h2>
              <table className="tabla">
                <tbody>
                  {torneo.prizes.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Podio posicion={p.placement} />
                      </td>
                      <td>{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="bloque p-5">
        <h2 className="mb-2 text-[13px] font-semibold text-humo">Bitácora pública</h2>
        <p className="mb-3 max-w-[70ch] text-[12px] text-humo">
          Todo lo que hace un admin en este torneo queda acá: quién, cuándo, qué decidió y por qué. Es la única forma
          de que confíes en el resultado sin conocernos.
        </p>
        {disputas.length > 0 && (
          <table className="tabla mb-4">
            <thead>
              <tr>
                <th>Disputa</th>
                <th>Abrió</th>
                <th>Estado</th>
                <th>Resolución</th>
              </tr>
            </thead>
            <tbody>
              {disputas.map((d) => (
                <tr key={d.id}>
                  <td className="max-w-[36ch] truncate">{d.reason}</td>
                  <td className="text-humo">{d.openedBy.displayName}</td>
                  <td className="text-[12px] text-podio">{d.status.toLowerCase()}</td>
                  <td className="max-w-[36ch] truncate text-humo">{d.resolution ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {bitacora.length === 0 ? (
          <p className="text-[13px] text-humo">Sin movimientos registrados.</p>
        ) : (
          <table className="tabla">
            <tbody>
              {bitacora.map((e) => (
                <tr key={e.id}>
                  <td className="cifra w-[130px] text-humo">{fechaCL(e.createdAt)}</td>
                  <td>{e.action}</td>
                  <td className="text-humo">{JSON.stringify(e.metadata)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Dato({ titulo, valor, resaltado = false }: { titulo: string; valor: string; resaltado?: boolean }) {
  return (
    <div>
      <dt className="etiqueta">{titulo}</dt>
      <dd className={`cifra ${resaltado ? 'text-brasa' : ''}`}>{valor}</dd>
    </div>
  )
}
