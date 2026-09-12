export const TRABAJOS = {
  recordarCheckIn: 'torneo.recordar-checkin',
  cerrarCheckIn: 'torneo.cerrar-checkin',
  snapshotPre: 'fortnite.snapshot-pre',
  snapshotPost: 'fortnite.snapshot-post',
  reconciliar: 'fortnite.reconciliar',
  cerrarTorneo: 'torneo.cerrar',
  aplicarRanking: 'ranking.aplicar',
  decayRanking: 'ranking.decay',
  limpiarCache: 'mantencion.limpiar-cache',
  archivarMensajes: 'mantencion.archivar-mensajes',
  reembolsarTorneo: 'pago.reembolsar-torneo',
  anunciarDiscord: 'discord.anunciar',
  avisarCheckInDm: 'discord.dm-checkin',
  publicarResultados: 'discord.publicar-resultados',
  sincronizarRoles: 'discord.sincronizar-roles',
} as const

export type NombreTrabajo = (typeof TRABAJOS)[keyof typeof TRABAJOS]
