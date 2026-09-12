import Link from 'next/link'
import { redirect } from 'next/navigation'
import { usuarioActual } from '@/server/auth'

export const dynamic = 'force-dynamic'

const secciones = [
  { href: '/admin', texto: 'Revisión' },
  { href: '/admin/torneos', texto: 'Torneos' },
  { href: '/admin/premios', texto: 'Premios' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual()
  if (!usuario) redirect('/entrar')
  if (!usuario.isAdmin) redirect('/')

  return (
    <div className="space-y-4">
      <nav className="flex gap-5 border-b border-linea pb-2 text-[13px]">
        {secciones.map((s) => (
          <Link key={s.href} href={s.href} className="text-humo hover:text-brasa">
            {s.texto}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
