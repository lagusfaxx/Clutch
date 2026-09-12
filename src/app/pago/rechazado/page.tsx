import Link from 'next/link'

export default function PagoRechazado() {
  return (
    <div className="bloque mx-auto max-w-[460px] p-6">
      <h1 className="text-cifra">El pago no se completó</h1>
      <p className="mt-2 text-[13px] text-humo">
        Tu banco rechazó la transacción o se canceló antes de terminar. No te cobramos nada. Tu cupo sigue reservado
        hasta que se llene el torneo.
      </p>
      <Link href="/torneos" className="boton mt-4">
        Intentar de nuevo
      </Link>
    </div>
  )
}
