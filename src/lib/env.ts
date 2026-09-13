import { z } from 'zod'

/**
 * Todas las variables viven en Coolify. Nada de valores por defecto para
 * secretos: si falta uno, el proceso no debe levantar en silencio.
 */
const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(16),
  AUTH_URL: z.string().url().optional(),
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_CANAL_TORNEOS: z.string().optional(),
  FORTNITE_API_KEY: z.string().optional(),
  FORTNITE_API_IO_KEY: z.string().optional(),
  PRIZE_ENCRYPTION_KEY: z.string().optional(),
  TBK_COMMERCE_CODE: z.string().optional(),
  TBK_API_KEY: z.string().optional(),
  TBK_AMBIENTE: z.enum(['integracion', 'produccion']).default('integracion'),
  RUN_BACKGROUND: z.enum(['true', 'false']).default('false'),
  // Cuenta de administración inicial. Sin ella no hay forma de entrar al
  // panel en un servidor nuevo: `isAdmin` no se activa desde la aplicación.
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().optional(),
  SITE_URL: z.string().url().default('https://clutch.cl'),
})

export type Env = z.infer<typeof esquema>

let cache: Env | null = null

export function env(): Env {
  if (cache) return cache
  const parsed = esquema.safeParse(process.env)
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
    throw new Error(`Configuración inválida. Revisa las variables de entorno: ${detalle}`)
  }
  cache = parsed.data
  return cache
}

export function correBackground(): boolean {
  return process.env.RUN_BACKGROUND === 'true'
}
