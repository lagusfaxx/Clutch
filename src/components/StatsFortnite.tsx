import type { Entrada, Modo, StatsJugador, StatsModo, MotivoSinStats } from '@/server/services/fortnite/client'

/**
 * Ficha de estadísticas de Fortnite.
 *
 * Cada modo tiene su color y lo lleva siempre, de la etiqueta a las barras:
 * eso es lo que deja seguir una fila sin volver a leer el encabezado. Los
 * cinco tonos están elegidos para distinguirse también con daltonismo sobre
 * el fondo oscuro (comprobado, no estimado), y aun así el nombre del modo va
 * escrito en cada tarjeta: el color acompaña, nunca es el único dato.
 *
 * Las barras de cada número comparan ese modo con el mejor de los tuyos, que
 * es la única referencia honesta que se puede dar sin percentiles de la
 * población. Lo dice la página, para que nadie las lea como un ranking.
 */

const COLOR_MODO: Record<Modo, string> = {
  overall: '#E2542A',
  solo: '#3D82C4',
  duo: '#3A9E59',
  squad: '#A47BE8',
  ltm: '#1BA8A0',
}

const NOMBRE_MODO: Record<Modo, string> = {
  overall: 'Total',
  solo: 'Solo',
  duo: 'Dúo',
  squad: 'Escuadra',
  ltm: 'Tiempo limitado',
}

const COLOR_ENTRADA: Record<Entrada, string> = {
  all: '#E2542A',
  keyboardMouse: '#3D82C4',
  gamepad: '#A47BE8',
  touch: '#1BA8A0',
}

const NOMBRE_ENTRADA: Record<Entrada, string> = {
  all: 'Todo',
  keyboardMouse: 'Teclado y ratón',
  gamepad: 'Mando',
  touch: 'Táctil',
}

const num = (v: number | null | undefined, decimales = 0) =>
  typeof v === 'number' ? v.toLocaleString('es-CL', { maximumFractionDigits: decimales }) : '—'

const porcentaje = (v: number | null | undefined) =>
  typeof v === 'number' ? `${v.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—'

function tiempo(minutos: number | null | undefined): string {
  if (typeof minutos !== 'number' || minutos <= 0) return '—'
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `${horas} h`
  return `${Math.floor(horas / 24)} d ${horas % 24} h`
}

function hayDatos(m: StatsModo | undefined): m is StatsModo {
  return Boolean(m && (m.matches ?? 0) > 0)
}

/**
 * Los puestos que entrega la API cambian según el modo: en solo son top 10 y
 * top 25, en dúo top 5 y top 12, en escuadra top 3 y top 6. Por eso las dos
 * columnas de puestos se resuelven por modo, con su título, en vez de pedir
 * un campo fijo que en la mitad de los modos viene vacío.
 */
const PUESTOS_TEMPRANOS = ['top3', 'top5', 'top10'] as const
const PUESTOS_TARDIOS = ['top6', 'top12', 'top25'] as const

function puesto(m: StatsModo, campos: readonly (keyof StatsModo)[]): { titulo: string; valor: number | null } {
  for (const campo of campos) {
    const valor = m[campo]
    if (typeof valor === 'number') return { titulo: `Top ${campo.replace('top', '')}`, valor }
  }
  return { titulo: `Top ${campos.map((c) => String(c).replace('top', '')).join('/')}`, valor: null }
}

/** Las cuatro columnas fijas. Las dos de puestos se agregan por modo. */
const METRICAS = [
  { clave: 'wins', titulo: 'Victorias', formato: (m: StatsModo) => num(m.wins), valor: (m: StatsModo) => m.wins },
  {
    clave: 'winRate',
    titulo: '% victorias',
    formato: (m: StatsModo) => porcentaje(m.winRate),
    valor: (m: StatsModo) => m.winRate,
  },
  {
    clave: 'kills',
    titulo: 'Eliminaciones',
    formato: (m: StatsModo) => num(m.kills),
    valor: (m: StatsModo) => m.kills,
  },
  { clave: 'kd', titulo: 'K/D', formato: (m: StatsModo) => num(m.kd, 2), valor: (m: StatsModo) => m.kd },
] as const

export function AvisoSinStats({ motivo, nick }: { motivo: MotivoSinStats; nick: string }) {
  const textos: Record<MotivoSinStats, { titulo: string; detalle: string }> = {
    privadas: {
      titulo: 'Estadísticas privadas',
      detalle:
        `La cuenta ${nick} existe, pero tiene sus estadísticas ocultas en Fortnite, así que nadie puede verlas ` +
        'desde fuera del juego. Se activan en Carrera → Ajustes de cuenta y privacidad → Mostrar en tabla de ' +
        'clasificación. En cuanto estén públicas aparecen acá solas.',
    },
    'sin-partidas': {
      titulo: 'Sin partidas registradas',
      detalle: `La cuenta ${nick} existe pero todavía no tiene ninguna partida jugada.`,
    },
    'no-existe': {
      titulo: 'Cuenta no encontrada',
      detalle: `No existe ninguna cuenta de Epic con el nick ${nick}.`,
    },
    'no-disponible': {
      titulo: 'Estadísticas no disponibles',
      detalle:
        'El proveedor de estadísticas no está respondiendo en este momento. No es problema de esta cuenta: ' +
        'vuelve a intentarlo en unos minutos.',
    },
  }
  const { titulo, detalle } = textos[motivo]

  return (
    <section className="bloque border-l-2 border-l-podio p-5">
      <h2 className="text-[13px] font-semibold">{titulo}</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-humo">{detalle}</p>
    </section>
  )
}

/** Indicador de cabecera: una cifra grande con su barra de color al canto. */
function Indicador({ titulo, valor, apoyo, color }: { titulo: string; valor: string; apoyo: string; color: string }) {
  return (
    <div className="flex gap-3 bg-panel p-4">
      <span className="w-[3px] shrink-0" style={{ backgroundColor: color }} aria-hidden />
      <div className="min-w-0">
        <p className="etiqueta">{titulo}</p>
        <p className="mt-0.5 font-dato text-[26px] leading-none">{valor}</p>
        <p className="etiqueta mt-1.5 truncate">{apoyo}</p>
      </div>
    </div>
  )
}

/** Una métrica dentro de la tarjeta de un modo: número y barra comparativa. */
function Metrica({ titulo, texto, parte, color }: { titulo: string; texto: string; parte: number; color: string }) {
  return (
    <div>
      <p className="etiqueta">{titulo}</p>
      <p className="mt-0.5 font-dato text-[15px] leading-none">{texto}</p>
      <div className="mt-1.5 h-[3px] w-full bg-panelAlt">
        <div className="h-full" style={{ width: `${Math.max(parte * 100, 2)}%`, backgroundColor: color }} />
      </div>
    </div>
  )
}

function TarjetaModo({
  nombre,
  color,
  stats,
  tope,
}: {
  nombre: string
  color: string
  stats: StatsModo
  tope: Record<string, number>
}) {
  return (
    <article className="grid gap-px bg-linea sm:grid-cols-[170px_1fr]">
      <div className="flex items-center justify-between gap-3 p-4 sm:flex-col sm:items-start sm:justify-center" style={{ backgroundColor: `${color}1F` }}>
        <p className="text-[15px] font-bold uppercase tracking-wide" style={{ color }}>
          {nombre}
        </p>
        <p className="etiqueta">
          <span className="font-dato">{num(stats.matches)}</span> partidas
        </p>
      </div>
      <div className="grid grid-cols-3 gap-x-5 gap-y-4 bg-panel p-4 lg:grid-cols-6">
        {METRICAS.map((m) => {
          const max = tope[m.clave] ?? 0
          return (
            <Metrica
              key={m.clave}
              titulo={m.titulo}
              texto={m.formato(stats)}
              parte={max > 0 ? (m.valor(stats) ?? 0) / max : 0}
              color={color}
            />
          )
        })}
        {[puesto(stats, PUESTOS_TEMPRANOS), puesto(stats, PUESTOS_TARDIOS)].map((p, i) => (
          <Metrica
            key={p.titulo + i}
            titulo={p.titulo}
            texto={num(p.valor)}
            parte={(tope.puestos ?? 0) > 0 ? (p.valor ?? 0) / (tope.puestos ?? 1) : 0}
            color={color}
          />
        ))}
      </div>
    </article>
  )
}

function TablaDetalle({ titulo, filas }: { titulo: string; filas: [string, StatsModo][] }) {
  return (
    <div className="mt-5">
      <p className="etiqueta mb-1">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>{titulo === 'Por modo' ? 'Modo' : 'Dispositivo'}</th>
              <th className="num">Partidas</th>
              <th className="num">Victorias</th>
              <th className="num">% vict.</th>
              <th className="num">Elim.</th>
              <th className="num">K/D</th>
              <th className="num">Elim./part.</th>
              <th className="num">Top 10</th>
              <th className="num">Puntaje</th>
              <th className="num">Tiempo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(([nombre, m]) => (
              <tr key={nombre}>
                <td>{nombre}</td>
                <td className="num">{num(m.matches)}</td>
                <td className="num">{num(m.wins)}</td>
                <td className="num">{porcentaje(m.winRate)}</td>
                <td className="num">{num(m.kills)}</td>
                <td className="num">{num(m.kd, 2)}</td>
                <td className="num">{num(m.killsPerMatch, 2)}</td>
                <td className="num">{num(m.top10)}</td>
                <td className="num">{num(m.score)}</td>
                <td className="num">{tiempo(m.minutesPlayed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StatsFortnite({
  stats,
  titulo = 'Estadísticas de Fortnite',
}: {
  stats: Pick<StatsJugador, 'detalle' | 'nivelPase'>
  titulo?: string
}) {
  const total = stats.detalle.all?.overall
  if (!total) return null

  const modos = (['solo', 'duo', 'squad', 'ltm'] as Modo[])
    .map((m) => ({ clave: m, nombre: NOMBRE_MODO[m], color: COLOR_MODO[m], stats: stats.detalle.all?.[m] }))
    .filter((m): m is { clave: Modo; nombre: string; color: string; stats: StatsModo } => hayDatos(m.stats))
    .sort((a, b) => (b.stats.matches ?? 0) - (a.stats.matches ?? 0))

  const dispositivos = (['keyboardMouse', 'gamepad', 'touch'] as Entrada[])
    .map((e) => ({ nombre: NOMBRE_ENTRADA[e], color: COLOR_ENTRADA[e], stats: stats.detalle[e]?.overall }))
    .filter((e): e is { nombre: string; color: string; stats: StatsModo } => hayDatos(e.stats))
    .sort((a, b) => (b.stats.matches ?? 0) - (a.stats.matches ?? 0))

  // El tope de cada columna, para que las barras de una misma métrica se
  // puedan comparar entre modos. Se calcula por lista y no entre las dos.
  const topes = (lista: { stats: StatsModo }[]) => ({
    ...Object.fromEntries(METRICAS.map((m) => [m.clave, Math.max(...lista.map((x) => m.valor(x.stats) ?? 0), 0)])),
    puestos: Math.max(
      ...lista.flatMap((x) => [puesto(x.stats, PUESTOS_TEMPRANOS).valor ?? 0, puesto(x.stats, PUESTOS_TARDIOS).valor ?? 0]),
      0,
    ),
  })

  const topeModos = topes(modos)
  const topeDispositivos = topes(dispositivos)

  // Reparto de las partidas. Los puestos no son acumulativos: cada modo
  // anota el suyo (solo el top 10, dúo el top 5, escuadra el top 3), así que
  // se suman tal cual en vez de restarse entre ellos.
  const partidas = total.matches ?? 0
  const ganadas = total.wins ?? 0
  const suma = (campos: readonly (keyof StatsModo)[]) =>
    campos.reduce<number>((acc, c) => acc + (typeof total[c] === 'number' ? (total[c] as number) : 0), 0)
  const tempranos = suma(PUESTOS_TEMPRANOS)
  const tardios = suma(PUESTOS_TARDIOS)
  const tramos = [
    { nombre: 'Victorias', valor: ganadas, color: '#E2542A' },
    { nombre: 'Top 3/5/10', valor: tempranos, color: '#A47BE8' },
    { nombre: 'Top 6/12/25', valor: tardios, color: '#3D82C4' },
    { nombre: 'Resto', valor: Math.max(partidas - ganadas - tempranos - tardios, 0), color: '#272E33' },
  ].filter((t) => t.valor > 0)

  return (
    <section className="space-y-px">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 bg-panel px-5 py-3">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide">{titulo}</h2>
        <p className="etiqueta">
          {tiempo(total.minutesPlayed)} jugadas
          {stats.nivelPase !== null ? ` · nivel ${num(stats.nivelPase)} del pase` : ''} ·{' '}
          {num(partidas)} partidas
        </p>
      </header>

      <div className="grid gap-px bg-linea sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          titulo="% de victorias"
          valor={porcentaje(total.winRate)}
          apoyo={`${num(ganadas)} victorias`}
          color="#E2542A"
        />
        <Indicador
          titulo="K/D"
          valor={num(total.kd, 2)}
          apoyo={`${num(total.deaths)} muertes`}
          color="#3D82C4"
        />
        <Indicador
          titulo="Eliminaciones"
          valor={num(total.kills)}
          apoyo={`${num(total.killsPerMatch, 2)} por partida`}
          color="#3A9E59"
        />
        <Indicador
          titulo="Top 10"
          valor={num(total.top10)}
          apoyo={`top 25: ${num(total.top25)}`}
          color="#A47BE8"
        />
      </div>

      {partidas > 0 && (
        <div className="bg-panel px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            {tramos.map((t) => (
              <span key={t.nombre} className="flex items-baseline gap-1.5 text-[13px]">
                <span className="h-2 w-2 translate-y-[-1px] rounded-[1px]" style={{ backgroundColor: t.color }} aria-hidden />
                {t.nombre} <span className="font-dato text-humo">{num(t.valor)}</span>
              </span>
            ))}
          </div>
          <div className="mt-2 flex h-2.5 w-full gap-[2px] overflow-hidden">
            {tramos.map((t) => (
              <span
                key={t.nombre}
                title={`${t.nombre}: ${num(t.valor)}`}
                style={{ width: `${(t.valor / partidas) * 100}%`, backgroundColor: t.color }}
              />
            ))}
          </div>
        </div>
      )}

      {modos.length > 0 && (
        <div className="space-y-px">
          <p className="etiqueta bg-panel px-5 pb-1 pt-3 uppercase tracking-wide">Por modo</p>
          {modos.map((m) => (
            <TarjetaModo key={m.clave} nombre={m.nombre} color={m.color} stats={m.stats} tope={topeModos} />
          ))}
        </div>
      )}

      {dispositivos.length > 0 && (
        <div className="space-y-px">
          <p className="etiqueta bg-panel px-5 pb-1 pt-3 uppercase tracking-wide">Por dispositivo</p>
          {dispositivos.map((d) => (
            <TarjetaModo key={d.nombre} nombre={d.nombre} color={d.color} stats={d.stats} tope={topeDispositivos} />
          ))}
        </div>
      )}

      <details className="bg-panel px-5 py-4">
        <summary className="cursor-pointer text-[13px] font-semibold">Todos los números</summary>
        <p className="etiqueta mt-2">
          Las barras de arriba comparan cada número con el mejor de tus propios modos, no con el resto de los
          jugadores.
        </p>
        {modos.length > 0 && (
          <TablaDetalle
            titulo="Por modo"
            filas={[[NOMBRE_MODO.overall, total], ...modos.map((m) => [m.nombre, m.stats] as [string, StatsModo])]}
          />
        )}
        {dispositivos.length > 0 && (
          <TablaDetalle
            titulo="Por dispositivo"
            filas={dispositivos.map((d) => [d.nombre, d.stats] as [string, StatsModo])}
          />
        )}
        {total.lastModified && (
          <p className="etiqueta mt-4">
            Última partida registrada: {new Date(total.lastModified).toLocaleDateString('es-CL')}
          </p>
        )}
      </details>
    </section>
  )
}
