import type { Entrada, Modo, StatsJugador, StatsModo, MotivoSinStats } from '@/server/services/fortnite/client'

/**
 * Ficha de estadísticas de Fortnite. Muestra todo lo que entrega la API:
 * el total, el desglose por modo y el desglose por dispositivo.
 *
 * Los modos vacíos no se dibujan. Un jugador de escuadra no necesita ver
 * tres tablas en cero para enterarse de que no juega solo.
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

const porcentaje = (v: number | null | undefined) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '—')

/** Los minutos jugados en horas, que es como la gente cuenta el tiempo. */
function tiempo(minutos: number | null | undefined): string {
  if (typeof minutos !== 'number' || minutos <= 0) return '—'
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h`
  return `${Math.floor(horas / 24)} d ${horas % 24} h`
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

function Celda({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="bg-panel p-4">
      <p className="etiqueta">{titulo}</p>
      <p className="cifra text-cifra">{valor}</p>
    </div>
  )
}

function TablaDeModos({ filas }: { filas: [string, StatsModo][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabla">
        <thead>
          <tr>
            <th>Modo</th>
            <th className="num">Partidas</th>
            <th className="num">Victorias</th>
            <th className="num">% victorias</th>
            <th className="num">Elim.</th>
            <th className="num">K/D</th>
            <th className="num">Elim./partida</th>
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
  )
}

export function StatsFortnite({ stats }: { stats: Pick<StatsJugador, 'detalle' | 'nivelPase'> }) {
  const total = stats.detalle.all?.overall

  const modos = (['solo', 'duo', 'squad', 'ltm'] as Modo[])
    .map((m) => [NOMBRE_MODO[m], stats.detalle.all?.[m]] as const)
    .filter((par): par is [string, StatsModo] => hayDatos(par[1]))

  const dispositivos = (['keyboardMouse', 'gamepad', 'touch'] as Entrada[])
    .map((e) => [NOMBRE_ENTRADA[e], stats.detalle[e]?.overall] as const)
    .filter((par): par is [string, StatsModo] => hayDatos(par[1]))

  if (!total) return null

  return (
    <div className="space-y-5">
      <section className="grid gap-px bg-linea sm:grid-cols-2 lg:grid-cols-4">
        <Celda titulo="Victorias" valor={num(total.wins)} />
        <Celda titulo="% de victorias" valor={porcentaje(total.winRate)} />
        <Celda titulo="K/D" valor={num(total.kd, 2)} />
        <Celda titulo="Eliminaciones" valor={num(total.kills)} />
        <Celda titulo="Partidas" valor={num(total.matches)} />
        <Celda titulo="Top 10" valor={num(total.top10)} />
        <Celda titulo="Tiempo jugado" valor={tiempo(total.minutesPlayed)} />
        <Celda
          titulo={stats.nivelPase !== null ? 'Nivel del pase' : 'Jugadores sobrevividos'}
          valor={stats.nivelPase !== null ? num(stats.nivelPase) : num(total.playersOutlived)}
        />
      </section>

      <section className="bloque p-5">
        <h2 className="text-[13px] font-semibold">Detalle</h2>
        <p className="etiqueta mt-1">
          Puntaje {num(total.score)} · {num(total.scorePerMatch, 1)} por partida · {num(total.deaths)} muertes ·{' '}
          {num(total.playersOutlived)} jugadores sobrevividos
        </p>

        {modos.length > 0 && (
          <div className="mt-4">
            <p className="etiqueta mb-1">Por modo</p>
            <TablaDeModos filas={modos} />
          </div>
        )}

        {dispositivos.length > 0 && (
          <div className="mt-5">
            <p className="etiqueta mb-1">Por dispositivo</p>
            <TablaDeModos filas={dispositivos} />
          </div>
        )}

        {total.lastModified && (
          <p className="etiqueta mt-4">
            Última partida registrada: {new Date(total.lastModified).toLocaleDateString('es-CL')}
          </p>
        )}
      </section>
    </div>
  )
}
