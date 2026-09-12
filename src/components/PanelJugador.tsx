'use client'

import { useState, useTransition } from 'react'
import { accionInscribir, accionCancelar, accionCheckIn, accionReportar } from '@/app/torneos/[slug]/actions'

type Respuesta = { ok: true } | { ok: false; mensaje: string }

interface Props {
  torneoId: string
  slug: string
  estadoInscripcion: string | null
  checkInAbierto: boolean
  inscripcionesAbiertas: boolean
  partidas: { id: string; index: number; reportado: boolean }[]
}

/**
 * Los errores hablan directo: qué pasó y qué hacer. Nada de "algo salió mal".
 */
export function PanelJugador(props: Props) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const correr = (fn: () => Promise<Respuesta>) => {
    setMensaje(null)
    iniciar(async () => {
      const r = await fn()
      setMensaje(r.ok ? 'Listo.' : r.mensaje)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {props.estadoInscripcion === null && props.inscripcionesAbiertas && (
          <button
            className="boton"
            disabled={pendiente}
            onClick={() => correr(() => accionInscribir(props.torneoId, props.slug))}
          >
            Inscríbete
          </button>
        )}
        {props.estadoInscripcion !== null && props.estadoInscripcion !== 'RETIRADA' && (
          <>
            {props.checkInAbierto && props.estadoInscripcion === 'CONFIRMADA' && (
              <button
                className="boton"
                disabled={pendiente}
                onClick={() => correr(() => accionCheckIn(props.torneoId, props.slug))}
              >
                Hacer check-in
              </button>
            )}
            <button
              className="boton-plano"
              disabled={pendiente}
              onClick={() => correr(() => accionCancelar(props.torneoId, props.slug))}
            >
              Bajarme del torneo
            </button>
          </>
        )}
      </div>

      {props.estadoInscripcion === 'CHECKED_IN' && props.partidas.length > 0 && (
        <form
          action={(datos) => correr(() => accionReportar(props.slug, datos))}
          className="grid gap-2 border border-linea p-3 sm:grid-cols-[110px_90px_90px_1fr_auto]"
        >
          <select name="matchId" className="border border-linea bg-carbon px-2 py-1 text-[13px]" required>
            {props.partidas.map((p) => (
              <option key={p.id} value={p.id}>
                Partida {p.index}
                {p.reportado ? ' (reportada)' : ''}
              </option>
            ))}
          </select>
          <input
            name="placement"
            type="number"
            min={1}
            placeholder="Posición"
            required
            className="cifra border border-linea bg-carbon px-2 py-1 text-[13px]"
          />
          <input
            name="eliminations"
            type="number"
            min={0}
            placeholder="Elims"
            required
            className="cifra border border-linea bg-carbon px-2 py-1 text-[13px]"
          />
          <input
            name="evidenceUrl"
            type="url"
            placeholder="Link del screenshot del resultado"
            required
            className="border border-linea bg-carbon px-2 py-1 text-[13px]"
          />
          <button className="boton" disabled={pendiente}>
            Reportar
          </button>
          <p className="col-span-full text-[12px] text-humo">
            El screenshot tiene que mostrar posición, eliminaciones y tu nick. Tienes 30 minutos desde que termina la
            partida.
          </p>
        </form>
      )}

      {mensaje && <p className="text-[13px] text-brasa">{mensaje}</p>}
    </div>
  )
}
