import type { TransaccionWebpay, RespuestaWebpay } from './payment'

/**
 * Adaptador Transbank. Se carga el SDK en tiempo de ejecución para que el
 * resto del sistema no dependa de él: el motor de torneos funciona igual
 * con torneos gratis y sin credenciales de Transbank configuradas.
 */
export async function webpay(): Promise<TransaccionWebpay> {
  const { TBK_COMMERCE_CODE, TBK_API_KEY, TBK_AMBIENTE } = process.env
  if (!TBK_COMMERCE_CODE || !TBK_API_KEY) {
    throw new Error('Faltan credenciales de Transbank (TBK_COMMERCE_CODE / TBK_API_KEY).')
  }

  const sdk = (await import('transbank-sdk')) as unknown as {
    WebpayPlus: { Transaction: new (opciones: unknown) => TransaccionSdk }
    Options: new (codigo: string, key: string, entorno: string) => unknown
    Environment: { Integration: string; Production: string }
  }

  const entorno = TBK_AMBIENTE === 'produccion' ? sdk.Environment.Production : sdk.Environment.Integration
  const tx = new sdk.WebpayPlus.Transaction(new sdk.Options(TBK_COMMERCE_CODE, TBK_API_KEY, entorno))

  return {
    async crear(buyOrder, sessionId, monto, returnUrl) {
      const res = await tx.create(buyOrder, sessionId, monto, returnUrl)
      return { token: res.token, url: res.url }
    },
    async confirmar(token) {
      return (await tx.commit(token)) as RespuestaWebpay
    },
    async anular(token, monto) {
      return tx.refund(token, monto)
    },
  }
}

interface TransaccionSdk {
  create(buyOrder: string, sessionId: string, monto: number, returnUrl: string): Promise<{ token: string; url: string }>
  commit(token: string): Promise<unknown>
  refund(token: string, monto: number): Promise<unknown>
}
