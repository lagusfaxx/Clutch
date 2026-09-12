import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { inventario } from '@/server/services/prize'
import { fechaCL } from '@/lib/fechas'
import { BotonAsignarPremios } from '@/components/AdminControles'
import { FormularioCodigos, FormularioEnvio } from '@/components/AdminPremios'

export const dynamic = 'force-dynamic'

export default async function AdminPremiosPage() {
  const [inv, reclamos, cerrados] = await Promise.all([
    inventario(),
    prisma.prizeClaim.findMany({
      where: { status: { in: ['PENDIENTE_DATOS', 'PENDIENTE_ENVIO', 'ENVIADO'] } },
      include: {
        user: { select: { displayName: true, slug: true } },
        prize: { include: { tournament: { select: { name: true, slug: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.tournament.findMany({
      where: { status: 'CERRADO', deletedAt: null },
      orderBy: { endsAt: 'desc' },
      take: 10,
      include: { prizes: true },
    }),
  ])

  return (
    <div className="space-y-6">
      <section className="grid gap-px bg-linea lg:grid-cols-2">
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Cargar códigos V-Bucks</h2>
          <p className="mb-3 max-w-[60ch] text-[12px] text-humo">
            Se cifran con AES-256 al guardarlos y solo se descifran al mostrárselos al ganador, una sola vez. Compra
            siempre a distribuidores autorizados: los marketplaces grises venden códigos que Epic revoca.
          </p>
          <FormularioCodigos />
        </div>
        <div className="bg-panel p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Inventario</h2>
          <table className="tabla">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Estado</th>
                <th className="num">Valor</th>
                <th className="num">Cantidad</th>
              </tr>
            </thead>
            <tbody>
              {inv.codigos.map((c) => (
                <tr key={`${c.status}-${c.type}-${c.faceValue}`}>
                  <td>{c.type}</td>
                  <td className="text-humo">{c.status.toLowerCase()}</td>
                  <td className="num cifra">{c.faceValue}</td>
                  <td className="num cifra text-cal">{c._count._all}</td>
                </tr>
              ))}
              {inv.hardware.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td className="text-humo">stock</td>
                  <td className="num cifra">—</td>
                  <td className={`num cifra ${h.stock === 0 ? 'text-alerta' : 'text-cal'}`}>{h.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">Torneos cerrados sin premiar</h2>
        <table className="tabla">
          <tbody>
            {cerrados.map((t) => (
              <tr key={t.id}>
                <td className="font-medium">
                  <Link href={`/torneos/${t.slug}`}>{t.name}</Link>
                </td>
                <td className="num cifra text-humo">{fechaCL(t.endsAt)}</td>
                <td className="text-humo">{t.prizes.length} premio(s) configurado(s)</td>
                <td>{t.prizes.length > 0 && <BotonAsignarPremios torneoId={t.id} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bloque p-5">
        <h2 className="mb-3 text-[13px] font-semibold text-humo">Entregas pendientes</h2>
        {reclamos.length === 0 ? (
          <p className="text-[13px] text-humo">Nada pendiente.</p>
        ) : (
          <table className="tabla">
            <thead>
              <tr>
                <th>Ganador</th>
                <th>Premio</th>
                <th>Torneo</th>
                <th>Estado</th>
                <th>Despacho</th>
              </tr>
            </thead>
            <tbody>
              {reclamos.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">
                    <Link href={`/j/${c.user.slug}`}>{c.user.displayName}</Link>
                  </td>
                  <td>{c.prize.description}</td>
                  <td className="text-humo">{c.prize.tournament.name}</td>
                  <td className="text-[12px] text-cal">{c.status.replace(/_/g, ' ').toLowerCase()}</td>
                  <td>
                    {c.status === 'PENDIENTE_ENVIO' ? (
                      <FormularioEnvio claimId={c.id} />
                    ) : (
                      <span className="text-[12px] text-humo">{c.trackingCode ?? '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
