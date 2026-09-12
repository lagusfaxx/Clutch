/**
 * Revisa la configuración y dice, en concreto, qué funciona y qué no.
 *
 * La idea es que nadie descubra en medio de un torneo que le faltaba una
 * variable: los mensajes describen la consecuencia, no el nombre del campo.
 *
 * Uso: npm run env:check
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

type Nivel = 'ok' | 'aviso' | 'falla'

interface Revision {
  nivel: Nivel
  titulo: string
  detalle: string
}

// Carga .env sin dependencias: el parser completo de dotenv no hace falta acá.
function cargarEnv(): void {
  const ruta = resolve(process.cwd(), '.env')
  if (!existsSync(ruta)) return
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const limpia = linea.trim()
    if (!limpia || limpia.startsWith('#')) continue
    const corte = limpia.indexOf('=')
    if (corte < 1) continue
    const clave = limpia.slice(0, corte).trim()
    const valor = limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '')
    if (!(clave in process.env)) process.env[clave] = valor
  }
}

const hay = (v: string): boolean => Boolean(process.env[v]?.trim())

function revisarBase(): Revision {
  const url = process.env.DATABASE_URL?.trim()
  const compose = hay('POSTGRES_PASSWORD')
  if (!url && compose) {
    return { nivel: 'ok', titulo: 'Base de datos', detalle: 'La arma docker compose desde POSTGRES_PASSWORD.' }
  }
  if (!url) {
    return { nivel: 'falla', titulo: 'Base de datos', detalle: 'Falta DATABASE_URL. Sin esto la aplicación no arranca.' }
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    return { nivel: 'falla', titulo: 'Base de datos', detalle: 'DATABASE_URL debe empezar con postgresql://' }
  }
  return { nivel: 'ok', titulo: 'Base de datos', detalle: 'DATABASE_URL configurada.' }
}

function revisarSecretos(): Revision[] {
  const salida: Revision[] = []

  if (!hay('AUTH_SECRET')) {
    salida.push({ nivel: 'falla', titulo: 'Sesiones', detalle: 'Falta AUTH_SECRET. Genérala con: openssl rand -base64 32' })
  } else if ((process.env.AUTH_SECRET ?? '').length < 32) {
    salida.push({ nivel: 'aviso', titulo: 'Sesiones', detalle: 'AUTH_SECRET es corta. Usa 32 bytes: openssl rand -base64 32' })
  } else {
    salida.push({ nivel: 'ok', titulo: 'Sesiones', detalle: 'AUTH_SECRET configurada.' })
  }

  const clave = process.env.PRIZE_ENCRYPTION_KEY?.trim()
  if (!clave) {
    salida.push({
      nivel: 'aviso',
      titulo: 'Cifrado de premios',
      detalle: 'Sin PRIZE_ENCRYPTION_KEY no puedes cargar ni revelar códigos de V-Bucks. El resto funciona.',
    })
  } else if (Buffer.from(clave, 'base64').length !== 32) {
    salida.push({
      nivel: 'falla',
      titulo: 'Cifrado de premios',
      detalle: 'PRIZE_ENCRYPTION_KEY tiene que ser 32 bytes en base64: openssl rand -base64 32',
    })
  } else {
    salida.push({ nivel: 'ok', titulo: 'Cifrado de premios', detalle: 'Clave válida de 32 bytes.' })
  }

  if (clave && clave === process.env.AUTH_SECRET?.trim()) {
    salida.push({
      nivel: 'falla',
      titulo: 'Secretos repetidos',
      detalle: 'AUTH_SECRET y PRIZE_ENCRYPTION_KEY son iguales. Filtrar una filtraría las dos.',
    })
  }
  return salida
}

function revisarUrls(): Revision[] {
  const salida: Revision[] = []
  for (const nombre of ['SITE_URL', 'AUTH_URL']) {
    const valor = process.env[nombre]?.trim()
    if (!valor) {
      salida.push({
        nivel: nombre === 'SITE_URL' ? 'falla' : 'aviso',
        titulo: nombre,
        detalle: `Falta ${nombre}. En local: http://localhost:3000`,
      })
      continue
    }
    if (valor.endsWith('/')) {
      salida.push({ nivel: 'aviso', titulo: nombre, detalle: 'Sobra la barra del final: los links quedan con doble barra.' })
      continue
    }
    const produccion = !valor.includes('localhost') && !valor.includes('127.0.0.1')
    if (produccion && !valor.startsWith('https://')) {
      salida.push({ nivel: 'aviso', titulo: nombre, detalle: 'En producción tiene que ser https.' })
      continue
    }
    salida.push({ nivel: 'ok', titulo: nombre, detalle: valor })
  }
  return salida
}

function revisarFortnite(): Revision {
  if (hay('FORTNITE_API_KEY')) {
    const respaldo = hay('FORTNITE_API_IO_KEY') ? ' Con respaldo en fortniteapi.io.' : ' Sin respaldo configurado, que está bien.'
    return { nivel: 'ok', titulo: 'Verificación de nicks', detalle: `fortnite-api.com configurada.${respaldo}` }
  }
  if (hay('FORTNITE_API_IO_KEY')) {
    return {
      nivel: 'aviso',
      titulo: 'Verificación de nicks',
      detalle: 'Solo tienes el respaldo. Saca la key principal en dash.fortnite-api.com',
    }
  }
  return {
    nivel: 'falla',
    titulo: 'Verificación de nicks',
    detalle: 'Sin FORTNITE_API_KEY nadie puede confirmar su cuenta de Fortnite, o sea nadie se inscribe. Sácala gratis en dash.fortnite-api.com',
  }
}

function revisarDiscord(): Revision[] {
  const login = hay('DISCORD_CLIENT_ID') && hay('DISCORD_CLIENT_SECRET')
  const bot = hay('DISCORD_BOT_TOKEN')

  if (!login && !bot) {
    return [{ nivel: 'ok', titulo: 'Discord', detalle: 'Apagado. El login por correo funciona igual.' }]
  }

  const salida: Revision[] = []
  if (bot && !hay('DISCORD_CLIENT_ID')) {
    salida.push({
      nivel: 'aviso',
      titulo: 'Discord',
      detalle: 'Hay bot pero falta DISCORD_CLIENT_ID: los comandos /rank y /proximo no se registran.',
    })
  }
  if (bot && !hay('DISCORD_GUILD_ID')) {
    salida.push({
      nivel: 'aviso',
      titulo: 'Discord',
      detalle: 'Sin DISCORD_GUILD_ID los comandos tardan hasta una hora en aparecer y no hay roles por ranking.',
    })
  }
  if (bot && !hay('DISCORD_CANAL_TORNEOS')) {
    salida.push({
      nivel: 'aviso',
      titulo: 'Discord',
      detalle: 'Sin DISCORD_CANAL_TORNEOS el bot no publica anuncios ni resultados.',
    })
  }
  if (login && !bot) {
    salida.push({ nivel: 'ok', titulo: 'Discord', detalle: 'Vinculación de cuenta activa, sin bot.' })
  }
  if (bot && salida.length === 0) {
    salida.push({
      nivel: 'ok',
      titulo: 'Discord',
      detalle: 'Bot completo. Revisa que el Server Members Intent esté activo en el portal o no conectará.',
    })
  }
  return salida
}

function revisarPagos(): Revision {
  const completo = hay('TBK_COMMERCE_CODE') && hay('TBK_API_KEY')
  if (!completo && !hay('TBK_COMMERCE_CODE') && !hay('TBK_API_KEY')) {
    return { nivel: 'ok', titulo: 'Pagos', detalle: 'Transbank apagado. Los torneos gratis funcionan igual.' }
  }
  if (!completo) {
    return { nivel: 'falla', titulo: 'Pagos', detalle: 'Transbank a medias: hacen falta TBK_COMMERCE_CODE y TBK_API_KEY.' }
  }
  const ambiente = process.env.TBK_AMBIENTE ?? 'integracion'
  return {
    nivel: ambiente === 'produccion' ? 'ok' : 'aviso',
    titulo: 'Pagos',
    detalle:
      ambiente === 'produccion'
        ? 'Transbank en producción. Mueve plata real.'
        : 'Transbank en integración: son credenciales de prueba, no cobran de verdad.',
  }
}

function revisarFondo(): Revision {
  if (process.env.RUN_BACKGROUND === 'true') {
    return {
      nivel: 'ok',
      titulo: 'Cola y bot',
      detalle: 'Encendidos. Recuerda: solo UNA instancia puede tener esto en true.',
    }
  }
  return {
    nivel: 'falla',
    titulo: 'Cola y bot',
    detalle: 'RUN_BACKGROUND no está en true: los torneos no cierran solos y el ranking no se calcula.',
  }
}

function main(): void {
  cargarEnv()

  const revisiones: Revision[] = [
    revisarBase(),
    ...revisarSecretos(),
    ...revisarUrls(),
    revisarFortnite(),
    ...revisarDiscord(),
    revisarPagos(),
    revisarFondo(),
  ]

  const icono: Record<Nivel, string> = { ok: '  ok  ', aviso: ' aviso', falla: ' falta' }
  console.log('')
  for (const r of revisiones) {
    console.log(`${icono[r.nivel]}  ${r.titulo.padEnd(22)} ${r.detalle}`)
  }

  const fallas = revisiones.filter((r) => r.nivel === 'falla').length
  const avisos = revisiones.filter((r) => r.nivel === 'aviso').length
  console.log('')

  if (fallas > 0) {
    console.log(`${fallas} cosa(s) por resolver antes de abrir al público. Ver docs/VARIABLES.md`)
    process.exit(1)
  }
  console.log(avisos > 0 ? `Listo para funcionar, con ${avisos} aviso(s).` : 'Configuración completa.')
}

main()
