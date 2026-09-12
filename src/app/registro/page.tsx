import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/server/auth'
import { FormularioRegistro } from '@/components/FormulariosCuenta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Crea tu cuenta en Clutch y empieza a competir en torneos de Fortnite con ranking persistente.',
}

export default async function RegistroPage() {
  const usuario = await usuarioActual()
  if (usuario) redirect('/cuenta')

  return (
    <div className="bloque mx-auto max-w-[460px] p-6">
      <h1 className="text-cifra">Crear cuenta</h1>
      <p className="mb-4 mt-1 text-[13px] text-humo">
        El nick de Epic lo verificamos contra Fortnite. Sin eso puedes mirar, pero no inscribirte a torneos.
      </p>
      <FormularioRegistro />
      <p className="mt-4 text-[12px] text-humo">
        Edad mínima 13 años. Si tienes menos de 18, para reclamar un premio físico vamos a pedirte el correo de tu
        apoderado.
      </p>
      <p className="mt-3 text-[13px] text-humo">
        ¿Ya tienes cuenta?{' '}
        <Link href="/entrar" className="text-brasa">
          Entra acá
        </Link>
      </p>
    </div>
  )
}
