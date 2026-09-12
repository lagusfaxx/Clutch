interface Serie {
  nombre: string
  puntos: number[]
}

/**
 * Gráfico de evolución en SVG plano. Sin librería: son dos polilíneas y una
 * grilla, y la página carga más rápido sin 90 KB de dependencia.
 */
export function Evolucion({ series, alto = 120 }: { series: Serie[]; alto?: number }) {
  const todos = series.flatMap((s) => s.puntos)
  if (todos.length < 2) return <p className="text-[12px] text-humo">Faltan datos para dibujar la evolución.</p>

  const min = Math.min(...todos)
  const max = Math.max(...todos)
  const rango = max - min || 1
  const ancho = 420
  const colores = ['#c9d93b', '#e2542a']

  const linea = (puntos: number[]) =>
    puntos
      .map((p, i) => {
        const x = (i / Math.max(1, puntos.length - 1)) * ancho
        const y = alto - ((p - min) / rango) * (alto - 12) - 6
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')

  return (
    <figure>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="w-full" role="img" aria-label="Evolución del rating">
        <line x1="0" y1={alto - 6} x2={ancho} y2={alto - 6} stroke="#272e33" strokeWidth="1" />
        <line x1="0" y1="6" x2={ancho} y2="6" stroke="#272e33" strokeWidth="1" strokeDasharray="3 4" />
        {series.map((s, i) => (
          <polyline
            key={s.nombre}
            points={linea(s.puntos)}
            fill="none"
            stroke={colores[i % colores.length]}
            strokeWidth="1.8"
          />
        ))}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[11px] text-humo">
        {series.map((s, i) => (
          <span key={s.nombre}>
            <span style={{ color: colores[i % colores.length] }}>■</span> {s.nombre}
          </span>
        ))}
        <span className="ml-auto cifra">
          {min} – {max}
        </span>
      </figcaption>
    </figure>
  )
}
