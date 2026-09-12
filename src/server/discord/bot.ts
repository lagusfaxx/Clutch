import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js'
import { prisma } from '@/lib/prisma'
import { tablaPublica } from '../services/ranking'

/**
 * Un solo proceso corre web, API, cola y bot (§5). Por eso RUN_BACKGROUND:
 * con dos réplicas y la variable en true en ambas, el bot se conecta dos
 * veces y duplica cada mensaje.
 */
let cliente: Client | null = null

export function bot(): Client | null {
  return cliente
}

const comandos = [
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Muestra la posición y el rating de un jugador en Clutch')
    .addStringOption((o) => o.setName('usuario').setDescription('Nick del jugador').setRequired(false))
    .toJSON(),
  new SlashCommandBuilder()
    .setName('proximo')
    .setDescription('Muestra el próximo torneo con inscripciones abiertas')
    .toJSON(),
]

export async function startBot(): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN
  if (!token) {
    console.warn('[discord] sin DISCORD_BOT_TOKEN, el bot queda apagado')
    return
  }

  cliente = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel],
  })

  cliente.on('interactionCreate', async (interaccion) => {
    if (!interaccion.isChatInputCommand()) return
    try {
      if (interaccion.commandName === 'rank') await responderRank(interaccion)
      if (interaccion.commandName === 'proximo') await responderProximo(interaccion)
    } catch (e) {
      console.error('[discord] comando falló', e)
      if (!interaccion.replied) await interaccion.reply({ content: 'Se cayó algo. Inténtalo de nuevo.', ephemeral: true })
    }
  })

  await cliente.login(token)
  await registrarComandos(token)
  console.log('[discord] bot conectado')
}

async function registrarComandos(token: string): Promise<void> {
  const appId = process.env.DISCORD_CLIENT_ID
  const guildId = process.env.DISCORD_GUILD_ID
  if (!appId) return
  const rest = new REST({ version: '10' }).setToken(token)
  const ruta = guildId ? Routes.applicationGuildCommands(appId, guildId) : Routes.applicationCommands(appId)
  await rest.put(ruta, { body: comandos })
}

type Interaccion = {
  options: { getString(nombre: string): string | null }
  user: { id: string }
  reply(datos: { content: string; ephemeral?: boolean }): Promise<unknown>
  replied: boolean
}

async function responderRank(interaccion: Interaccion): Promise<void> {
  const nick = interaccion.options.getString('usuario')
  const usuario = nick
    ? await prisma.user.findFirst({
        where: {
          deletedAt: null,
          OR: [
            { displayName: { equals: nick, mode: 'insensitive' } },
            { epicNick: { equals: nick, mode: 'insensitive' } },
          ],
        },
        include: { ratings: { orderBy: { rating: 'desc' }, take: 1 } },
      })
    : await prisma.user.findUnique({
        where: { discordId: interaccion.user.id },
        include: { ratings: { orderBy: { rating: 'desc' }, take: 1 } },
      })

  if (!usuario) {
    await interaccion.reply({ content: 'No encontré a ese jugador en Clutch.', ephemeral: true })
    return
  }

  const rating = usuario.ratings[0]
  if (!rating) {
    await interaccion.reply({
      content: `${usuario.displayName} todavía no tiene rating. Se necesita jugar al menos un torneo.`,
    })
    return
  }

  const tabla = await tablaPublica({ game: 'FORTNITE', mode: rating.mode, limite: 500 })
  const fila = tabla.find((f) => f.userId === usuario.id)
  const posicion = fila ? `#${fila.posicion}` : 'sin ranking público (faltan torneos)'

  await interaccion.reply({
    content: `**${usuario.displayName}** · ${rating.mode} · ${Math.round(rating.rating)} pts · ${posicion} · ${usuario.slug}`,
  })
}

async function responderProximo(interaccion: Interaccion): Promise<void> {
  const torneo = await prisma.tournament.findFirst({
    where: { deletedAt: null, status: { in: ['PUBLICADO', 'INSCRIPCION_ABIERTA'] } },
    orderBy: { startsAt: 'asc' },
  })
  if (!torneo) {
    await interaccion.reply({ content: 'No hay torneos con inscripciones abiertas ahora.' })
    return
  }
  const url = `${process.env.SITE_URL ?? 'https://clutch.cl'}/torneos/${torneo.slug}`
  await interaccion.reply({ content: `**${torneo.name}** · ${torneo.mode} · ${url}` })
}

export async function stopBot(): Promise<void> {
  if (!cliente) return
  await cliente.destroy()
  cliente = null
}
