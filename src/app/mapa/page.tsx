import type { Metadata } from 'next'
import { mapa } from '@/server/services/fortnite/catalogo'

export const metadata: Metadata = {
  title: 'Mapa de Fortnite',
  description: 'El mapa de la temporada actual con todos sus lugares con nombre.',
}

// Dinámica: la caché de estos datos vive en Postgres, y al construir la
// imagen no hay base de datos a la que preguntar.
export const dynamic = 'force-dynamic'

export default async function MapaPage() {
  const datos = await mapa()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[28px] font-bold leading-none tracking-tight">Mapa</h1>
        <p className="mt-1.5 text-[13px] text-humo">
          La isla de la temporada actual{datos ? ` · ${datos.lugares.length} lugares con nombre` : ''}.
        </p>
      </header>

      {!datos ? (
        <p className="bloque p-5 text-[13px] text-humo">No pudimos traer el mapa ahora.</p>
      ) : (
        <>
          {datos.imagen && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={datos.imagen} alt="Mapa de Fortnite" className="bloque w-full" />
          )}
          <section>
            <h2 className="etiqueta mb-2">Lugares con nombre</h2>
            <ul className="grid grid-cols-2 gap-px bg-linea sm:grid-cols-3 lg:grid-cols-4">
              {datos.lugares.map((l) => (
                <li key={l} className="bg-panel px-3 py-2 text-[13px]">
                  {l}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
