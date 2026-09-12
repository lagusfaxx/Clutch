import Link from 'next/link'
import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'
import { proximosTorneos } from '@/server/services/tournament'
import { fechaCL } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Torneos de Fortnite en Chile',
  description: 'Calendario de torneos con inscripción abierta, cupos, premios y reglas.',
}

export default async function TorneosPage() {
  const [abiertos, cerrados] = await Promise.all([
    proximosTorneos(30),
    prisma.tournament.findMany({
      where: { deletedAt: null, status: { in: ['CERRADO', 'EN_DISPUTA'] } },
      orderBy: { endsAt: 'desc' },
      take: 20,
      include: { _count: { select: { registrations: true } } },
    }),
  ])

  return (
    <div className="space-y-6">
      <section>
        <h1 className="mb-3 text-cifra">Próximos torneos</h1>
        <div className="bloque">
          {abiertos.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-humo">No hay torneos agendados.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th>Modo</th>
                  <th>Servidor</th>
                  <th className="num">Cupos</th>
                  <th className="num">Entrada</th>
                  <th className="num">Parte</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {abiertos.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">
                      <Link href={`/torneos/${t.slug}`}>{t.name}</Link>
                    </td>
                    <td className="text-humo">{t.mode}</td>
                    <td className="text-humo">{t.serverRegion}</td>
                    <td className="num cifra">
                      {t._count.registrations}/{t.maxSlots}
                    </td>
                    <td className="num cifra">
                      {t.entryFeeClp > 0 ? `$${t.entryFeeClp.toLocaleString('es-CL')}` : 'Gratis'}
                    </td>
                    <td className="num cifra text-humo">{fechaCL(t.startsAt)}</td>
                    <td className="text-[12px] text-cal">{t.status.replace(/_/g, ' ').toLowerCase()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-humo">Torneos jugados</h2>
        <div className="bloque">
          {cerrados.length === 0 ? (
            <p className="px-3 py-6 text-[13px] text-humo">Todavía no se cierra ningún torneo.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th>Modo</th>
                  <th className="num">Inscritos</th>
                  <th className="num">Terminó</th>
                </tr>
              </thead>
              <tbody>
                {cerrados.map((t) => (
                  <tr key={t.id}>
                    <td className="font-medium">
                      <Link href={`/torneos/${t.slug}`}>{t.name}</Link>
                    </td>
                    <td className="text-humo">{t.mode}</td>
                    <td className="num cifra">{t._count.registrations}</td>
                    <td className="num cifra text-humo">{fechaCL(t.endsAt)}</td>
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
