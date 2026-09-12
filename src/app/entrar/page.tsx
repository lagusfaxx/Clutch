import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { signIn, auth } from '@/server/auth'
import { usuarioActual } from '@/server/auth'

export const metadata: Metadata = { title: 'Entrar' }

export default async function EntrarPage() {
  const sesion = await auth()
  const usuario = sesion ? await usuarioActual() : null
  if (usuario?.epicAccountId) redirect(`/j/${usuario.slug}`)

  return (
    <div className="bloque mx-auto max-w-[460px] p-6">
      {!usuario ? (
        <>
          <h1 className="text-cifra">Entra con Discord</h1>
          <p className="mt-2 text-[13px] text-humo">
            La comunidad ya vive en Discord, así que no inventamos otro registro. Tu cuenta de Clutch se crea sola al
            entrar.
          </p>
          <form
            action={async () => {
              'use server'
              await signIn('discord', { redirectTo: '/entrar' })
            }}
          >
            <button className="boton mt-4">Continuar con Discord</button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-cifra">Falta vincular Epic</h1>
          <p className="mt-2 text-[13px] text-humo">
            Sin cuenta de Epic vinculada no puedes inscribirte a ningún torneo. Es lo que nos permite tener una sola
            cuenta por persona y cortar el smurfing.
          </p>
          <p className="mt-2 text-[12px] text-humo">
            Se hace con el login oficial de Epic. Nunca te vamos a pedir tu usuario ni tu contraseña de Epic.
          </p>
          <form
            action={async () => {
              'use server'
              await signIn('epic', { redirectTo: '/torneos' })
            }}
          >
            <button className="boton mt-4">Vincular cuenta de Epic</button>
          </form>
        </>
      )}
    </div>
  )
}
