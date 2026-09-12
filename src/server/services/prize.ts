import { z } from 'zod'
import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'
import { ErrorClutch } from '@/lib/errores'
import { cifrar, descifrar } from '@/lib/crypto'
import { registrar } from './audit'
import { esMenor, rutValido, normalizarRut } from './user'
import { tablaTorneo } from './tournament'

export const esquemaEnvio = z.object({
  rut: z.string().min(8),
  shipName: z.string().min(3).max(120),
  shipAddress: z.string().min(5).max(200),
  shipComuna: z.string().min(2).max(80),
  shipRegion: z.string().min(2).max(80),
  shipPhone: z.string().min(8).max(20),
})

/** Carga de códigos. Se cifran al entrar y nunca vuelven en claro salvo el reveal. */
export async function cargarCodigos(
  codigos: string[],
  tipo: 'VBUCKS' | 'HARDWARE',
  faceValue: number,
  adminId: string,
  batchRef: string | null,
  db: Db = prisma,
): Promise<number> {
  const creados = await db.prizeCode.createMany({
    data: codigos.map((c) => ({
      type: tipo,
      faceValue,
      encryptedCode: cifrar(c.trim()),
      batchRef,
      status: 'DISPONIBLE' as const,
    })),
  })
  await registrar(
    {
      actorId: adminId,
      action: 'premio.cargar_codigos',
      entityType: 'PrizeCode',
      entityId: batchRef ?? 'lote',
      metadata: { cantidad: creados.count, tipo, faceValue },
    },
    db,
  )
  return creados.count
}

/**
 * Asigna premios según la tabla final. No corre si el torneo está EN_DISPUTA:
 * la disputa bloquea el pago hasta la resolución (§2.3).
 */
export async function asignarPremios(tournamentId: string, adminId: string, db: Db = prisma): Promise<number> {
  const torneo = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: { prizes: { orderBy: { placement: 'asc' } } },
  })
  if (!torneo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese torneo no existe.')
  if (torneo.status === 'EN_DISPUTA') {
    throw new ErrorClutch('CONFLICTO', 'Hay disputas abiertas. Los premios se entregan cuando se resuelvan.')
  }
  if (torneo.status !== 'CERRADO') {
    throw new ErrorClutch('CONFLICTO', 'El torneo tiene que estar cerrado para asignar premios.')
  }

  const tabla = await tablaTorneo(tournamentId, db)
  let asignados = 0

  for (const premio of torneo.prizes) {
    const ganador = tabla.find((f) => f.posicion === premio.placement)
    if (!ganador) continue

    const existente = await db.prizeClaim.findUnique({
      where: { prizeId_userId: { prizeId: premio.id, userId: ganador.userId } },
    })
    if (existente) continue

    const reclamo = await db.prizeClaim.create({
      data: {
        prizeId: premio.id,
        userId: ganador.userId,
        status: premio.type === 'VBUCKS' ? 'PENDIENTE_DATOS' : 'PENDIENTE_DATOS',
      },
    })

    if (premio.type === 'VBUCKS') {
      const codigo = await db.prizeCode.findFirst({
        where: { status: 'DISPONIBLE', type: 'VBUCKS', faceValue: premio.faceValue },
      })
      if (codigo) {
        await db.prizeCode.update({
          where: { id: codigo.id },
          data: { status: 'ASIGNADO', claimId: reclamo.id },
        })
      }
    } else if (premio.hardwareSku) {
      await db.hardwareItem
        .update({ where: { sku: premio.hardwareSku }, data: { stock: { decrement: 1 } } })
        .catch(() => undefined)
    }

    await registrar(
      {
        actorId: adminId,
        action: 'premio.asignar',
        entityType: 'PrizeClaim',
        entityId: reclamo.id,
        metadata: { tournamentId, placement: premio.placement, userId: ganador.userId },
        publico: true,
      },
      db,
    )
    asignados += 1
  }
  return asignados
}

/**
 * Reveal: el código se muestra UNA sola vez, con confirmación explícita.
 * Después queda ENTREGADO y ya no se vuelve a mostrar. Si el jugador lo
 * pierde es soporte manual, y así debe ser (§2.6).
 */
export async function revelarCodigo(
  claimId: string,
  userId: string,
  ip: string | null,
  db: Db = prisma,
): Promise<string> {
  const reclamo = await db.prizeClaim.findUnique({
    where: { id: claimId },
    include: { code: true, prize: { include: { tournament: true } } },
  })
  if (!reclamo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese premio no existe.')
  if (reclamo.userId !== userId) throw new ErrorClutch('PROHIBIDO', 'Ese premio no es tuyo.')
  if (!reclamo.code?.encryptedCode) {
    throw new ErrorClutch('CONFLICTO', 'Todavía no hay un código asignado. Escríbenos y lo resolvemos.')
  }
  if (reclamo.code.status === 'ENTREGADO') {
    throw new ErrorClutch('CONFLICTO', 'Ese código ya se mostró una vez. Si lo perdiste, abre un ticket de soporte.')
  }
  if (reclamo.prize.tournament.status === 'EN_DISPUTA') {
    throw new ErrorClutch('CONFLICTO', 'El torneo tiene disputas abiertas. El premio se libera al resolverlas.')
  }

  const usuario = await db.user.findUnique({ where: { id: userId } })
  if (!usuario?.rut) throw new ErrorClutch('VALIDACION', 'Necesitamos tu RUT para dejar registro de la entrega.')
  if (esMenor(usuario.birthDate) && !usuario.guardianEmail) {
    throw new ErrorClutch('VALIDACION', 'Eres menor de 18: necesitamos el email de tu apoderado.')
  }

  const codigo = descifrar(reclamo.code.encryptedCode)
  const ahora = new Date()

  await db.prizeCode.update({
    where: { id: reclamo.code.id },
    data: { status: 'ENTREGADO', revealedAt: ahora },
  })
  await db.prizeClaim.update({ where: { id: claimId }, data: { status: 'REVELADO', revealedAt: ahora } })

  // El código nunca entra al log de auditoría, solo su identificador.
  await registrar(
    {
      actorId: userId,
      action: 'premio.revelar',
      entityType: 'PrizeCode',
      entityId: reclamo.code.id,
      metadata: { claimId, faceValue: reclamo.code.faceValue },
      ip,
    },
    db,
  )
  return codigo
}

/** Flujo de premio físico: datos de despacho, luego envío y tracking (§2.6). */
export async function registrarDatosEnvio(
  claimId: string,
  userId: string,
  datos: z.infer<typeof esquemaEnvio>,
  db: Db = prisma,
) {
  const d = esquemaEnvio.parse(datos)
  if (!rutValido(d.rut)) throw new ErrorClutch('VALIDACION', 'Ese RUT no es válido.')

  const reclamo = await db.prizeClaim.findUnique({ where: { id: claimId } })
  if (!reclamo) throw new ErrorClutch('NO_ENCONTRADO', 'Ese premio no existe.')
  if (reclamo.userId !== userId) throw new ErrorClutch('PROHIBIDO', 'Ese premio no es tuyo.')

  const actualizado = await db.prizeClaim.update({
    where: { id: claimId },
    data: { ...d, rut: normalizarRut(d.rut), status: 'PENDIENTE_ENVIO' },
  })
  await registrar(
    { actorId: userId, action: 'premio.datos_envio', entityType: 'PrizeClaim', entityId: claimId },
    db,
  )
  return actualizado
}

export async function marcarEnviado(claimId: string, tracking: string, adminId: string, db: Db = prisma) {
  const actualizado = await db.prizeClaim.update({
    where: { id: claimId },
    data: { status: 'ENVIADO', trackingCode: tracking },
  })
  await registrar(
    {
      actorId: adminId,
      action: 'premio.enviar',
      entityType: 'PrizeClaim',
      entityId: claimId,
      metadata: { tracking },
    },
    db,
  )
  return actualizado
}

export async function inventario(db: Db = prisma) {
  const [codigos, hardware] = await Promise.all([
    db.prizeCode.groupBy({ by: ['status', 'type', 'faceValue'], _count: { _all: true } }),
    db.hardwareItem.findMany({ orderBy: { name: 'asc' } }),
  ])
  return { codigos, hardware }
}
