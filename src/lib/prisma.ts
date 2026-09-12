import { PrismaClient } from '@prisma/client'

const global_ = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  global_.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') global_.prisma = prisma

/** Tipo estructural: sirve tanto el cliente como una transacción. */
export type Db = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>
