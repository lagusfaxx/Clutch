export const ZONA = 'America/Santiago'

const formato = new Intl.DateTimeFormat('es-CL', {
  timeZone: ZONA,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

export function fechaCL(d: Date | string): string {
  return formato.format(typeof d === 'string' ? new Date(d) : d)
}

export function minutos(n: number): number {
  return n * 60_000
}

export function horas(n: number): number {
  return n * 3_600_000
}

export function dias(n: number): number {
  return n * 86_400_000
}

export function diasEntre(a: Date, b: Date): number {
  return Math.floor(Math.abs(b.getTime() - a.getTime()) / 86_400_000)
}
