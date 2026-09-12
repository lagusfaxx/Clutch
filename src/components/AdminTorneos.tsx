'use client'

import { useState, useTransition } from 'react'
import { accionCrearTorneo, accionClonarTorneo } from '@/app/admin/actions'

type Respuesta = { ok: true; mensaje?: string } | { ok: false; mensaje: string }

const campo = 'border border-linea bg-carbon px-2 py-1 text-[13px]'

function useEnvio() {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const enviar = (fn: () => Promise<Respuesta>) =>
    iniciar(async () => {
      const r = await fn()
      setMensaje(r.ok ? (r.mensaje ?? 'Listo.') : r.mensaje)
    })
  return { mensaje, pendiente, enviar }
}

export function FormularioTorneo({ temporadas }: { temporadas: { id: string; name: string }[] }) {
  const { mensaje, pendiente, enviar } = useEnvio()

  return (
    <form action={(datos) => enviar(() => accionCrearTorneo(datos))} className="grid gap-2 sm:grid-cols-2">
      <input name="name" placeholder="Nombre del torneo" required className={`${campo} sm:col-span-2`} />
      <label className="text-[12px] text-humo">
        Inicio
        <input name="startsAt" type="datetime-local" required className={`${campo} block w-full`} />
      </label>
      <label className="text-[12px] text-humo">
        Término
        <input name="endsAt" type="datetime-local" required className={`${campo} block w-full`} />
      </label>
      <select name="mode" className={campo} defaultValue="SOLO">
        <option value="SOLO">Solo</option>
        <option value="DUO">Dúos</option>
        <option value="SQUAD">Escuadras</option>
      </select>
      <select name="serverRegion" className={campo} defaultValue="BR">
        <option value="BR">Servidor BR</option>
        <option value="US-East">Servidor US-East</option>
        <option value="CL">Servidor CL</option>
      </select>
      <input name="maxSlots" type="number" min={2} placeholder="Cupo máximo" required className={`${campo} cifra`} />
      <input name="minSlots" type="number" min={0} placeholder="Cupo mínimo" defaultValue={0} className={`${campo} cifra`} />
      <input name="matchesTotal" type="number" min={1} placeholder="Partidas totales" defaultValue={8} className={`${campo} cifra`} />
      <input name="matchesCounted" type="number" min={1} placeholder="Partidas contadas" defaultValue={6} className={`${campo} cifra`} />
      <input name="entryFeeClp" type="number" min={0} placeholder="Inscripción CLP (0 = gratis)" defaultValue={0} className={`${campo} cifra`} />
      <select name="seasonId" className={campo} defaultValue="">
        <option value="">Sin temporada</option>
        {temporadas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button className="boton sm:col-span-2" disabled={pendiente}>
        Crear borrador
      </button>
      {mensaje && <p className="text-[12px] text-brasa sm:col-span-2">{mensaje}</p>}
    </form>
  )
}

export function FormularioClonar({ torneos }: { torneos: { id: string; name: string; slug: string }[] }) {
  const { mensaje, pendiente, enviar } = useEnvio()

  if (torneos.length === 0) return <p className="text-[13px] text-humo">Todavía no hay torneos para clonar.</p>

  return (
    <form action={(datos) => enviar(() => accionClonarTorneo(datos))} className="grid gap-2">
      <select name="tournamentId" className={campo} required>
        {torneos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <input name="name" placeholder="Nombre nuevo (opcional)" className={campo} />
      <label className="text-[12px] text-humo">
        Inicio
        <input name="startsAt" type="datetime-local" required className={`${campo} block w-full`} />
      </label>
      <label className="text-[12px] text-humo">
        Término
        <input name="endsAt" type="datetime-local" required className={`${campo} block w-full`} />
      </label>
      <button className="boton" disabled={pendiente}>
        Clonar
      </button>
      {mensaje && <p className="text-[12px] text-brasa">{mensaje}</p>}
    </form>
  )
}
