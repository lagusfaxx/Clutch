'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Resultado {
  tipo: 'clutch' | 'fantasma' | 'sugerencia'
  nick: string
  slug: string
  displayName: string
  rating?: number
}

/**
 * "Me mató Manuel, quiero ver qué tan bueno es." Ese es el loop de
 * crecimiento (§2.11): el buscador es feature de primera clase.
 * Debounce de 400ms, y el índice local responde antes de tocar la API.
 */
export function Buscador() {
  const [termino, setTermino] = useState('')
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [cargando, setCargando] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (termino.trim().length < 2) {
      setResultados([])
      return
    }
    const id = setTimeout(async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/v1/buscar?q=${encodeURIComponent(termino)}`)
        const json = (await res.json()) as { ok: boolean; datos?: Resultado[] }
        setResultados(json.ok ? (json.datos ?? []) : [])
      } finally {
        setCargando(false)
      }
    }, 400)
    return () => clearTimeout(id)
  }, [termino])

  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) setResultados([])
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  return (
    <div ref={contenedor} className="relative">
      <input
        value={termino}
        onChange={(e) => setTermino(e.target.value)}
        placeholder="Busca un nick"
        aria-label="Buscar jugador por nick"
        className="w-[190px] border border-linea bg-panel px-3 py-[7px] text-[13px] text-hueso outline-none placeholder:text-humo focus:border-brasa"
      />
      {termino.trim().length >= 2 && (
        <ul className="absolute right-0 top-[38px] z-20 w-[280px] border border-linea bg-panel">
          {cargando && <li className="px-3 py-2 text-[12px] text-humo">Buscando...</li>}
          {!cargando && resultados.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-humo">Nadie con ese nick, ni en Clutch ni en Fortnite.</li>
          )}
          {resultados.map((r) => (
            <li key={`${r.tipo}-${r.slug}`}>
              <button
                type="button"
                onClick={() => {
                  setTermino('')
                  setResultados([])
                  router.push(`/j/${r.slug}`)
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] hover:bg-panelAlt"
              >
                <span>
                  {r.displayName}
                  {r.tipo !== 'clutch' && <span className="ml-2 text-[11px] text-humo">no compite en Clutch</span>}
                </span>
                {r.rating !== undefined && <span className="cifra text-[12px] text-cal">{r.rating}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
