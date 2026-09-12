'use client'

import { useState, useTransition } from 'react'
import {
  accionResolverResultado,
  accionResolverDisputa,
  accionPublicarTorneo,
  accionAsignarPremios,
  accionVincularEpicManual,
} from '@/app/admin/actions'

type Respuesta = { ok: true; mensaje?: string } | { ok: false; mensaje: string }

function useAccion() {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const correr = (fn: () => Promise<Respuesta>) =>
    iniciar(async () => {
      const r = await fn()
      setMensaje(r.ok ? (r.mensaje ?? 'Listo.') : r.mensaje)
    })
  return { mensaje, pendiente, correr }
}

export function BotonResultado({
  resultadoId,
  decision,
  texto,
}: {
  resultadoId: string
  decision: 'VERIFICADO' | 'RECHAZADO'
  texto: string
}) {
  const { mensaje, pendiente, correr } = useAccion()
  return (
    <span>
      <button
        className="boton-plano px-2 py-1 text-[12px]"
        disabled={pendiente}
        onClick={() => {
          const nota = window.prompt('Motivo de la decisión (queda en la bitácora pública):') ?? ''
          correr(() => accionResolverResultado(resultadoId, decision, nota))
        }}
      >
        {texto}
      </button>
      {mensaje && <span className="ml-2 text-[11px] text-brasa">{mensaje}</span>}
    </span>
  )
}

export function FormularioResolucion({ disputaId }: { disputaId: string }) {
  const { mensaje, pendiente, correr } = useAccion()
  return (
    <form action={(datos) => correr(() => accionResolverDisputa(datos))} className="mt-3 flex flex-wrap gap-2">
      <input type="hidden" name="disputaId" value={disputaId} />
      <textarea
        name="resolucion"
        required
        minLength={20}
        placeholder="Qué se decidió y por qué. Esto queda público en la página del torneo."
        className="min-h-[60px] flex-1 border border-linea bg-carbon px-2 py-1 text-[13px]"
      />
      <select name="decision" className="h-[34px] border border-linea bg-carbon px-2 text-[13px]">
        <option value="RESUELTA">Acoger</option>
        <option value="DESESTIMADA">Desestimar</option>
      </select>
      <button className="boton h-[34px] py-0 text-[13px]" disabled={pendiente}>
        Resolver
      </button>
      {mensaje && <p className="w-full text-[12px] text-brasa">{mensaje}</p>}
    </form>
  )
}

export function BotonPublicar({ torneoId }: { torneoId: string }) {
  const { mensaje, pendiente, correr } = useAccion()
  return (
    <span>
      <button
        className="boton-plano px-2 py-1 text-[12px]"
        disabled={pendiente}
        onClick={() => correr(() => accionPublicarTorneo(torneoId))}
      >
        Abrir inscripciones
      </button>
      {mensaje && <span className="ml-2 text-[11px] text-brasa">{mensaje}</span>}
    </span>
  )
}

export function BotonAsignarPremios({ torneoId }: { torneoId: string }) {
  const { mensaje, pendiente, correr } = useAccion()
  return (
    <span>
      <button
        className="boton-plano px-2 py-1 text-[12px]"
        disabled={pendiente}
        onClick={() => correr(() => accionAsignarPremios(torneoId))}
      >
        Asignar premios
      </button>
      {mensaje && <span className="ml-2 text-[11px] text-brasa">{mensaje}</span>}
    </span>
  )
}

export function FormularioEpicManual({ userId }: { userId: string }) {
  const { mensaje, pendiente, correr } = useAccion()
  return (
    <form action={(datos) => correr(() => accionVincularEpicManual(datos))} className="flex flex-wrap gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input
        name="epicNick"
        required
        placeholder="Nick de Epic"
        className="w-[130px] border border-linea bg-carbon px-2 py-1 text-[13px]"
      />
      <input
        name="epicAccountId"
        required
        placeholder="accountId"
        className="w-[160px] border border-linea bg-carbon px-2 py-1 text-[13px]"
      />
      <button className="boton-plano px-2 py-1 text-[12px]" disabled={pendiente}>
        Verificar
      </button>
      {mensaje && <span className="text-[11px] text-brasa">{mensaje}</span>}
    </form>
  )
}
