import Link from 'next/link'
import type { Metadata } from 'next'
import { compararJugadores } from '@/server/services/compare'
import { esErrorClutch } from '@/lib/errores'
import { fechaCL } from '@/lib/fechas'
import { Evolucion } from '@/components/Evolucion'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Comparar jugadores',
  description: 'Rating, torneos y enfrentamientos directos entre dos jugadores de Clutch.',
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const { a, b } = await searchParams

  if (!a || !b) {
    return (
      <div className="bloque max-w-[520px] p-5">
        <h1 className="text-cifra">Comparar jugadores</h1>
        <p className="mt-2 text-[13px] text-humo">
          Escribe los dos nicks tal como aparecen en Clutch. También llegas acá desde el botón &quot;Comparar
          conmigo&quot; de cualquier perfil.
        </p>
        <form className="mt-4 flex flex-wrap gap-2" action="/comparar">
          <input
            name="a"
            defaultValue={a ?? ''}
            placeholder="Jugador 1"
            required
            className="border border-linea bg-carbon px-3 py-2 text-[13px]"
          />
          <input
            name="b"
            defaultValue={b ?? ''}
            placeholder="Jugador 2"
            required
            className="border border-linea bg-carbon px-3 py-2 text-[13px]"
          />
          <button className="boton">Comparar</button>
        </form>
      </div>
    )
  }

  try {
    const comparacion = await compararJugadores(a, b)
    const { a: uno, b: dos, cruces, marcador } = comparacion

    return (
      <div className="space-y-5">
        <header className="bloque grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-5">
          <div>
            <h1 className="text-cifra">
              <Link href={`/j/${uno.slug}`}>{uno.displayName}</Link>
            </h1>
            <p className="etiqueta">{uno.ratingActual ?? '—'} de rating</p>
          </div>
          <div className="text-center">
            <p className="cifra text-marcador">
              <span className="text-cal">{marcador.a}</span>
              <span className="mx-2 text-humo">·</span>
              <span className="text-brasa">{marcador.b}</span>
            </p>
            <p className="etiqueta">
              {cruces.length} {cruces.length === 1 ? 'torneo compartido' : 'torneos compartidos'}
              {marcador.empates > 0 && ` · ${marcador.empates} empate(s)`}
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-cifra">
              <Link href={`/j/${dos.slug}`}>{dos.displayName}</Link>
            </h2>
            <p className="etiqueta">{dos.ratingActual ?? '—'} de rating</p>
          </div>
        </header>

        <section className="bloque p-5">
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">{uno.displayName}</th>
                <th className="text-center">Dato</th>
                <th className="num text-left">{dos.displayName}</th>
              </tr>
            </thead>
            <tbody>
              <Fila titulo="Rating actual" a={uno.ratingActual} b={dos.ratingActual} />
              <Fila titulo="Pico histórico" a={uno.pico} b={dos.pico} />
              <Fila titulo="Torneos jugados" a={uno.torneos} b={dos.torneos} />
              <Fila titulo="Mejor posición" a={uno.mejorPosicion} b={dos.mejorPosicion} menorEsMejor />
              <Fila titulo="Posición promedio" a={uno.posicionPromedio} b={dos.posicionPromedio} menorEsMejor />
            </tbody>
          </table>
        </section>

        {comparacion.evolucion.length > 1 && (
          <section className="bloque p-5">
            <h2 className="mb-2 text-[13px] font-semibold text-humo">Evolución de rating</h2>
            <Evolucion
              series={[
                {
                  nombre: uno.displayName,
                  puntos: comparacion.evolucion.map((p) => p.ratingA ?? 1500),
                },
                {
                  nombre: dos.displayName,
                  puntos: comparacion.evolucion.map((p) => p.ratingB ?? 1500),
                },
              ]}
            />
          </section>
        )}

        <section className="bloque p-5">
          <h2 className="mb-3 text-[13px] font-semibold text-humo">Enfrentamientos directos</h2>
          {cruces.length === 0 ? (
            <p className="text-[13px] text-humo">Nunca coincidieron en el mismo torneo.</p>
          ) : (
            <table className="tabla">
              <thead>
                <tr>
                  <th>Torneo</th>
                  <th className="num">{uno.displayName}</th>
                  <th className="num">{dos.displayName}</th>
                  <th>Quedó arriba</th>
                  <th className="num">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {cruces.map((c) => (
                  <tr key={c.tournamentId}>
                    <td className="font-medium">
                      <Link href={`/torneos/${c.slug}`}>{c.tournamentName}</Link>
                    </td>
                    <td className="num cifra">{c.posicionA}</td>
                    <td className="num cifra">{c.posicionB}</td>
                    <td className={c.ganador === 'A' ? 'text-cal' : c.ganador === 'B' ? 'text-brasa' : 'text-humo'}>
                      {c.ganador === 'EMPATE' ? 'empate' : c.ganador === 'A' ? uno.displayName : dos.displayName}
                    </td>
                    <td className="num cifra text-humo">{fechaCL(c.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    )
  } catch (e) {
    return (
      <div className="bloque max-w-[520px] p-5">
        <h1 className="text-cifra">No se pudo comparar</h1>
        <p className="mt-2 text-[13px] text-humo">
          {esErrorClutch(e) ? e.message : 'Revisa los nicks e inténtalo de nuevo.'}
        </p>
        <Link href="/comparar" className="boton mt-4">
          Volver a intentar
        </Link>
      </div>
    )
  }
}

function Fila({
  titulo,
  a,
  b,
  menorEsMejor = false,
}: {
  titulo: string
  a: number | null
  b: number | null
  menorEsMejor?: boolean
}) {
  const gana = (x: number | null, y: number | null) => {
    if (x === null) return false
    if (y === null) return true
    return menorEsMejor ? x < y : x > y
  }
  return (
    <tr>
      <td className={`num cifra ${gana(a, b) ? 'text-cal' : ''}`}>{a ?? '—'}</td>
      <td className="text-center text-humo">{titulo}</td>
      <td className={`cifra ${gana(b, a) ? 'text-brasa' : ''}`}>{b ?? '—'}</td>
    </tr>
  )
}
