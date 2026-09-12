import NextAuth from 'next-auth'
import Discord from 'next-auth/providers/discord'
import { prisma } from '@/lib/prisma'
import { upsertDesdeDiscord, vincularEpic } from '../services/user'
import { epicProvider } from './epic'

/**
 * Auth.js v5. Sesión JWT para que /api/v1 pueda servir a la app móvil
 * futura con el mismo token (§1).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: { params: { scope: 'identify email' } },
    }),
    epicProvider(),
  ],
  pages: { signIn: '/entrar', error: '/entrar' },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (!account) return false

      if (account.provider === 'discord') {
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

      if (account.provider === 'epic') {
        // La vinculación de Epic exige una sesión de Discord abierta.
        return true
      }
      return false
    },

    async jwt({ token, account, profile }) {
      if (account?.provider === 'discord') {
        const perfil = profile as { id?: string } | undefined
        const discordId = perfil?.id ?? account.providerAccountId
        const usuario = await prisma.user.findUnique({ where: { discordId } })
        if (usuario) {
          token.uid = usuario.id
          token.slug = usuario.slug
          token.estado = usuario.status
          token.admin = usuario.isAdmin
        }
      }

      if (account?.provider === 'epic' && typeof token.uid === 'string') {
        const perfil = profile as { sub?: string; display_name?: string } | undefined
        if (perfil?.sub) {
          const usuario = await vincularEpic(token.uid, {
            epicAccountId: perfil.sub,
            epicNick: perfil.display_name ?? perfil.sub,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
          })
          token.estado = usuario.status
        }
      }

      if (typeof token.uid === 'string' && !account) {
        const usuario = await prisma.user.findUnique({ where: { id: token.uid } })
        if (usuario) {
          token.estado = usuario.status
          token.admin = usuario.isAdmin
          token.slug = usuario.slug
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
