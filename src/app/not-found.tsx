import Link from 'next/link'

export default function NoEncontrado() {
  return (
    <div className="bloque mx-auto max-w-[460px] p-6">
      <h1 className="text-cifra">No existe esa página</h1>
      <p className="mt-2 text-[13px] text-humo">
        Si buscabas a un jugador, prueba con el buscador de arriba: aunque no compita en Clutch, igual te mostramos su
        perfil.
      </p>
      <div className="mt-4 flex gap-3">
        <Link href="/" className="boton">
          Ir al inicio
        </Link>
        <Link href="/ranking" className="boton-plano">
          Ver ranking
        </Link>
      </div>
    </div>
  )
}
