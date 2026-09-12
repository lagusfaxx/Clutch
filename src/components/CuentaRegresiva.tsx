'use client'

import { useEffect, useState } from 'react'

function restante(hasta: number): { d: number; h: number; m: number; s: number } | null {
  const delta = hasta - Date.now()
  if (delta <= 0) return null
  return {
    d: Math.floor(delta / 86_400_000),
    h: Math.floor((delta % 86_400_000) / 3_600_000),
    m: Math.floor((delta % 3_600_000) / 60_000),
    s: Math.floor((delta % 60_000) / 1000),
  }
}

/** Cuenta regresiva real, no una animación de relleno. */
export function CuentaRegresiva({ hasta, etiqueta }: { hasta: string; etiqueta?: string }) {
  const objetivo = new Date(hasta).getTime()
  const [t, setT] = useState(() => restante(objetivo))

  useEffect(() => {
    const id = setInterval(() => setT(restante(objetivo)), 1000)
    return () => clearInterval(id)
  }, [objetivo])

  if (!t) return <span className="cifra text-[13px] text-humo">en curso</span>

  const bloques = [
    { valor: t.d, unidad: 'd' },
    { valor: t.h, unidad: 'h' },
    { valor: t.m, unidad: 'm' },
    { valor: t.s, unidad: 's' },
  ].filter((b, i) => b.valor > 0 || i > 0)

  return (
    <span className="cifra text-[13px]">
      {etiqueta && <span className="mr-2 text-humo">{etiqueta}</span>}
      {bloques.map((b) => (
        <span key={b.unidad} className="mr-1">
          {String(b.valor).padStart(2, '0')}
          <span className="text-humo">{b.unidad}</span>
        </span>
      ))}
    </span>
  )
}
