'use client'

import { useMemo, useState } from 'react'
import type { ArticuloTienda, Tienda as DatosTienda } from '@/server/services/fortnite/catalogo'

/**
 * La tienda del día. Son trescientos y tantos artículos: sin filtros es una
 * lista infinita en la que no se encuentra nada, así que lo primero de la
 * página es cómo recortarla.
 *
 * El filtrado es en el navegador y no en el servidor a propósito: los datos
 * ya vinieron completos, son los mismos para todo el mundo y caben de sobra,
 * así que cada clic responde al instante y sin volver a pedir nada.
 */

type Orden = 'seccion' | 'precio-asc' | 'precio-desc' | 'nombre'

/**
 * El color de cada rareza, que en Fortnite es parte de cómo se reconoce un
 * artículo. Son los mismos cinco tonos de las estadísticas, elegidos para
 * distinguirse con daltonismo sobre el fondo oscuro; la rareza va además
 * escrita bajo el nombre, así que el color nunca es el único dato.
 */
const COLOR_RAREZA: Record<string, string> = {
  'Poco común': '#3A9E59',
  Raro: '#3D82C4',
  Épico: '#A47BE8',
  Legendario: '#E2542A',
  'Serie de ídolos': '#1BA8A0',
  'Leyendas de videojuegos': '#1BA8A0',
  'Serie Marvel': '#E2542A',
  'Serie DC': '#3D82C4',
  'Serie de leyendas de la coreografía': '#A47BE8',
}

const ORDENES: { valor: Orden; texto: string }[] = [
  { valor: 'seccion', texto: 'Por sección' },
  { valor: 'precio-asc', texto: 'Más barato' },
  { valor: 'precio-desc', texto: 'Más caro' },
  { valor: 'nombre', texto: 'Por nombre' },
]

function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function Pavos({ icono, precio, normal }: { icono: string | null; precio: number | null; normal: number | null }) {
  if (precio === null) return null
  const rebajado = normal !== null && normal > precio

  return (
    <p className="mt-1.5 flex items-baseline gap-1.5 text-[13px]">
      {icono && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={icono} alt="" aria-hidden width={13} height={13} className="h-[13px] w-[13px] translate-y-[2px]" />
      )}
      <span className="font-dato text-brasa">{precio.toLocaleString('es-CL')}</span>
      {rebajado && <span className="font-dato text-[11px] text-humo line-through">{normal.toLocaleString('es-CL')}</span>}
    </p>
  )
}

function Ficha({ articulo, icono }: { articulo: ArticuloTienda; icono: string | null }) {
  const color = articulo.rareza ? COLOR_RAREZA[articulo.rareza] : undefined

  return (
    <article className="group flex flex-col bg-panel p-3">
      {color && <span className="mb-2 block h-[3px] w-full" style={{ backgroundColor: color }} aria-hidden />}
      <div className="relative mb-2 aspect-square w-full overflow-hidden bg-panelAlt">
        {articulo.imagen ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={articulo.imagen}
            alt=""
            loading="lazy"
            className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <span className="etiqueta absolute inset-0 grid place-items-center">sin imagen</span>
        )}
        {articulo.paquete && (
          <span className="absolute left-0 top-0 bg-carbon/85 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
            Pack
          </span>
        )}
      </div>
      <p className="line-clamp-2 text-[13px] font-semibold leading-tight" title={articulo.nombre}>
        {articulo.nombre}
      </p>
      <p className="mt-0.5 truncate text-[11px]" style={{ color: color ?? undefined }}>
        <span className={color ? '' : 'text-humo'}>{articulo.rareza ?? articulo.tipo}</span>
      </p>
      <div className="mt-auto">
        <Pavos icono={icono} precio={articulo.precio} normal={articulo.precioNormal} />
      </div>
    </article>
  )
}

function Grilla({ articulos, icono }: { articulos: ArticuloTienda[]; icono: string | null }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-linea sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {articulos.map((a) => (
        <Ficha key={a.id} articulo={a} icono={icono} />
      ))}
    </div>
  )
}

export function Tienda({ datos }: { datos: DatosTienda }) {
  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState<string | null>(null)
  const [orden, setOrden] = useState<Orden>('seccion')

  const filtrados = useMemo(() => {
    const termino = normalizar(busqueda.trim())

    const lista = datos.articulos.filter((a) => {
      if (tipo && a.tipo !== tipo) return false
      if (!termino) return true
      return (
        normalizar(a.nombre).includes(termino) ||
        normalizar(a.tipo).includes(termino) ||
        normalizar(a.rareza ?? '').includes(termino) ||
        normalizar(a.seccion).includes(termino)
      )
    })

    const alFinal = (p: number | null) => (p === null ? Number.MAX_SAFE_INTEGER : p)
    if (orden === 'precio-asc') return [...lista].sort((a, b) => alFinal(a.precio) - alFinal(b.precio))
    if (orden === 'precio-desc') return [...lista].sort((a, b) => alFinal(b.precio) - alFinal(a.precio))
    if (orden === 'nombre') return [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    return lista
  }, [datos.articulos, busqueda, tipo, orden])

  // Agrupar solo tiene sentido cuando el orden es por sección; en los demás
  // el criterio es otro y partir la lista en cajas lo escondería.
  const porSeccion = useMemo(() => {
    if (orden !== 'seccion') return null
    const grupos = new Map<string, ArticuloTienda[]>()
    for (const a of filtrados) grupos.set(a.seccion, [...(grupos.get(a.seccion) ?? []), a])

    // Orden: primero las secciones con nombre propio, que son las que Epic
    // arma a mano; después el cajón de sastre; al final las pistas de
    // improvisación, que son 126 de 306 y coparían la página entera.
    const peso = ([nombre, lista]: [string, ArticuloTienda[]]) => {
      if (lista.filter((a) => a.tipo === 'Pista de improvisación').length > lista.length / 2) return 2
      if (nombre === 'Otros') return 1
      return 0
    }

    return [...grupos.entries()].sort((a, b) => peso(a) - peso(b) || b[1].length - a[1].length)
  }, [filtrados, orden])

  const chips = [{ nombre: 'Todo', cantidad: datos.articulos.length }, ...datos.tipos.slice(0, 7)]

  return (
    <div className="space-y-4">
      <div className="bloque space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en la tienda"
            aria-label="Buscar en la tienda"
            className="min-w-[200px] flex-1 border border-linea bg-carbon px-3 py-2 text-[13px] outline-none placeholder:text-humo focus:border-brasa"
          />
          <label className="flex items-center gap-2 text-[13px] text-humo">
            Orden
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value as Orden)}
              className="border border-linea bg-carbon px-2 py-2 text-[13px] text-hueso outline-none focus:border-brasa"
            >
              {ORDENES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.texto}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((t) => {
            const activo = t.nombre === 'Todo' ? tipo === null : tipo === t.nombre
            return (
              <button
                key={t.nombre}
                type="button"
                onClick={() => setTipo(t.nombre === 'Todo' ? null : t.nombre)}
                aria-pressed={activo}
                className={`border px-2.5 py-1 text-[12px] transition-colors ${
                  activo ? 'border-brasa text-brasa' : 'border-linea text-humo hover:border-humo hover:text-hueso'
                }`}
              >
                {t.nombre} <span className="font-dato">{t.cantidad}</span>
              </button>
            )
          })}
        </div>
      </div>

      <p className="etiqueta">
        {filtrados.length === datos.articulos.length
          ? `${datos.articulos.length} artículos`
          : `${filtrados.length} de ${datos.articulos.length} artículos`}
      </p>

      {filtrados.length === 0 ? (
        <p className="bloque p-5 text-[13px] text-humo">Nada calza con esa búsqueda.</p>
      ) : porSeccion ? (
        <div className="space-y-6">
          {porSeccion.map(([seccion, articulos]) => (
            <section key={seccion}>
              <h2 className="mb-2 flex items-baseline gap-2 text-[13px] font-semibold">
                {seccion}
                <span className="etiqueta font-dato">{articulos.length}</span>
              </h2>
              <Grilla articulos={articulos} icono={datos.iconoPavos} />
            </section>
          ))}
        </div>
      ) : (
        <Grilla articulos={filtrados} icono={datos.iconoPavos} />
      )}
    </div>
  )
}
