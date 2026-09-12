import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { fechaCL } from '@/lib/fechas'
import { BotonPublicar } from '@/components/AdminControles'
import { FormularioTorneo, FormularioClonar } from '@/components/AdminTorneos'

export const dynamic = 'force-dynamic'

export default async function AdminTorneosPage() {
  const [torneos, temporadas] = await Promise.all([
    prisma.tournament.findMany({
      where: { deletedAt: null },
      orderBy: { startsAt: 'desc' },
      take: 40,
      include: { _count: { select: { registrations: true } } },
    }),
    prisma.season.findMany({ where: { closedAt: null }, orderBy: { startsAt: 'desc' } }),
  ])

  return (
    <div className="space-y-6">
      <section className="grid gap-px bg-linea lg:grid-cols-[1.3fr_1fr]">
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Nuevo torneo</h2>
          <FormularioTorneo temporadas={temporadas.map((t) => ({ id: t.id, name: t.name }))} />
        </div>
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Clonar</h2>
          <p className="mb-3 text-[12px] text-humo">
            Un semanal recurrente no se configura 52 veces. Clona el anterior y corre las fechas.
          </p>
          <FormularioClonar
            torneos={torneos.slice(0, 20).map((t) => ({ id: t.id, name: t.name, slug: t.slug }))}
          />
        </div>
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">Torneos</h2>
        <table className="tabla">
          <thead>
            <tr>
              <th>Torneo</th>
              <th>Estado</th>
              <th>Modo</th>
              <th className="num">Inscritos</th>
              <th className="num">Parte</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {torneos.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">
                  <Link href={`/torneos/${t.slug}`}>{t.name}</Link>
                </td>
                <td className="text-[12px] text-cal">{t.status.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="text-humo">{t.mode}</td>
                <td className="num cifra">
                  {t._count.registrations}/{t.maxSlots}
                </td>
                <td className="num cifra text-humo">{fechaCL(t.startsAt)}</td>
                <td>{t.status === 'DRAFT' && <BotonPublicar torneoId={t.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
