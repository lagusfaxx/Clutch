import type { Metadata } from 'next'
import { noticias } from '@/server/services/fortnite/catalogo'

export const metadata: Metadata = {
  title: 'Novedades de Fortnite',
  description: 'Lo último que Epic anuncia dentro del juego, en español.',
}

// Dinámica: la caché de estos datos vive en Postgres, y al construir la
// imagen no hay base de datos a la que preguntar.
export const dynamic = 'force-dynamic'

export default async function NoticiasPage() {
  const lista = await noticias()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[28px] font-bold leading-none tracking-tight">Novedades</h1>
        <p className="mt-1.5 text-[13px] text-humo">
          Lo que Epic está anunciando dentro del juego{lista ? ` · ${lista.length} avisos` : ''}.
        </p>
      </header>

      {!lista || lista.length === 0 ? (
        <p className="bloque p-5 text-[13px] text-humo">No pudimos traer las novedades ahora.</p>
      ) : (
        lista.map((n) => (
          <article key={n.id} className="bloque grid gap-0 md:grid-cols-[320px_1fr]">
            {n.imagen && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={n.imagen} alt="" loading="lazy" className="h-full w-full bg-panelAlt object-cover" />
            )}
            <div className="p-5">
              <h2 className="text-[15px] font-bold">{n.titulo}</h2>
              {n.cuerpo && <p className="mt-2 max-w-[70ch] whitespace-pre-line text-[13px] text-humo">{n.cuerpo}</p>}
            </div>
          </article>
        ))
      )}
    </div>
  )
}
