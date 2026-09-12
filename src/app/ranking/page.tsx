import Link from 'next/link'
import type { Metadata } from 'next'
import { tablaPublica, temporadaActiva, MINIMO_TORNEOS_TABLA } from '@/server/services/ranking'
import { TablaRanking } from '@/components/Marcador'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Ranking de Fortnite competitivo en Chile',
  description: 'Tabla Glicko-2 por temporada, modo y región. Solo torneos jugados en Clutch.',
}

const MODOS = ['SOLO', 'DUO', 'SQUAD'] as const
const REGIONES = ['RM', 'Valparaíso', 'Biobío', 'Maule', 'Antofagasta', 'Araucanía', 'Los Lagos']

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ modo?: string; region?: string }>
}) {
  const { modo, region } = await searchParams
  const [temporada, filas] = await Promise.all([
    temporadaActiva('FORTNITE'),
    tablaPublica({
      game: 'FORTNITE',
      mode: MODOS.includes(modo as (typeof MODOS)[number]) ? (modo as (typeof MODOS)[number]) : undefined,
      region: region ?? undefined,
      limite: 100,
    }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-cifra">Ranking{temporada ? ` · ${temporada.name}` : ''}</h1>
        <p className="text-[12px] text-humo">
          Glicko-2 por modo. Mínimo {MINIMO_TORNEOS_TABLA} torneos para aparecer. Decay de 15 puntos cada 30 días sin
          competir.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 border-y border-linea py-2 text-[12px]">
        <Filtros titulo="Modo" base="/ranking" param="modo" actual={modo} opciones={[...MODOS]} otros={{ region }} />
        <Filtros titulo="Región" base="/ranking" param="region" actual={region} opciones={REGIONES} otros={{ modo }} />
      </div>

      <div className="bloque">
        <TablaRanking filas={filas} />
      </div>
    </div>
  )
}

function Filtros({
  titulo,
  base,
  param,
  actual,
  opciones,
  otros,
}: {
  titulo: string
  base: string
  param: string
  actual?: string
  opciones: string[]
  otros: Record<string, string | undefined>
}) {
  const link = (valor?: string) => {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(otros)) if (v) q.set(k, v)
    if (valor) q.set(param, valor)
    const s = q.toString()
    return s ? `${base}?${s}` : base
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-humo">{titulo}</span>
      <Link href={link()} className={!actual ? 'text-brasa' : 'text-humo'}>
        Todos
      </Link>
      {opciones.map((o) => (
        <Link key={o} href={link(o)} className={actual === o ? 'text-brasa' : 'text-humo'}>
          {o}
        </Link>
      ))}
    </div>
  )
}
