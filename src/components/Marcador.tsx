import Link from 'next/link'

export function Podio({ posicion }: { posicion: number }) {
  const color = posicion === 1 ? 'text-podio' : posicion <= 3 ? 'text-cal' : 'text-humo'
  return <span className={`cifra ${color}`}>{posicion}</span>
}

export interface FilaRanking {
  posicion: number
  slug: string
  displayName: string
  region: string | null
  rating: number
  matchCount: number
  mode?: string
}

export function TablaRanking({ filas, compacta = false }: { filas: FilaRanking[]; compacta?: boolean }) {
  if (filas.length === 0) {
    return (
      <p className="px-3 py-6 text-[13px] text-humo">
        Todavía no hay nadie con los 5 torneos mínimos para entrar a la tabla.
      </p>
    )
  }

  return (
    <table className="tabla">
      <thead>
        <tr>
          <th className="num w-10">#</th>
          <th>Jugador</th>
          {!compacta && <th>Región</th>}
          {!compacta && <th className="num">Modo</th>}
          <th className="num">Rating</th>
          <th className="num">Torneos</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={`${f.slug}-${f.mode ?? ''}`}>
            <td className="num">
              <Podio posicion={f.posicion} />
            </td>
            <td className="font-medium">
              <Link href={`/j/${f.slug}`}>{f.displayName}</Link>
            </td>
            {!compacta && <td className="text-humo">{f.region ?? '—'}</td>}
            {!compacta && <td className="num text-humo">{f.mode ?? '—'}</td>}
            <td className="num cifra text-cal">{f.rating}</td>
            <td className="num cifra text-humo">{f.matchCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
