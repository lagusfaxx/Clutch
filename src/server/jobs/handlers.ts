import type PgBoss from 'pg-boss'
import { prisma } from '@/lib/prisma'
import { TRABAJOS } from './nombres'
import { cerrarCheckIn, promoverListaEspera } from '../services/registration'
import { aplicarTorneoAlRanking, aplicarDecayGlobal } from '../services/ranking'
import { capturarTorneo } from '../services/fortnite/snapshot'
import { reconciliarTorneo } from '../services/fortnite/reconcile'
import { limpiarVencidos } from '../services/fortnite/cache'
import { archivarAntiguas } from '../services/message'
import { reembolsarTorneo } from '../services/payment'
import { webpay } from '../services/webpay'
import { registrar } from '../services/audit'

type Datos = Record<string, unknown>

/**
 * discord.js se carga en tiempo de ejecución y solo dentro del worker: si se
 * importa arriba, el bundler de Next se lo lleva a cada Server Action que
 * toque la cola, y arrastra dependencias nativas que no existen en el build.
 */
const discord = () => import('../discord/anuncios')

function idTorneo(datos: Datos): string {
  const id = datos.tournamentId
  if (typeof id !== 'string') throw new Error('El trabajo no trae tournamentId.')
  return id
}

/**
 * Todos los handlers son idempotentes (§5): si un job corre dos veces,
 * el resultado tiene que ser el mismo.
 */
export async function registrarTrabajos(b: PgBoss): Promise<void> {
  const trabajar = async (nombre: string, fn: (datos: Datos) => Promise<void>) => {
    await b.work<Datos>(nombre, async (jobs) => {
      for (const job of jobs) {
        try {
          await fn(job.data)
        } catch (e) {
          console.error(`[cola] ${nombre} falló`, e)
          throw e
        }
      }
    })
  }

  await trabajar(TRABAJOS.recordarCheckIn, async (d) => {
    await (await discord()).dmCheckIn(idTorneo(d))
  })

  await trabajar(TRABAJOS.cerrarCheckIn, async (d) => {
    const torneoId = idTorneo(d)
    const noShows = await cerrarCheckIn(torneoId)
    await prisma.tournament
      .update({ where: { id: torneoId }, data: { status: 'EN_CURSO' } })
      .catch(() => undefined)
    await registrar({
      action: 'torneo.checkin_cerrado',
      entityType: 'Tournament',
      entityId: torneoId,
      metadata: { noShows },
      publico: true,
    })
  })

  await trabajar(TRABAJOS.snapshotPre, async (d) => {
    await capturarTorneo(idTorneo(d), 'PRE')
  })

  await trabajar(TRABAJOS.snapshotPost, async (d) => {
    await capturarTorneo(idTorneo(d), 'POST')
  })

  await trabajar(TRABAJOS.reconciliar, async (d) => {
    await reconciliarTorneo(idTorneo(d))
  })

  await trabajar(TRABAJOS.cerrarTorneo, async (d) => {
    const torneoId = idTorneo(d)
    const torneo = await prisma.tournament.findUnique({ where: { id: torneoId } })
    if (!torneo || torneo.status === 'CERRADO' || torneo.status === 'CANCELADO') return

    const inscritos = await prisma.registration.count({
      where: { tournamentId: torneoId, deletedAt: null, status: { in: ['CONFIRMADA', 'CHECKED_IN'] } },
    })
    // Cupo mínimo no alcanzado: se cancela y se reembolsa (§2.7).
    if (torneo.minSlots > 0 && inscritos < torneo.minSlots) {
      await prisma.tournament.update({ where: { id: torneoId }, data: { status: 'CANCELADO' } })
      if (torneo.entryFeeClp > 0) {
        await b.send(TRABAJOS.reembolsarTorneo, { tournamentId: torneoId })
      }
      return
    }

    const enDisputa = await prisma.dispute.count({
      where: { tournamentId: torneoId, status: { in: ['ABIERTA', 'EN_REVISION'] } },
    })
    await prisma.tournament.update({
      where: { id: torneoId },
      data: { status: enDisputa > 0 ? 'EN_DISPUTA' : 'CERRADO' },
    })
    if (enDisputa === 0) {
      await b.send(TRABAJOS.aplicarRanking, { tournamentId: torneoId })
      await b.send(TRABAJOS.publicarResultados, { tournamentId: torneoId })
    }
  })

  await trabajar(TRABAJOS.aplicarRanking, async (d) => {
    await aplicarTorneoAlRanking(idTorneo(d))
    await b.send(TRABAJOS.sincronizarRoles, {})
  })

  await trabajar(TRABAJOS.decayRanking, async () => {
    await aplicarDecayGlobal()
  })

  await trabajar(TRABAJOS.limpiarCache, async () => {
    await limpiarVencidos()
  })

  await trabajar(TRABAJOS.archivarMensajes, async () => {
    await archivarAntiguas()
  })

  await trabajar(TRABAJOS.reembolsarTorneo, async (d) => {
    const torneoId = idTorneo(d)
    const tbk = await webpay()
    await reembolsarTorneo(torneoId, tbk, 'sistema')
    await promoverListaEspera(torneoId)
  })

  await trabajar(TRABAJOS.anunciarDiscord, async (d) => {
    await (await discord()).anunciarTorneo(idTorneo(d))
  })

  await trabajar(TRABAJOS.publicarResultados, async (d) => {
    await (await discord()).publicarResultados(idTorneo(d))
  })

  await trabajar(TRABAJOS.sincronizarRoles, async () => {
    await (await discord()).sincronizarRoles()
  })

  // Mantención diaria.
  await b.schedule(TRABAJOS.decayRanking, '15 5 * * *', {}, { tz: 'America/Santiago' })
  await b.schedule(TRABAJOS.limpiarCache, '0 * * * *', {}, { tz: 'America/Santiago' })
  await b.schedule(TRABAJOS.archivarMensajes, '30 4 * * *', {}, { tz: 'America/Santiago' })
}

/**
 * Agenda los trabajos de un torneo. Se llama al publicarlo y es idempotente:
 * pg-boss deduplica por singletonKey.
 */
export async function agendarTorneo(
  b: PgBoss,
  torneo: { id: string; startsAt: Date; endsAt: Date; checkInOpensAt: Date },
): Promise<void> {
  const enviar = async (nombre: string, cuando: Date, sufijo: string) => {
    await b.send(
      nombre,
      { tournamentId: torneo.id },
      { startAfter: cuando, singletonKey: `${nombre}:${torneo.id}:${sufijo}` },
    )
  }

  const aviso = new Date(torneo.checkInOpensAt.getTime() - 15 * 60_000)
  await enviar(TRABAJOS.recordarCheckIn, aviso, 'aviso')
  await enviar(TRABAJOS.snapshotPre, torneo.checkInOpensAt, 'pre')
  await enviar(TRABAJOS.cerrarCheckIn, torneo.startsAt, 'cierre')
  await enviar(TRABAJOS.snapshotPost, new Date(torneo.endsAt.getTime() + 5 * 60_000), 'post')
  await enviar(TRABAJOS.reconciliar, new Date(torneo.endsAt.getTime() + 10 * 60_000), 'rec')
  await enviar(TRABAJOS.cerrarTorneo, new Date(torneo.endsAt.getTime() + 45 * 60_000), 'cierre')
}
