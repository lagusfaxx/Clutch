'use client'

import { useState, useTransition } from 'react'
import { accionCargarCodigos, accionMarcarEnviado } from '@/app/admin/actions'

type Respuesta = { ok: true; mensaje?: string } | { ok: false; mensaje: string }

const campo = 'border border-linea bg-carbon px-2 py-1 text-[13px]'

export function FormularioCodigos() {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const enviar = (datos: FormData) =>
    iniciar(async () => {
      const r: Respuesta = await accionCargarCodigos(datos)
      setMensaje(r.ok ? (r.mensaje ?? 'Listo.') : r.mensaje)
    })

  return (
    <form action={enviar} className="grid gap-2">
      <textarea
        name="codigos"
        required
        placeholder="Un código por línea"
        className={`${campo} min-h-[110px] font-[var(--fuente-dato)]`}
      />
      <div className="flex gap-2">
        <input name="faceValue" type="number" min={0} placeholder="V-Bucks por código" required className={`${campo} cifra`} />
        <input name="batchRef" placeholder="Referencia del lote" className={campo} />
      </div>
      <button className="boton" disabled={pendiente}>
        Cargar y cifrar
      </button>
      {mensaje && <p className="text-[12px] text-brasa">{mensaje}</p>}
    </form>
  )
}

export function FormularioEnvio({ claimId }: { claimId: string }) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  const enviar = (datos: FormData) =>
    iniciar(async () => {
      const r: Respuesta = await accionMarcarEnviado(datos)
      setMensaje(r.ok ? (r.mensaje ?? 'Listo.') : r.mensaje)
    })

  return (
    <form action={enviar} className="flex gap-2">
      <input type="hidden" name="claimId" value={claimId} />
      <input name="tracking" placeholder="N° de seguimiento" required className={`${campo} w-[150px]`} />
      <button className="boton-plano px-2 py-1 text-[12px]" disabled={pendiente}>
        Marcar enviado
      </button>
      {mensaje && <span className="text-[11px] text-brasa">{mensaje}</span>}
    </form>
  )
}
