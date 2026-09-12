import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import Link from 'next/link'
import '@/styles/globals.css'
import { Buscador } from '@/components/Buscador'
import { auth } from '@/server/auth'

/*
  Dos familias, elegidas a propósito:
  Archivo (grotesca cerrada, con peso real en los títulos) para todo el
  texto, IBM Plex Mono para cualquier número que se compare entre filas.
*/
const display = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--fuente-display',
  display: 'swap',
})

const dato = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--fuente-dato',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'https://clutch.cl'),
  title: { default: 'Clutch · torneos y ranking de Fortnite en Chile', template: '%s · Clutch' },
  description:
    'Torneos de Fortnite con ranking persistente, premios en V-Bucks y periféricos. Inscripción en pesos, soporte en español.',
  openGraph: { siteName: 'Clutch', locale: 'es_CL', type: 'website' },
}

export const viewport: Viewport = { themeColor: '#0e1113' }

const enlaces = [
  { href: '/ranking', texto: 'Ranking' },
  { href: '/torneos', texto: 'Torneos' },
  { href: '/comparar', texto: 'Comparar' },
]

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sesion = await auth()

  return (
    <html lang="es-CL" className={`${display.variable} ${dato.variable}`}>
      <body className="bg-carbon bg-ruido text-hueso">
        <header className="border-b border-linea">
          <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/" className="text-[19px] font-bold tracking-tight">
              CLUTCH<span className="text-brasa">.</span>
            </Link>
            <nav className="flex gap-5 text-[13px] text-humo">
              {enlaces.map((e) => (
                <Link key={e.href} href={e.href} className="hover:text-brasa">
                  {e.texto}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-4">
              <Buscador />
              {sesion?.user ? (
                <Link
                  href={sesion.user.estado === 'PENDING' ? '/cuenta' : `/j/${sesion.user.slug}`}
                  className="text-[13px] font-medium"
                >
                  {sesion.user.estado === 'PENDING' ? 'Verifica tu nick' : (sesion.user.name ?? 'Mi perfil')}
                </Link>
              ) : (
                <Link href="/entrar" className="boton text-[13px]">
                  Entrar
                </Link>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1180px] px-4 py-6">{children}</main>

        <footer className="mt-12 border-t border-linea">
          <div className="mx-auto max-w-[1180px] px-4 py-6 text-[12px] leading-relaxed text-humo">
            <p>
              Clutch es una plataforma independiente de torneos. No está asociada, patrocinada ni avalada por Epic
              Games. Fortnite es una marca de Epic Games, Inc.
            </p>
            <p className="mt-2">
              Premios en V-Bucks y periféricos. Nunca dinero en efectivo ni transferencias.{' '}
              <Link href="/reglas" className="underline">
                Reglas y bases
              </Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
