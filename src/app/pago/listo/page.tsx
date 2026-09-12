import Link from 'next/link'

export default function PagoListo() {
  return (
    <div className="bloque mx-auto max-w-[460px] p-6">
      <h1 className="text-cifra">Pago recibido</h1>
      <p className="mt-2 text-[13px] text-humo">
        Tu inscripción quedó confirmada. Acuérdate del check-in: abre 30 minutos antes del inicio y sin él pierdes el
        cupo.
      </p>
      <Link href="/torneos" className="boton mt-4">
        Ver mis torneos
      </Link>
    </div>
  )
}
