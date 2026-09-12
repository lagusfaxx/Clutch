import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reglas y bases',
  description: 'Cómo funcionan los torneos, el ranking, los reportes, las disputas y los premios en Clutch.',
}

const secciones = [
  {
    titulo: 'Cuentas',
    puntos: [
      'Te registras con tu correo y confirmas tu nick de Epic. Sin ese nick confirmado no puedes inscribirte.',
      'Una cuenta de Fortnite vale por una sola cuenta de Clutch. Las cuentas duplicadas se cierran.',
      'Edad mínima 13 años. Si tienes menos de 18, para reclamar un premio físico necesitamos el email de tu apoderado.',
      'El RUT se pide recién al momento de entregar un premio, para dejar registro de la entrega.',
    ],
  },
  {
    titulo: 'Inscripción y check-in',
    puntos: [
      'El check-in abre 30 minutos antes del inicio. Si no haces check-in pierdes el cupo y entra el primero de la lista de espera.',
      'La lista de espera avanza por orden de llegada, automáticamente.',
      'Si te bajas hasta 2 horas antes del inicio y el torneo era pagado, te devolvemos la plata. Después de esa hora, no.',
      'No presentarse suma un strike. Tres strikes en 60 días son dos semanas de suspensión.',
    ],
  },
  {
    titulo: 'Resultados',
    puntos: [
      'Tienes 30 minutos desde que termina la partida para reportar posición y eliminaciones, con screenshot.',
      'El screenshot tiene que mostrar la posición, las eliminaciones y tu nick visible.',
      'En escuadras, si los reportes del equipo no calzan entre sí, el resultado se va a revisión.',
      'Si dos equipos reclaman el mismo puesto en la misma partida, los dos van a revisión.',
      'Los puntos los calcula el servidor con la tabla del torneo. Nunca se aceptan puntos enviados por el jugador.',
    ],
  },
  {
    titulo: 'Disputas',
    puntos: [
      'Tienes 2 horas después del cierre para impugnar un resultado, siempre con evidencia.',
      'Mientras haya una disputa abierta, los premios del torneo quedan retenidos.',
      'Cada decisión de un admin queda en la bitácora pública del torneo: quién, cuándo, qué decidió y por qué.',
    ],
  },
  {
    titulo: 'Ranking',
    puntos: [
      'Usamos Glicko-2, separado por juego y por modo. No mezclamos Solo con Dúo ni con Escuadra.',
      'Necesitas 5 torneos para aparecer en la tabla pública.',
      'Si dejas de competir, pierdes 15 puntos cada 30 días.',
      'Ganar un torneo grande suma más que ganar uno chico, pero no proporcionalmente: el peso crece de forma logarítmica.',
      'Cada temporada dura 3 meses. Al cerrar, los puntos se comprimen hacia la media y la temporada queda archivada en tu perfil.',
    ],
  },
  {
    titulo: 'Premios',
    puntos: [
      'Entregamos V-Bucks y periféricos. Nunca dinero en efectivo ni transferencias.',
      'El código de V-Bucks se muestra una sola vez. Cópialo apenas lo veas: después no se vuelve a mostrar.',
      'Los premios físicos se despachan con seguimiento. Necesitamos tu dirección y tu RUT.',
      'Compramos los códigos solo a distribuidores autorizados.',
    ],
  },
]

export default function ReglasPage() {
  return (
    <div className="max-w-[76ch] space-y-6">
      <header>
        <h1 className="text-marcador">Reglas y bases</h1>
        <p className="mt-2 text-[13px] text-humo">
          Escritas para leerlas rápido antes de un torneo, no para esconder nada en letra chica.
        </p>
      </header>

      {secciones.map((seccion) => (
        <section key={seccion.titulo} className="bloque p-5">
          <h2 className="text-[15px] font-semibold">{seccion.titulo}</h2>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {seccion.puntos.map((punto) => (
              <li key={punto} className="text-humo">
                {punto}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
