import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { Db } from '@/lib/prisma'
import { leer, guardar, TTL_ESTATICO_MS } from './cache'

/**
 * Lo que fortnite-api.com entrega además de las stats de jugador: tienda,
 * noticias y mapa. Son datos del juego, iguales para todos, así que se
 * cachean en la tabla `Cache` y una sola consulta sirve a todo el sitio.
 *
 * Todo devuelve null si falla. Son secciones de acompañamiento: que la
 * tienda no cargue no puede tumbar una página de torneo.
 */

const BASE = 'https://fortnite-api.com'
const TIMEOUT_MS = 6000
/** La tienda rota una vez al día, pero se revisa cada hora por si acaso. */
const TTL_TIENDA_MS = 3_600_000

async function pedir<T>(ruta: string, esquema: z.ZodType<T>, clave: string, ttl: number, db: Db): Promise<T | null> {
  const cacheado = await leer<T>(clave, db)
  if (cacheado) return cacheado

  const key = process.env.FORTNITE_API_KEY
  if (!key) return null

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${BASE}${ruta}`, {
      headers: { Authorization: key },
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const parsed = esquema.safeParse(await res.json())
    if (!parsed.success) return null
    await guardar(clave, parsed.data, ttl, db)
    return parsed.data
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/* ---------------------------------------------------------------- tienda */

const imagenes = z.object({ icon: z.string().nullish(), smallIcon: z.string().nullish(), featured: z.string().nullish() })

const articulo = z.object({
  name: z.string(),
  description: z.string().nullish(),
  type: z.object({ displayValue: z.string().nullish() }).nullish(),
  rarity: z.object({ displayValue: z.string().nullish() }).nullish(),
  images: imagenes.nullish(),
})

const entrada = z.object({
  offerId: z.string(),
  regularPrice: z.number().nullish(),
  finalPrice: z.number().nullish(),
  layout: z.object({ name: z.string().nullish() }).nullish(),
  bundle: z.object({ name: z.string().nullish(), image: z.string().nullish() }).nullish(),
  brItems: z.array(articulo).nullish(),
  tracks: z.array(z.object({ title: z.string(), artist: z.string().nullish(), albumArt: z.string().nullish() })).nullish(),
  instruments: z.array(articulo).nullish(),
  cars: z.array(articulo).nullish(),
})

const respuestaTienda = z.object({
  data: z.object({ date: z.string().nullish(), vbuckIcon: z.string().nullish(), entries: z.array(entrada) }),
})

export interface ArticuloTienda {
  id: string
  nombre: string
  tipo: string
  rareza: string | null
  imagen: string | null
  precio: number | null
  precioNormal: number | null
  seccion: string
  /** Un paquete trae varias cosas por un precio: se marca porque no compara. */
  paquete: boolean
}

export interface Tienda {
  fecha: string | null
  iconoPavos: string | null
  articulos: ArticuloTienda[]
  /** Secciones ordenadas de más a menos artículos, para el índice. */
  secciones: { nombre: string; cantidad: number }[]
  tipos: { nombre: string; cantidad: number }[]
}

function contar(valores: string[]): { nombre: string; cantidad: number }[] {
  const cuenta = new Map<string, number>()
  for (const v of valores) cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
  return [...cuenta.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'))
}

/**
 * La tienda llega con más de trescientas entradas y formas distintas según
 * lo que se venda: aspectos, packs, instrumentos, autos, canciones. Acá se
 * aplana a una sola forma para poder dibujarlas todas con la misma ficha.
 */
export async function tienda(db: Db = prisma): Promise<Tienda | null> {
  const datos = await pedir('/v2/shop?language=es', respuestaTienda, 'fn:tienda:es', TTL_TIENDA_MS, db)
  if (!datos) return null

  const articulos: ArticuloTienda[] = []
  for (const e of datos.data.entries) {
    const cosmetico = e.brItems?.[0] ?? e.instruments?.[0] ?? e.cars?.[0]
    const pista = e.tracks?.[0]

    const nombre = e.bundle?.name ?? cosmetico?.name ?? pista?.title
    if (!nombre) continue

    // El tipo es lo que más se filtra, así que nunca queda vacío. Las pistas
    // de improvisación van todas juntas bajo su propio tipo: son 126 de 306 y
    // agruparlas por artista dejaría el filtro inservible.
    const tipo = pista ? 'Pista de improvisación' : (cosmetico?.type?.displayValue ?? 'Otro')

    articulos.push({
      id: e.offerId,
      nombre,
      tipo,
      rareza: pista ? (pista.artist ?? null) : (cosmetico?.rarity?.displayValue ?? null),
      imagen: e.bundle?.image ?? cosmetico?.images?.icon ?? cosmetico?.images?.smallIcon ?? pista?.albumArt ?? null,
      precio: e.finalPrice ?? null,
      precioNormal: e.regularPrice ?? null,
      seccion: e.layout?.name?.trim() || 'Otros',
      paquete: Boolean(e.bundle),
    })
  }

  return {
    fecha: datos.data.date ?? null,
    iconoPavos: datos.data.vbuckIcon ?? null,
    articulos,
    secciones: contar(articulos.map((a) => a.seccion)),
    tipos: contar(articulos.map((a) => a.tipo)),
  }
}

/* -------------------------------------------------------------- noticias */

const respuestaNoticias = z.object({
  data: z.object({
    br: z
      .object({
        motds: z
          .array(
            z.object({
              id: z.string(),
              title: z.string(),
              body: z.string().nullish(),
              image: z.string().nullish(),
              tileImage: z.string().nullish(),
            }),
          )
          .nullish(),
      })
      .nullish(),
  }),
})

export interface Noticia {
  id: string
  titulo: string
  cuerpo: string | null
  imagen: string | null
}

export async function noticias(db: Db = prisma): Promise<Noticia[] | null> {
  const datos = await pedir('/v2/news?language=es', respuestaNoticias, 'fn:noticias:es', TTL_TIENDA_MS, db)
  if (!datos?.data.br?.motds) return null

  return datos.data.br.motds.map((m) => ({
    id: m.id,
    titulo: m.title,
    cuerpo: m.body ?? null,
    imagen: m.image ?? m.tileImage ?? null,
  }))
}

/* ------------------------------------------------------------------ mapa */

const respuestaMapa = z.object({
  data: z.object({
    images: z.object({ blank: z.string().nullish(), pois: z.string().nullish() }),
    pois: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
})

export interface Mapa {
  imagen: string | null
  lugares: string[]
}

export async function mapa(db: Db = prisma): Promise<Mapa | null> {
  const datos = await pedir('/v1/map?language=es', respuestaMapa, 'fn:mapa:es', TTL_ESTATICO_MS, db)
  if (!datos) return null

  return {
    imagen: datos.data.images.pois ?? datos.data.images.blank ?? null,
    // La API repite nombres cuando un lugar ocupa varias casillas.
    lugares: [...new Set(datos.data.pois.map((p) => p.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
  }
}
