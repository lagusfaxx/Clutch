import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Health check real: verifica Postgres, no solo que el proceso esté vivo. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: 'arriba', background: process.env.RUN_BACKGROUND === 'true' })
  } catch {
    return NextResponse.json({ ok: false, db: 'caida' }, { status: 503 })
  }
}
