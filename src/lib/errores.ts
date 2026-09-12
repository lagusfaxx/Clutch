export type CodigoError =
  | 'NO_AUTORIZADO'
  | 'PROHIBIDO'
  | 'NO_ENCONTRADO'
  | 'CONFLICTO'
  | 'VALIDACION'
  | 'LIMITE'
  | 'EXTERNO'

const HTTP: Record<CodigoError, number> = {
  NO_AUTORIZADO: 401,
  PROHIBIDO: 403,
  NO_ENCONTRADO: 404,
  CONFLICTO: 409,
  VALIDACION: 422,
  LIMITE: 429,
  EXTERNO: 502,
}

/** Error de negocio. El mensaje se le muestra al usuario tal cual, en chileno directo. */
export class ErrorClutch extends Error {
  readonly codigo: CodigoError
  readonly detalle?: unknown

  constructor(codigo: CodigoError, mensaje: string, detalle?: unknown) {
    super(mensaje)
    this.name = 'ErrorClutch'
    this.codigo = codigo
    this.detalle = detalle
  }

  get http(): number {
    return HTTP[this.codigo]
  }
}

export function esErrorClutch(e: unknown): e is ErrorClutch {
  return e instanceof ErrorClutch
}
