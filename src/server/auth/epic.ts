import type { OAuthConfig } from 'next-auth/providers'

export interface PerfilEpic {
  sub: string
  preferred_username?: string
  display_name?: string
  email?: string
}

/**
 * Epic Account Services. Es lo único oficial y estable que entrega Epic:
 * identidad (accountId + displayName), nada de stats (§2.4). Y es
 * justamente lo que sostiene el anti-smurf.
 *
 * Jamás se pide usuario/contraseña de Epic: eso es la señal número uno de
 * un sitio de phishing.
 */
export function epicProvider(): OAuthConfig<PerfilEpic> {
  return {
    id: 'epic',
    name: 'Epic Games',
    type: 'oauth',
    authorization: {
      url: 'https://www.epicgames.com/id/authorize',
      params: { scope: 'basic_profile', response_type: 'code' },
    },
    token: 'https://api.epicgames.dev/epic/oauth/v2/token',
    userinfo: 'https://api.epicgames.dev/epic/oauth/v2/userInfo',
    clientId: process.env.EPIC_CLIENT_ID,
    clientSecret: process.env.EPIC_CLIENT_SECRET,
    checks: ['state', 'pkce'],
    profile(perfil) {
      return {
        id: perfil.sub,
        name: perfil.display_name ?? perfil.preferred_username ?? perfil.sub,
        email: perfil.email ?? null,
      }
    },
  }
}
