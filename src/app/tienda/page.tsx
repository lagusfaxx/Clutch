import type { Metadata } from 'next'
import { tienda } from '@/server/services/fortnite/catalogo'

export const metadata: Metadata = {
  title: 'Tienda de Fortnite',
  description: 'Lo que está a la venta hoy en la tienda de Fortnite, con precios en paVos.',
}

// Dinámica: la caché de estos datos vive en Postgres, y al construir la
// imagen no hay base de datos a la que preguntar.
export const dynamic = 'force-dynamic'

export default async function TiendaPage() {
  const datos = await tienda()

  if (!datos || datos.articulos.length === 0) {
    return (
      <div className="bloque p-5">
        <h1 className="text-[19px] font-bold">Tienda</h1>
        <p className="mt-2 text-[13px] text-humo">
          No pudimos traer la tienda ahora. Vuelve a intentarlo en unos minutos.
        </p>
      </div>
    )
  }

  const porSeccion = new Map<string, typeof datos.articulos>()
  for (const a of datos.articulos) {
    const seccion = a.seccion ?? 'Otros'
    const lista = porSeccion.get(seccion) ?? []
    lista.push(a)
    porSeccion.set(seccion, lista)
  }

  return (
    <div className="space-y-6">
      <header className="bloque p-5">
        <h1 className="text-[19px] font-bold">Tienda de hoy</h1>
        <p className="mt-1 text-[13px] text-humo">
          {datos.articulos.length} artículos a la venta
          {datos.fecha ? ` · actualizada el ${new Date(datos.fecha).toLocaleDateString('es-CL')}` : ''}. Los precios
          son en paVos, la moneda del juego.
        </p>
      </header>

      {[...porSeccion.entries()].map(([seccion, articulos]) => (
        <section key={seccion}>
          <h2 className="etiqueta mb-2">{seccion}</h2>
          <div className="grid grid-cols-2 gap-px bg-linea sm:grid-cols-3 lg:grid-cols-5">
            {articulos.map((a) => (
              <article key={a.id} className="bg-panel p-3">
                {a.imagen && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={a.imagen}
                    alt={a.nombre}
                    loading="lazy"
                    className="mb-2 aspect-square w-full bg-panelAlt object-contain"
                  />
                )}
                <p className="text-[13px] font-semibold leading-tight">{a.nombre}</p>
                {a.tipo && <p className="etiqueta mt-0.5">{a.tipo}</p>}
                <p className="mt-1 text-[13px]">
                  <span className="cifra text-brasa">{a.precio?.toLocaleString('es-CL') ?? '—'}</span>
                  {a.precioNormal != null && a.precio != null && a.precioNormal > a.precio && (
                    <span className="ml-2 text-humo line-through">{a.precioNormal.toLocaleString('es-CL')}</span>
                  )}
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
