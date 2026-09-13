import type { Metadata } from 'next'
import { tienda } from '@/server/services/fortnite/catalogo'
import { Tienda } from '@/components/Tienda'

export const metadata: Metadata = {
  title: 'Tienda de Fortnite',
  description: 'Lo que está a la venta hoy en la tienda de Fortnite, con precios en paVos.',
}

// Dinámica: la caché de estos datos vive en Postgres, y al construir la
// imagen no hay base de datos a la que preguntar.
export const dynamic = 'force-dynamic'

export default async function TiendaPage() {
  const datos = await tienda()

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-none tracking-tight">Tienda de hoy</h1>
          <p className="mt-1.5 text-[13px] text-humo">
            {datos
              ? `${datos.articulos.length} artículos${
                  datos.fecha ? ` · ${new Date(datos.fecha).toLocaleDateString('es-CL')}` : ''
                } · precios en paVos`
              : 'Precios en paVos, la moneda del juego.'}
          </p>
        </div>
      </header>

      {!datos || datos.articulos.length === 0 ? (
        <p className="bloque p-5 text-[13px] text-humo">
          No pudimos traer la tienda ahora. Vuelve a intentarlo en unos minutos.
        </p>
      ) : (
        <Tienda datos={datos} />
      )}
    </div>
  )
}
