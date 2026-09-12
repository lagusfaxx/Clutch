import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/server/auth'
import { verificacionDisponible } from '@/server/services/fortnite/client'
import { FormularioEpic, FormularioClave } from '@/components/FormulariosCuenta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Mi cuenta' }

export default async function CuentaPage() {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/entrar')

  const apiViva = await verificacionDisponible()
  const verificado = Boolean(usuario.epicAccountId)

  return (
    <div className="mx-auto max-w-[620px] space-y-4">
      <header className="bloque p-5">
        <h1 className="text-cifra">{usuario.displayName}</h1>
        <p className="mt-1 text-[13px] text-humo">
          {usuario.email} · cuenta {usuario.status.toLowerCase()}
        </p>
      </header>

      <section className="bloque p-5">
        <h2 className="text-[15px] font-semibold">Cuenta de Fortnite</h2>
        {verificado ? (
          <>
            <p className="mt-1 text-[13px] text-cal">
              Verificada como {usuario.epicNick}. Ya puedes inscribirte a torneos.
            </p>
            <p className="mt-2 text-[12px] text-humo">
              Si cambiaste de nick en el juego, vuelve a confirmarlo acá para que tus resultados sigan calzando.
            </p>
          </>
        ) : (
          <p className="mb-3 mt-1 text-[13px] text-humo">
            Escribe tu nick tal como aparece en Fortnite. Lo buscamos y guardamos el identificador de esa cuenta, para
            que una cuenta de Fortnite valga por una sola cuenta de Clutch.
          </p>
        )}
        <div className="mt-3">
          <FormularioEpic nickActual={usuario.epicNick} />
        </div>
        {!apiViva && (
          <p className="mt-3 border border-linea px-3 py-2 text-[12px] text-podio">
            La verificación automática no está disponible en este momento. Inténtalo en unos minutos o escríbenos y lo
            hacemos a mano.
          </p>
        )}
      </section>

      <section className="bloque p-5">
        <h2 className="text-[15px] font-semibold">Contraseña</h2>
        <div className="mt-3">
          <FormularioClave />
        </div>
      </section>

      <section className="bloque p-5">
        <h2 className="text-[15px] font-semibold">Tu perfil público</h2>
        <p className="mt-1 text-[13px] text-humo">
          Cualquiera puede ver tus resultados de torneo: sin eso el ranking no significa nada.
        </p>
        <Link href={`/j/${usuario.slug}`} className="boton-plano mt-3">
          Ver mi perfil
        </Link>
      </section>
    </div>
  )
}
