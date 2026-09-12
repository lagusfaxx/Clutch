import { ChannelType, type TextChannel } from 'discord.js'
import { prisma } from '@/lib/prisma'
import { fechaCL } from '@/lib/fechas'
import { tablaTorneo } from '../services/tournament'
import { tablaPublica } from '../services/ranking'
import { bot } from './bot'

const sitio = () => process.env.SITE_URL ?? 'https://clutch.cl'

async function canalTorneos(): Promise<TextChannel | null> {
  const cliente = bot()
  const canalId = process.env.DISCORD_CANAL_TORNEOS
  if (!cliente || !canalId) return null
  const canal = await cliente.channels.fetch(canalId).catch(() => null)
  if (!canal || canal.type !== ChannelType.GuildText) return null
  return canal
}

/** Anuncio de apertura de inscripciones con link de registro (§2.9). */
export async function anunciarTorneo(tournamentId: string): Promise<void> {
  const canal = await canalTorneos()
  const torneo = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!canal || !torneo) return

  await canal.send({
    content: [
      `**${torneo.name}** — inscripciones abiertas`,
      `${torneo.mode} · ${torneo.maxSlots} cupos · servidor ${torneo.serverRegion}`,
      `Parte ${fechaCL(torneo.startsAt)} (hora de Chile). Check-in abre ${fechaCL(torneo.checkInOpensAt)}.`,
      `${sitio()}/torneos/${torneo.slug}`,
    ].join('\n'),
  })
}

/** Recordatorio de check-in por DM, 45 min antes del inicio. */
export async function dmCheckIn(tournamentId: string): Promise<number> {
  const cliente = bot()
  const torneo = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!cliente || !torneo) return 0

  const inscritos = await prisma.registration.findMany({
    where: { tournamentId, deletedAt: null, status: 'CONFIRMADA' },
    include: { user: { select: { discordId: true } } },
  })

  let enviados = 0
  for (const reg of inscritos) {
    const usuario = await cliente.users.fetch(reg.user.discordId).catch(() => null)
    if (!usuario) continue
    await usuario
      .send(
        `Check-in de **${torneo.name}** abre ${fechaCL(torneo.checkInOpensAt)}. ` +
          `Si no haces check-in pierdes el cupo: ${sitio()}/torneos/${torneo.slug}`,
      )
      .then(() => {
        enviados += 1
      })
      .catch(() => undefined)
  }
  return enviados
}

/** Post de resultados al cerrar el torneo. */
export async function publicarResultados(tournamentId: string): Promise<void> {
  const canal = await canalTorneos()
  const torneo = await prisma.tournament.findUnique({ where: { id: tournamentId } })
  if (!canal || !torneo) return

  const tabla = await tablaTorneo(tournamentId)
  const podio = tabla.slice(0, 5).map((f) => `${f.posicion}. ${f.displayName} — ${f.puntos} pts`)

  await canal.send({
    content: [`**${torneo.name}** — resultados`, ...podio, `${sitio()}/torneos/${torneo.slug}`].join('\n'),
  })
}

/**
 * Rol automático por tramo de ranking. La gente compite por el rol tanto
 * como por el premio (§2.9).
 */
export async function sincronizarRoles(): Promise<number> {
  const cliente = bot()
  const guildId = process.env.DISCORD_GUILD_ID
  if (!cliente || !guildId) return 0

  const guild = await cliente.guilds.fetch(guildId).catch(() => null)
  if (!guild) return 0

  const roles = await guild.roles.fetch()
  const rolTop10 = roles.find((r) => r.name === 'Top 10 Clutch')
  const rolTop50 = roles.find((r) => r.name === 'Top 50 Clutch')
  if (!rolTop10 && !rolTop50) return 0

  const tabla = await tablaPublica({ game: 'FORTNITE', limite: 50 })
  const usuarios = await prisma.user.findMany({
    where: { id: { in: tabla.map((f) => f.userId) } },
    select: { id: true, discordId: true },
  })
  const discordPorUser = new Map(usuarios.map((u) => [u.id, u.discordId]))

  let aplicados = 0
  for (const fila of tabla) {
    const discordId = discordPorUser.get(fila.userId)
    if (!discordId) continue
    const miembro = await guild.members.fetch(discordId).catch(() => null)
    if (!miembro) continue

    const debeTop10 = fila.posicion <= 10
    if (rolTop10) {
      if (debeTop10 && !miembro.roles.cache.has(rolTop10.id)) await miembro.roles.add(rolTop10)
      if (!debeTop10 && miembro.roles.cache.has(rolTop10.id)) await miembro.roles.remove(rolTop10)
    }
    if (rolTop50 && !miembro.roles.cache.has(rolTop50.id)) await miembro.roles.add(rolTop50)
    aplicados += 1
  }
  return aplicados
}
