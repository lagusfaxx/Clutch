import type { Db } from '@/lib/prisma'
import { prisma } from '@/lib/prisma'

export interface EntradaAuditoria {
  actorId?: string | null
  action: string
  entityType: string
  entityId: string
  metadata?: Record<string, unknown>
  ip?: string | null
  /** Visible en la página pública del torneo. La transparencia es el producto. */
  publico?: boolean
}

/**
 * Toda mutación de ranking, premio, ban o resultado pasa por acá (§3).
 * Nunca se escriben códigos de premio ni tokens en metadata.
 */
export async function registrar(entrada: EntradaAuditoria, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: entrada.actorId ?? null,
      action: entrada.action,
      entityType: entrada.entityType,
      entityId: entrada.entityId,
      metadata: (entrada.metadata ?? {}) as object,
      ip: entrada.ip ?? null,
      publico: entrada.publico ?? false,
    },
  })
}

export async function bitacoraPublica(entityType: string, entityId: string, db: Db = prisma) {
  return db.auditLog.findMany({
    where: { entityType, entityId, publico: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
}
