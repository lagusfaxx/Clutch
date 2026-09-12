import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import Discord from 'next-auth/providers/discord'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { autenticarConEmail, upsertDesdeDiscord } from '../services/user'

const credenciales = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/**
 * Auth.js v5 con sesión JWT, para que /api/v1 pueda servir a la app móvil
 * futura con el mismo token (§1).
 *
 * El login es correo y contraseña. Discord queda como vínculo opcional para
 * los avisos del bot, no como puerta de entrada. Epic Account Services está
 * fuera por ahora: la verificación de la cuenta de Fortnite se hace por
 * lookup de nick contra fortnite-api.com (ver vincularEpicPorNick).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  providers: [
    Credentials({
      name: 'Correo y contraseña',
      credentials: {
        email: { label: 'Correo', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(datos) {
        const parsed = credenciales.safeParse(datos)
        if (!parsed.success) return null

        const usuario = await autenticarConEmail(parsed.data.email, parsed.data.password)
        if (!usuario) return null
        return { id: usuario.id, name: usuario.displayName, email: usuario.email }
      },
    }),
    ...(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET
      ? [
          Discord({
            clientId: process.env.DISCORD_CLIENT_ID,
            clientSecret: process.env.DISCORD_CLIENT_SECRET,
            authorization: { params: { scope: 'identify email' } },
          }),
        ]
      : []),
  ],
  pages: { signIn: '/entrar', error: '/entrar' },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === 'credentials') return true

      if (account?.provider === 'discord') {
        const perfil = profile as { id?: string; username?: string; global_name?: string; avatar?: string } | undefined
        const discordId = perfil?.id ?? account.providerAccountId
        const cuenta = await upsertDesdeDiscord({
          discordId,
          discordTag: perfil?.username,
          displayName: perfil?.global_name ?? perfil?.username ?? user.name ?? 'jugador',
          email: user.email ?? undefined,
          avatarUrl:
            perfil?.avatar && perfil.id
              ? `https://cdn.discordapp.com/avatars/${perfil.id}/${perfil.avatar}.png`
              : undefined,
        })
        return cuenta.status !== 'BANNED'
      }
      return false
    },

    async jwt({ token, account, profile, user }) {
      if (account?.provider === 'credentials' && user?.id) {
        token.uid = user.id
      }

      if (account?.provider === 'discord') {
        const perfil = profile as { id?: string } | undefined
        const discordId = perfil?.id ?? account.providerAccountId
        const cuenta = await prisma.user.findUnique({ where: { discordId } })
        if (cuenta) token.uid = cuenta.id
      }

      // Estado, slug y permisos se releen en cada request: un baneo o una
      // verificación de Epic tienen que surtir efecto sin cerrar sesión.
      if (typeof token.uid === 'string') {
        const cuenta = await prisma.user.findUnique({ where: { id: token.uid } })
        if (cuenta) {
          token.slug = cuenta.slug
          token.estado = cuenta.status
          token.admin = cuenta.isAdmin
          token.nombre = cuenta.displayName
        }
      }
      return token
    },

    async session({ session, token }) {
      if (typeof token.uid === 'string') {
        session.user.id = token.uid
        session.user.slug = typeof token.slug === 'string' ? token.slug : ''
        session.user.estado = typeof token.estado === 'string' ? token.estado : 'PENDING'
        session.user.admin = token.admin === true
        if (typeof token.nombre === 'string') session.user.name = token.nombre
      }
      return session
    },
  },
})

export async function usuarioActual() {
  const sesion = await auth()
  if (!sesion?.user?.id) return null
  return prisma.user.findUnique({ where: { id: sesion.user.id } })
}

export async function exigirSesion() {
  const usuario = await usuarioActual()
  if (!usuario) throw new Error('NO_AUTORIZADO')
  return usuario
}
