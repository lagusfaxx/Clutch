'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { esErrorClutch, ErrorClutch } from '@/lib/errores'
import { crearTorneo, clonarTorneo, cambiarEstado } from '@/server/services/tournament'
import { verificarResultado } from '@/server/services/result'
import { resolverDisputa } from '@/server/services/dispute'
import { asignarPremios, cargarCodigos, marcarEnviado } from '@/server/services/prize'
import { cerrarTemporada } from '@/server/services/ranking'
import { banear } from '@/server/services/user'
import { usuarioActual } from '@/server/auth'
import { encolar } from '@/server/jobs/boss'
import { TRABAJOS } from '@/server/jobs/nombres'

type Respuesta = { ok: true; mensaje?: string } | { ok: false; mensaje: string }

async function comoAdmin(fn: (adminId: string) => Promise<string | void>, ruta = '/admin'): Promise<Respuesta> {
  try {
    const usuario = await usuarioActual()
    if (!usuario) throw new ErrorClutch('NO_AUTORIZADO', 'Tienes que iniciar sesión.')
    if (!usuario.isAdmin) throw new ErrorClutch('PROHIBIDO', 'No tienes permisos de administración.')

    const mensaje = await fn(usuario.id)
    revalidatePath(ruta)
    return { ok: true, mensaje: mensaje ?? undefined }
  } catch (e) {
    if (esErrorClutch(e)) return { ok: false, mensaje: e.message }
    console.error('[admin] error', e)
    return { ok: false, mensaje: 'Se cayó algo de nuestro lado.' }
  }
}

export async function accionCrearTorneo(formulario: FormData): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    const torneo = await crearTorneo(
      {
        name: String(formulario.get('name') ?? ''),
        mode: String(formulario.get('mode') ?? 'SOLO') as 'SOLO' | 'DUO' | 'SQUAD',
        startsAt: new Date(String(formulario.get('startsAt') ?? '')),
        endsAt: new Date(String(formulario.get('endsAt') ?? '')),
        maxSlots: Number(formulario.get('maxSlots') ?? 0),
        minSlots: Number(formulario.get('minSlots') ?? 0),
        entryFeeClp: Number(formulario.get('entryFeeClp') ?? 0),
        matchesTotal: Number(formulario.get('matchesTotal') ?? 8),
        matchesCounted: Number(formulario.get('matchesCounted') ?? 6),
        serverRegion: String(formulario.get('serverRegion') ?? 'BR'),
        seasonId: String(formulario.get('seasonId') ?? '') || undefined,
      } as never,
      adminId,
    )
    return `Torneo creado: ${torneo.slug}`
  }, '/admin/torneos')
}

export async function accionClonarTorneo(formulario: FormData): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    const torneo = await clonarTorneo(
      String(formulario.get('tournamentId') ?? ''),
      {
        startsAt: new Date(String(formulario.get('startsAt') ?? '')),
        endsAt: new Date(String(formulario.get('endsAt') ?? '')),
        name: String(formulario.get('name') ?? '') || undefined,
      },
      adminId,
    )
    return `Clonado como ${torneo.slug}`
  }, '/admin/torneos')
}

export async function accionPublicarTorneo(torneoId: string): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    await cambiarEstado(torneoId, 'PUBLICADO', adminId)
    await cambiarEstado(torneoId, 'INSCRIPCION_ABIERTA', adminId)

    const torneo = await prisma.tournament.findUnique({ where: { id: torneoId } })
    if (torneo) {
      const { agendarTorneo } = await import('@/server/jobs/handlers')
      const { boss } = await import('@/server/jobs/boss')
      await agendarTorneo(await boss(), torneo)
      await encolar(TRABAJOS.anunciarDiscord, { tournamentId: torneoId })
    }
    return 'Inscripciones abiertas y torneo agendado.'
  }, '/admin/torneos')
}

export async function accionResolverResultado(
  resultadoId: string,
  decision: 'VERIFICADO' | 'RECHAZADO',
  nota: string,
): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    await verificarResultado(resultadoId, adminId, decision, nota || null)
    return 'Resultado resuelto.'
  })
}

export async function accionResolverDisputa(formulario: FormData): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    await resolverDisputa(
      String(formulario.get('disputaId') ?? ''),
      adminId,
      String(formulario.get('decision') ?? 'RESUELTA') as 'RESUELTA' | 'DESESTIMADA',
      String(formulario.get('resolucion') ?? ''),
    )
    return 'Disputa resuelta. Queda en la bitácora pública del torneo.'
  })
}

export async function accionAsignarPremios(torneoId: string): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    const cantidad = await asignarPremios(torneoId, adminId)
    return `${cantidad} premio(s) asignado(s).`
  }, '/admin/premios')
}

export async function accionCargarCodigos(formulario: FormData): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    const codigos = String(formulario.get('codigos') ?? '')
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean)
    if (codigos.length === 0) throw new ErrorClutch('VALIDACION', 'Pega al menos un código, uno por línea.')

    const cantidad = await cargarCodigos(
      codigos,
      'VBUCKS',
      Number(formulario.get('faceValue') ?? 0),
      adminId,
      String(formulario.get('batchRef') ?? '') || null,
    )
    return `${cantidad} código(s) cargado(s) y cifrado(s).`
  }, '/admin/premios')
}

export async function accionMarcarEnviado(formulario: FormData): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    await marcarEnviado(
      String(formulario.get('claimId') ?? ''),
      String(formulario.get('tracking') ?? ''),
      adminId,
    )
    return 'Marcado como enviado.'
  }, '/admin/premios')
}

export async function accionCerrarTemporada(seasonId: string): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    const jugadores = await cerrarTemporada(seasonId, adminId)
    return `Temporada cerrada. ${jugadores} jugador(es) archivado(s).`
  })
}

export async function accionBanear(formulario: FormData): Promise<Respuesta> {
  return comoAdmin(async (adminId) => {
    const dias = Number(formulario.get('dias') ?? 0)
    await banear(
      { userId: String(formulario.get('userId') ?? '') },
      String(formulario.get('motivo') ?? 'Sin motivo declarado'),
      adminId,
      dias > 0 ? new Date(Date.now() + dias * 86_400_000) : null,
    )
    return 'Cuenta suspendida.'
  })
}
