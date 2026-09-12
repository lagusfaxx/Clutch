import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { colaRevision } from '@/server/services/result'
import { fechaCL, dias } from '@/lib/fechas'
import { FormularioResolucion, BotonResultado, FormularioEpicManual } from '@/components/AdminControles'

export const dynamic = 'force-dynamic'

async function metricas() {
  const desde = new Date(Date.now() - dias(90))
  const [inscripciones, checkIns, noShows, cerrados, activos] = await Promise.all([
    prisma.registration.count({ where: { createdAt: { gte: desde }, deletedAt: null } }),
    prisma.registration.count({ where: { createdAt: { gte: desde }, checkedInAt: { not: null } } }),
    prisma.registration.count({ where: { createdAt: { gte: desde }, status: 'NO_SHOW' } }),
    prisma.tournament.count({ where: { status: 'CERRADO', deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, status: { in: ['VERIFIED', 'TRUSTED'] } } }),
  ])
  return {
    inscripciones,
    tasaCheckIn: inscripciones ? Math.round((checkIns / inscripciones) * 100) : 0,
    tasaNoShow: inscripciones ? Math.round((noShows / inscripciones) * 100) : 0,
    cerrados,
    activos,
  }
}

export default async function AdminPage() {
  const [m, cola, disputas, reportes, sinVerificar] = await Promise.all([
    metricas(),
    colaRevision(),
    prisma.dispute.findMany({
      where: { status: { in: ['ABIERTA', 'EN_REVISION'] } },
      include: {
        openedBy: { select: { displayName: true } },
        tournament: { select: { name: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.report.findMany({
      where: { resolvedAt: null },
      include: {
        reporter: { select: { displayName: true } },
        reported: { select: { displayName: true, slug: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
    prisma.user.findMany({
      where: { status: 'PENDING', deletedAt: null },
      select: { id: true, displayName: true, email: true, epicNick: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 30,
    }),
  ])

  return (
    <div className="space-y-6">
      <section className="grid gap-px bg-linea sm:grid-cols-5">
        <Metrica titulo="Inscripciones 90d" valor={m.inscripciones} />
        <Metrica titulo="Tasa check-in" valor={`${m.tasaCheckIn}%`} />
        <Metrica titulo="Tasa no-show" valor={`${m.tasaNoShow}%`} alerta={m.tasaNoShow > 20} />
        <Metrica titulo="Torneos cerrados" valor={m.cerrados} />
        <Metrica titulo="Cuentas verificadas" valor={m.activos} />
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">
          Resultados en revisión ({cola.length})
        </h2>
        {cola.length === 0 ? (
          <p className="text-[13px] text-humo">Nada pendiente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Torneo</th>
                <th className="num">Pos</th>
                <th className="num">Elim</th>
                <th className="num">Confianza</th>
                <th>Evidencia</th>
                <th>Decisión</th>
              </tr>
            </thead>
            <tbody>
              {cola.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.registration.user.displayName}</td>
                  <td className="text-humo">{r.match.tournament.name}</td>
                  <td className="num cifra">{r.placement}</td>
                  <td className="num cifra">{r.eliminations}</td>
                  <td
                    className={`num cifra ${(r.confidenceScore ?? 1) < 0.55 ? 'text-alerta' : 'text-humo'}`}
                  >
                    {r.confidenceScore !== null ? r.confidenceScore.toFixed(2) : '—'}
                  </td>
                  <td>
                    {r.evidenceUrl ? (
                      <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="text-brasa">
                        ver
                      </a>
                    ) : (
                      <span className="text-humo">sin evidencia</span>
                    )}
                  </td>
                  <td className="flex gap-2">
                    <BotonResultado resultadoId={r.id} decision="VERIFICADO" texto="Validar" />
                    <BotonResultado resultadoId={r.id} decision="RECHAZADO" texto="Rechazar" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">Disputas abiertas ({disputas.length})</h2>
        {disputas.length === 0 ? (
          <p className="text-[13px] text-humo">Sin disputas abiertas.</p>
        ) : (
          <div className="space-y-4">
            {disputas.map((d) => (
              <article key={d.id} className="border border-linea p-3">
                <p className="text-[13px]">
                  <Link href={`/torneos/${d.tournament.slug}`} className="font-medium">
                    {d.tournament.name}
                  </Link>
                  <span className="ml-2 text-humo">
                    abrió {d.openedBy.displayName} · {fechaCL(d.createdAt)}
                  </span>
                </p>
                <p className="mt-1 max-w-[80ch] text-[13px] text-humo">{d.reason}</p>
                {d.evidenceUrl && (
                  <a href={d.evidenceUrl} target="_blank" rel="noreferrer" className="text-[12px] text-brasa">
                    ver evidencia
                  </a>
                )}
                <FormularioResolucion disputaId={d.id} />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">
          Cuentas sin nick verificado ({sinVerificar.length})
        </h2>
        <p className="mb-3 max-w-[70ch] text-[12px] text-humo">
          No pueden inscribirse a torneos. Si la API no resuelve su nick, busca el accountId en el dashboard de
          fortnite-api.com y verifícalo acá. Queda registrado como verificación manual.
        </p>
        {sinVerificar.length === 0 ? (
          <p className="text-[13px] text-humo">Ninguna pendiente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Jugador</th>
                <th>Correo</th>
                <th>Nick declarado</th>
                <th className="num">Se registró</th>
                <th>Verificar a mano</th>
              </tr>
            </thead>
            <tbody>
              {sinVerificar.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.displayName}</td>
                  <td className="text-humo">{u.email ?? 'sin correo'}</td>
                  <td className="text-humo">{u.epicNick ?? 'no declaró'}</td>
                  <td className="num cifra text-humo">{fechaCL(u.createdAt)}</td>
                  <td>
                    <FormularioEpicManual userId={u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">Reportes de moderación ({reportes.length})</h2>
        {reportes.length === 0 ? (
          <p className="text-[13px] text-humo">Sin reportes pendientes.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Reportado</th>
                <th>Reporta</th>
                <th>Contexto</th>
                <th>Motivo</th>
                <th className="num">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {reportes.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">
                    <Link href={`/j/${r.reported.slug}`}>{r.reported.displayName}</Link>
                  </td>
                  <td className="text-humo">{r.reporter.displayName}</td>
                  <td className="text-humo">{r.context}</td>
                  <td className="max-w-[40ch] truncate">{r.reason}</td>
                  <td className="num cifra text-humo">{fechaCL(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

function Metrica({ titulo, valor, alerta = false }: { titulo: string; valor: string | number; alerta?: boolean }) {
  return (
    <div className="bg-panel p-4">
      <p className="etiqueta">{titulo}</p>
      <p className={`cifra text-cifra ${alerta ? 'text-alerta' : ''}`}>{valor}</p>
    </div>
  )
}
