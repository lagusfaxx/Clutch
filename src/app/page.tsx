import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { tablaPublica } from '@/server/services/ranking'
import { proximosTorneos } from '@/server/services/tournament'
import { fechaCL } from '@/lib/fechas'
import { TablaRanking } from '@/components/Marcador'
import { CuentaRegresiva } from '@/components/CuentaRegresiva'

export const dynamic = 'force-dynamic'
export const revalidate = 0

async function ultimosResultados() {
  return prisma.matchResult.findMany({
    where: { deletedAt: null, status: { in: ['REPORTADO', 'VERIFICADO'] } },
    include: {
      registration: { include: { user: { select: { displayName: true, slug: true } } } },
      match: { include: { tournament: { select: { name: true, slug: true } } } },
    },
    orderBy: { reportedAt: 'desc' },
    take: 12,
  })
}

/**
 * El héroe es dato vivo (§7): ranking, próximo torneo con cuenta regresiva
 * y últimas partidas reportadas. Esto es un marcador, no una landing.
 */
export default async function Home() {
  const [top, torneos, resultados] = await Promise.all([
    tablaPublica({ game: 'FORTNITE', limite: 10 }),
    proximosTorneos(4),
    ultimosResultados(),
  ])
  const proximo = torneos[0]

  return (
    <div className="space-y-6">
      <section className="grid gap-px bg-linea md:grid-cols-[1.4fr_1fr]">
        <div className="bg-panel p-5">
          {proximo ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h1 className="text-marcador">{proximo.name}</h1>
                <CuentaRegresiva hasta={proximo.startsAt.toISOString()} etiqueta="parte en" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                <Metrica titulo="Modo" valor={proximo.mode} />
                <Metrica
                  titulo="Cupos"
                  valor={`${proximo._count.registrations}/${proximo.maxSlots}`}
                  resaltada
                />
                <Metrica titulo="Servidor" valor={proximo.serverRegion} />
                <Metrica
                  titulo="Entrada"
                  valor={proximo.entryFeeClp > 0 ? `$${proximo.entryFeeClp.toLocaleString('es-CL')}` : 'Gratis'}
                />
              </dl>
              <p className="mt-4 text-[13px] text-humo">
                Check-in abre {fechaCL(proximo.checkInOpensAt)}. Si no haces check-in, tu cupo se va a la lista de
                espera.
              </p>
              <div className="mt-4 flex gap-3">
                <Link href={`/torneos/${proximo.slug}`} className="boton">
                  Inscríbete
                </Link>
                <Link href="/torneos" className="boton-plano">
                  Ver todos
                </Link>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-marcador">Sin torneos agendados</h1>
              <p className="mt-3 text-[13px] text-humo">
                Estamos armando la próxima fecha. Crea tu cuenta y te avisamos cuando abran las inscripciones.
              </p>
            </>
          )}
        </div>

        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Top 10 · Fortnite</h2>
          <TablaRanking filas={top} compacta />
          <Link href="/ranking" className="mt-3 inline-block text-[12px] text-brasa">
            Tabla completa
          </Link>
        </div>
      </section>

      <section className="grid gap-px bg-linea lg:grid-cols-[1fr_1fr]">
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Últimas partidas reportadas</h2>
          {resultados.length === 0 ? (
            <p className="text-[13px] text-humo">Todavía no se reporta nada.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Jugador</th>
                  <th>Torneo</th>
                  <th className="num">Pos</th>
                  <th className="num">Elim</th>
                  <th className="num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">
                      <Link href={`/j/${r.registration.user.slug}`}>{r.registration.user.displayName}</Link>
                    </td>
                    <td className="text-humo">
                      <Link href={`/torneos/${r.match.tournament.slug}`}>{r.match.tournament.name}</Link>
                    </td>
                    <td className="num cifra">{r.placement}</td>
                    <td className="num cifra">{r.eliminations}</td>
                    <td className="num cifra text-cal">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Calendario</h2>
          {torneos.length === 0 ? (
            <p className="text-[13px] text-humo">Nada agendado por ahora.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th>Modo</th>
                  <th className="num">Cupos</th>
                  <th className="num">Parte</th>
                </tr>
              </thead>
              <tbody>
                {torneos.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">
                      <Link href={`/torneos/${t.slug}`}>{t.name}</Link>
                    </td>
                    <td className="text-humo">{t.mode}</td>
                    <td className="num cifra">
                      {t._count.registrations}/{t.maxSlots}
                    </td>
                    <td className="num cifra text-humo">{fechaCL(t.startsAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

function Metrica({ titulo, valor, resaltada = false }: { titulo: string; valor: string; resaltada?: boolean }) {
  return (
    <div>
      <dt className="etiqueta">{titulo}</dt>
      <dd className={`cifra text-cifra ${resaltada ? 'text-brasa' : ''}`}>{valor}</dd>
    </div>
  )
}
