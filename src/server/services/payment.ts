import { randomUUID } from 'node:crypto'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { registrar } from './audit'
import { promoverListaEspera } from './registration'

/**
 * Webpay Plus. El estado del pago vive desacoplado de la inscripción:
 * la confirmación llega SIEMPRE por webhook servidor-a-servidor, nunca por
 * el redirect del navegador (§2.7).
 */

export interface IniciarPago {
  userId: string
  tournamentId: string
  returnUrl: string
}

export interface TransaccionWebpay {
  crear(buyOrder: string, sessionId: string, monto: number, returnUrl: string): Promise<{ token: string; url: string }>
  confirmar(token: string): Promise<RespuestaWebpay>
  anular(token: string, monto: number): Promise<unknown>
}

export interface RespuestaWebpay {
  buy_order: string
  session_id: string
  amount: number
  status: string
  response_code: number
  authorization_code?: string
}

export async function iniciarPago(datos: IniciarPago, tbk: TransaccionWebpay, db: Db = prisma) {
  const torneo = await db.tournament.findUnique({ where: { id: datos.tournamentId } })
  if (!torneo || torneo.deletedAt) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
  if (torneo.entryFeeClp <= 0) throw new ErrorClutch('CONFLICTO', 'Este torneo es gratis.')

  const inscripcion = await db.registration.findUnique({
    where: { tournamentId_userId: { tournamentId: datos.tournamentId, userId: datos.userId } },
  })
  if (!inscripcion) throw new ErrorClutch('CONFLICTO', 'Primero inscríbete en el torneo.')
  if (inscripcion.status === 'CONFIRMADA' || inscripcion.status === 'CHECKED_IN') {
    throw new ErrorClutch('CONFLICTO', 'Tu inscripción ya está pagada.')
  }

  const buyOrder = `CL-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`.toUpperCase()
  const sessionId = randomUUID()

  const pago = await db.payment.create({
    data: {
      userId: datos.userId,
      tournamentId: datos.tournamentId,
      amountClp: torneo.entryFeeClp,
      buyOrder,
      sessionId,
      status: 'INICIADO',
    },
  })

  const { token, url } = await tbk.crear(buyOrder, sessionId, torneo.entryFeeClp, datos.returnUrl)
  await db.payment.update({ where: { id: pago.id }, data: { token } })
  await registrar(
    {
      actorId: datos.userId,
      action: 'pago.iniciar',
      entityType: 'Payment',
      entityId: pago.id,
      metadata: { buyOrder, monto: torneo.entryFeeClp },
    },
    db,
  )
  return { paymentId: pago.id, token, url }
}

/**
 * Confirmación idempotente: Transbank reintenta. La segunda pasada por el
 * mismo token no vuelve a confirmar nada.
 */
export async function confirmarPago(token: string, tbk: TransaccionWebpay, db: Db = prisma) {
  const pago = await db.payment.findUnique({ where: { token } })
  if (!pago) throw new ErrorClutch('NO_ENCONTRADO', 'No encontramos ese pago.')
  if (pago.status === 'AUTORIZADO') return pago

  const ya = await db.webhookEvent.findUnique({
    where: { provider_externalId: { provider: 'transbank', externalId: token } },
  })
  if (ya?.processedAt) return pago

  const respuesta = await tbk.confirmar(token)
  const autorizado = respuesta.response_code === 0 && respuesta.status === 'AUTHORIZED'

  await db.webhookEvent.upsert({
    where: { provider_externalId: { provider: 'transbank', externalId: token } },
    create: { provider: 'transbank', externalId: token, payload: respuesta as object, processedAt: new Date() },
    update: { payload: respuesta as object, processedAt: new Date() },
  })

  const actualizado = await db.payment.update({
    where: { id: pago.id },
    data: {
      status: autorizado ? 'AUTORIZADO' : 'RECHAZADO',
      responseCode: respuesta.response_code,
      authorizationCode: respuesta.authorization_code ?? null,
      rawPayload: respuesta as object,
    },
  })

  if (autorizado) {
    const inscripcion = await db.registration.findUnique({
      where: { tournamentId_userId: { tournamentId: pago.tournamentId, userId: pago.userId } },
    })
    if (inscripcion) {
      await db.registration.update({
        where: { id: inscripcion.id },
        data: { status: 'CONFIRMADA', paymentId: pago.id },
      })
    }
  }

  await registrar(
    {
      actorId: pago.userId,
      action: autorizado ? 'pago.autorizar' : 'pago.rechazar',
      entityType: 'Payment',
      entityId: pago.id,
      metadata: { buyOrder: pago.buyOrder, responseCode: respuesta.response_code },
    },
    db,
  )
  return actualizado
}

/**
 * Cancelación por cupo mínimo no alcanzado: reembolso masivo desde la cola.
 */
export async function reembolsarTorneo(
  tournamentId: string,
  tbk: TransaccionWebpay,
  adminId: string,
  db: Db = prisma,
): Promise<number> {
  const pagos = await db.payment.findMany({ where: { tournamentId, status: 'AUTORIZADO' } })

  let devueltos = 0
  for (const pago of pagos) {
    if (!pago.token) continue
    try {
      await tbk.anular(pago.token, pago.amountClp)
      await db.payment.update({
        where: { id: pago.id },
        data: { status: 'REEMBOLSADO', refundedAt: new Date() },
      })
      await registrar(
        {
          actorId: adminId,
          action: 'pago.reembolsar',
          entityType: 'Payment',
          entityId: pago.id,
          metadata: { buyOrder: pago.buyOrder, monto: pago.amountClp },
          publico: true,
        },
        db,
      )
      devueltos += 1
    } catch (e) {
      await registrar(
        {
          actorId: adminId,
          action: 'pago.reembolso_fallido',
          entityType: 'Payment',
          entityId: pago.id,
          metadata: { error: e instanceof Error ? e.message : String(e) },
        },
        db,
      )
    }
  }
  await promoverListaEspera(tournamentId, db)
  return devueltos
}
