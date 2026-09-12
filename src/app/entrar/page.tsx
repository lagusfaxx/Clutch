import Link from 'next/link'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/server/auth'
import { FormularioEntrar } from '@/components/FormulariosCuenta'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Entrar' }

export default async function EntrarPage() {
  const usuario = await usuarioActual()
  if (usuario) redirect(usuario.epicAccountId ? `/j/${usuario.slug}` : '/cuenta')

  return (
    <div className="bloque mx-auto max-w-[420px] p-6">
      <h1 className="text-cifra">Entrar</h1>
      <p className="mb-4 mt-1 text-[13px] text-humo">Con tu correo y contraseña.</p>
      <FormularioEntrar />
      <p className="mt-4 text-[13px] text-humo">
        ¿No tienes cuenta?{' '}
        <Link href="/registro" className="text-brasa">
          Créala acá
        </Link>
      </p>
    </div>
  )
}
