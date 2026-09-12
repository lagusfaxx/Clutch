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
      <header className="bloque p-5">
        <h1 className="text-[19px] font-bold">Mapa</h1>
        <p className="mt-1 text-[13px] text-humo">
          La isla de la temporada actual. {datos ? `${datos.lugares.length} lugares con nombre.` : ''}
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
          <section className="bloque p-5">
            <h2 className="etiqueta mb-2">Lugares con nombre</h2>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-[13px] sm:grid-cols-3 lg:grid-cols-4">
              {datos.lugares.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
