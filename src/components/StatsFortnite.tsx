import type { Entrada, Modo, StatsJugador, StatsModo, MotivoSinStats } from '@/server/services/fortnite/client'

/**
 * Ficha de estadísticas de Fortnite.
 *
 * La lectura va de lo general a lo particular: una cifra que manda, cuatro
 * indicadores de apoyo, el reparto por modo en barras y recién al final la
 * tabla con todo. Quien mira de pasada se lleva lo importante en un segundo;
 * quien viene a comparar números los tiene completos abajo.
 *
 * Las barras son de un solo color a propósito: acá no hay categorías que
 * distinguir, hay magnitudes que comparar, y para eso la intensidad de un
 * mismo tono se lee mejor que una paleta. Cada barra lleva su número escrito,
 * así que el color nunca es el único dato.
 */

const NOMBRE_MODO: Record<Modo, string> = {
  overall: 'Total',
  solo: 'Solo',
  duo: 'Dúo',
  squad: 'Escuadra',
  ltm: 'Por tiempo limitado',
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

/** Los minutos en horas o días, que es como la gente cuenta el tiempo. */
function tiempo(minutos: number | null | undefined): string {
  if (typeof minutos !== 'number' || minutos <= 0) return '—'
  const horas = Math.round(minutos / 60)
  if (horas < 48) return `${horas} h`
  return `${Math.floor(horas / 24)} d`
}

function hayDatos(m: StatsModo | undefined): m is StatsModo {
  return Boolean(m && (m.matches ?? 0) > 0)
}

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

function Indicador({ etiqueta, valor, apoyo }: { etiqueta: string; valor: string; apoyo?: string }) {
  return (
    <div className="bg-panel p-4">
      <p className="etiqueta">{etiqueta}</p>
      <p className="mt-1 font-dato text-[24px] leading-none">{valor}</p>
      {apoyo && <p className="etiqueta mt-1.5">{apoyo}</p>}
    </div>
  )
}

/**
 * Barra de magnitud. El relleno llega hasta su parte del máximo de la lista,
 * nunca hasta el borde, para que dos barras se puedan comparar de un vistazo.
 */
function Barra({ nombre, valor, maximo, detalle }: { nombre: string; valor: number; maximo: number; detalle: string }) {
  const ancho = maximo > 0 ? Math.max((valor / maximo) * 100, 1.5) : 0

  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-4 text-[13px]">
        <span>{nombre}</span>
        <span className="font-dato text-humo">{detalle}</span>
      </div>
      <div className="mt-1 h-1.5 w-full bg-panelAlt">
        <div className="h-full rounded-r-[2px] bg-brasa" style={{ width: `${ancho}%` }} />
      </div>
    </div>
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
    .map((m) => [NOMBRE_MODO[m], stats.detalle.all?.[m]] as const)
    .filter((par): par is [string, StatsModo] => hayDatos(par[1]))

  const dispositivos = (['keyboardMouse', 'gamepad', 'touch'] as Entrada[])
    .map((e) => [NOMBRE_ENTRADA[e], stats.detalle[e]?.overall] as const)
    .filter((par): par is [string, StatsModo] => hayDatos(par[1]))

  const maxPartidas = Math.max(...modos.map(([, m]) => m.matches ?? 0), 0)
  const maxDispositivo = Math.max(...dispositivos.map(([, m]) => m.matches ?? 0), 0)

  // El porcentaje de victorias contra un tope de 10%: por encima de eso ya es
  // un jugador excepcional, y una barra sobre 100 dejaría a todo el mundo
  // pegado en el borde izquierdo sin poder distinguir nada.
  const tope = 10
  const avance = Math.min(((total.winRate ?? 0) / tope) * 100, 100)

  return (
    <section className="space-y-px">
      <div className="bloque flex flex-wrap items-end justify-between gap-6 p-5">
        <div>
          <p className="etiqueta">{titulo}</p>
          <p className="mt-2 text-[52px] font-bold leading-none tracking-tight">{num(total.wins)}</p>
          <p className="mt-1 text-[13px] text-humo">
            victorias en {num(total.matches)} partidas
            {stats.nivelPase !== null ? ` · nivel ${num(stats.nivelPase)} del pase` : ''}
          </p>
        </div>

        <div className="min-w-[220px] flex-1">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="etiqueta">Porcentaje de victorias</span>
            <span className="font-dato">{porcentaje(total.winRate)}</span>
          </div>
          <div className="mt-1.5 h-2 w-full bg-panelAlt">
            <div className="h-full rounded-r-[2px] bg-brasa" style={{ width: `${avance}%` }} />
          </div>
          <p className="etiqueta mt-1">sobre 10%, que ya es nivel excepcional</p>
        </div>
      </div>

      <div className="grid gap-px bg-linea sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          etiqueta="K/D"
          valor={num(total.kd, 2)}
          apoyo={`${num(total.kills)} elim. · ${num(total.deaths)} muertes`}
        />
        <Indicador
          etiqueta="Eliminaciones por partida"
          valor={num(total.killsPerMatch, 2)}
          apoyo={`${num(total.playersOutlived)} jugadores sobrevividos`}
        />
        <Indicador etiqueta="Top 10" valor={num(total.top10)} apoyo={`top 25: ${num(total.top25)}`} />
        <Indicador
          etiqueta="Tiempo jugado"
          valor={tiempo(total.minutesPlayed)}
          apoyo={`${num(total.score)} puntos en total`}
        />
      </div>

      {(modos.length > 0 || dispositivos.length > 0) && (
        <div className="bloque grid gap-8 p-5 md:grid-cols-2">
          {modos.length > 0 && (
            <div>
              <p className="etiqueta mb-2">Partidas por modo</p>
              {modos.map(([nombre, m]) => (
                <Barra
                  key={nombre}
                  nombre={nombre}
                  valor={m.matches ?? 0}
                  maximo={maxPartidas}
                  detalle={`${num(m.matches)} · ${num(m.wins)} victorias`}
                />
              ))}
            </div>
          )}

          {dispositivos.length > 0 && (
            <div>
              <p className="etiqueta mb-2">Partidas por dispositivo</p>
              {dispositivos.map(([nombre, m]) => (
                <Barra
                  key={nombre}
                  nombre={nombre}
                  valor={m.matches ?? 0}
                  maximo={maxDispositivo}
                  detalle={`${num(m.matches)} · K/D ${num(m.kd, 2)}`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <details className="bloque p-5">
        <summary className="cursor-pointer text-[13px] font-semibold">Todos los números</summary>
        {modos.length > 0 && <TablaDetalle titulo="Por modo" filas={[[NOMBRE_MODO.overall, total], ...modos]} />}
        {dispositivos.length > 0 && <TablaDetalle titulo="Por dispositivo" filas={dispositivos} />}
        {total.lastModified && (
          <p className="etiqueta mt-4">
            Última partida registrada: {new Date(total.lastModified).toLocaleDateString('es-CL')}
          </p>
        )}
      </details>
    </section>
  )
}
