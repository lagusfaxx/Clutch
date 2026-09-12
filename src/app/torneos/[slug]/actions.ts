'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { inscribir, cancelarInscripcion, hacerCheckIn } from '@/server/services/registration'
import { reportarResultado } from '@/server/services/result'
import { abrirDisputa } from '@/server/services/dispute'
import { prisma } from '@/lib/prisma'
import { esErrorClutch } from '@/lib/errores'
import { limitar, LIMITES } from '@/lib/rateLimit'
import { usuarioActual } from '@/server/auth'

/**
 * Server Actions: cáscara fina (§1). Sesión, rate limit y revalidación.
 * Toda la lógica vive en src/server/services/*, que no importa nada de Next.
 */
type Respuesta = { ok: true } | { ok: false; mensaje: string }

async function ejecutar(fn: (userId: string) => Promise<unknown>, ruta: string): Promise<Respuesta> {
  const usuario = await usuarioActual()
  if (!usuario) return { ok: false, mensaje: 'Tienes que iniciar sesión.' }
  try {
    await fn(usuario.id)
    revalidatePath(ruta)
    return { ok: true }
  } catch (e) {
    if (esErrorClutch(e)) return { ok: false, mensaje: e.message }
    console.error('[accion] error', e)
    return { ok: false, mensaje: 'Se cayó algo de nuestro lado. Inténtalo de nuevo.' }
  }
}

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
}

export async function accionInscribir(torneoId: string, slug: string, teamId?: string): Promise<Respuesta> {
  return ejecutar(async (userId) => {
    limitar(LIMITES.inscripcion!, userId)
    await inscribir(torneoId, userId, { teamId, ip: await ip() })
  }, `/torneos/${slug}`)
}

export async function accionCancelar(torneoId: string, slug: string): Promise<Respuesta> {
  return ejecutar(async (userId) => {
    const inscripcion = await prisma.registration.findUnique({
      where: { tournamentId_userId: { tournamentId: torneoId, userId } },
    })
    if (inscripcion) await cancelarInscripcion(inscripcion.id, userId)
  }, `/torneos/${slug}`)
}

export async function accionCheckIn(torneoId: string, slug: string): Promise<Respuesta> {
  return ejecutar(async (userId) => {
    const inscripcion = await prisma.registration.findUnique({
      where: { tournamentId_userId: { tournamentId: torneoId, userId } },
    })
    if (inscripcion) await hacerCheckIn(inscripcion.id, userId)
  }, `/torneos/${slug}`)
}

export async function accionReportar(slug: string, formulario: FormData): Promise<Respuesta> {
  return ejecutar(async (userId) => {
    limitar(LIMITES.reporte!, userId)
    await reportarResultado(
      {
        matchId: String(formulario.get('matchId') ?? ''),
        placement: Number(formulario.get('placement') ?? 0),
        eliminations: Number(formulario.get('eliminations') ?? 0),
        evidenceUrl: String(formulario.get('evidenceUrl') ?? '') || undefined,
      },
      userId,
      prisma,
      { ip: await ip() },
    )
  }, `/torneos/${slug}`)
}

export async function accionImpugnar(slug: string, formulario: FormData): Promise<Respuesta> {
  return ejecutar(async (userId) => {
    await abrirDisputa(
      {
        tournamentId: String(formulario.get('tournamentId') ?? ''),
        matchResultId: String(formulario.get('matchResultId') ?? '') || undefined,
        reason: String(formulario.get('reason') ?? ''),
        evidenceUrl: String(formulario.get('evidenceUrl') ?? ''),
      },
      userId,
    )
  }, `/torneos/${slug}`)
}
