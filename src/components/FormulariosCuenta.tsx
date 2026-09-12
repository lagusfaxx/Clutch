'use client'

import { useState, useTransition } from 'react'
import type { Respuesta } from '@/app/entrar/actions'
import { accionEntrar, accionRegistrar, accionVincularEpic, accionCambiarClave } from '@/app/entrar/actions'

const campo =
  'w-full border border-linea bg-carbon px-3 py-2 text-[13px] text-hueso outline-none placeholder:text-humo focus:border-brasa'

function useFormulario() {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [pendiente, iniciar] = useTransition()

  const enviar = (fn: (datos: FormData) => Promise<Respuesta>) => (datos: FormData) =>
    iniciar(async () => {
      const r = await fn(datos)
      setError(!r.ok)
      setMensaje(r.ok ? (r.mensaje ?? 'Listo.') : r.mensaje)
    })

  const aviso = mensaje ? (
    <p className={`text-[13px] ${error ? 'text-alerta' : 'text-cal'}`} role="status">
      {mensaje}
    </p>
  ) : null

  return { enviar, aviso, pendiente }
}

export function FormularioEntrar() {
  const { enviar, aviso, pendiente } = useFormulario()
  return (
    <form action={enviar(accionEntrar)} className="grid gap-3">
      <input name="email" type="email" required autoComplete="email" placeholder="Tu correo" className={campo} />
      <input
        name="password"
        type="password"
        required
        autoComplete="current-password"
        placeholder="Tu contraseña"
        className={campo}
      />
      <button className="boton" disabled={pendiente}>
        {pendiente ? 'Entrando...' : 'Entrar'}
      </button>
      {aviso}
    </form>
  )
}

export function FormularioRegistro() {
  const { enviar, aviso, pendiente } = useFormulario()
  return (
    <form action={enviar(accionRegistrar)} className="grid gap-3">
      <input name="displayName" required minLength={2} maxLength={40} placeholder="Cómo quieres que te vean" className={campo} />
      <input name="email" type="email" required autoComplete="email" placeholder="Tu correo" className={campo} />
      <input
        name="password"
        type="password"
        required
        minLength={10}
        autoComplete="new-password"
        placeholder="Contraseña (mínimo 10 caracteres)"
        className={campo}
      />
      <input name="epicNick" placeholder="Tu nick de Epic, igual que en el juego" className={campo} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[12px] text-humo">
          Fecha de nacimiento
          <input name="birthDate" type="date" className={campo} />
        </label>
        <label className="text-[12px] text-humo">
          Región
          <select name="region" className={campo} defaultValue="">
            <option value="">Prefiero no decir</option>
            {['RM', 'Valparaíso', 'Biobío', 'Maule', 'Antofagasta', 'Araucanía', 'Los Lagos', 'Otra'].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="boton" disabled={pendiente}>
        {pendiente ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
      {aviso}
    </form>
  )
}

export function FormularioEpic({ nickActual }: { nickActual: string | null }) {
  const { enviar, aviso, pendiente } = useFormulario()
  return (
    <form action={enviar(accionVincularEpic)} className="flex flex-wrap gap-2">
      <input
        name="epicNick"
        required
        defaultValue={nickActual ?? ''}
        placeholder="Tu nick de Epic"
        className={`${campo} w-auto flex-1`}
      />
      <button className="boton" disabled={pendiente}>
        {pendiente ? 'Verificando...' : 'Confirmar nick'}
      </button>
      <div className="w-full">{aviso}</div>
    </form>
  )
}

export function FormularioClave() {
  const { enviar, aviso, pendiente } = useFormulario()
  return (
    <form action={enviar(accionCambiarClave)} className="grid max-w-[340px] gap-2">
      <input name="actual" type="password" required autoComplete="current-password" placeholder="Contraseña actual" className={campo} />
      <input name="nueva" type="password" required minLength={10} autoComplete="new-password" placeholder="Contraseña nueva" className={campo} />
      <button className="boton-plano" disabled={pendiente}>
        Cambiar contraseña
      </button>
      {aviso}
    </form>
  )
}
