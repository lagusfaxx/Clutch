/**
 * Prueba de humo contra una base real: recorre el flujo completo de un
 * torneo, desde la inscripción hasta el premio revelado, usando los mismos
 * servicios que usan la web y la API. Los tests unitarios cubren la lógica
 * pura; esto cubre que las piezas conversen entre sí.
 *
 * Uso: DATABASE_URL=... npx tsx scripts/humo.ts
 */
import { prisma } from '@/lib/prisma'
import { inscribir, hacerCheckIn, cerrarCheckIn } from '@/server/services/registration'
import { reportarResultado } from '@/server/services/result'
import { tablaTorneo } from '@/server/services/tournament'
import { aplicarTorneoAlRanking, tablaPublica } from '@/server/services/ranking'
import { asignarPremios, cargarCodigos, revelarCodigo } from '@/server/services/prize'
import { guardarRut, registrarConEmail, autenticarConEmail, cambiarClave } from '@/server/services/user'
import { compararJugadores } from '@/server/services/compare'
import { buscar } from '@/server/services/search'

const ok = (m: string) => console.log(`  ok  ${m}`)

/**
 * Deja el torneo de prueba como recién creado. Sin esto el script solo
 * corre una vez: la segunda encuentra el torneo cerrado y falla.
 */
async function reiniciar(slug: string) {
  const torneo = await prisma.tournament.findUniqueOrThrow({ where: { slug } })
  await prisma.matchResult.deleteMany({ where: { match: { tournamentId: torneo.id } } })
  await prisma.ratingHistory.deleteMany({ where: { tournamentId: torneo.id } })
  await prisma.registration.deleteMany({ where: { tournamentId: torneo.id } })
  await prisma.prizeCode.deleteMany({})
  await prisma.prizeClaim.deleteMany({ where: { prize: { tournamentId: torneo.id } } })
  await prisma.rating.deleteMany({})
  await prisma.strike.deleteMany({})
  await prisma.auditLog.deleteMany({})

  const parte = new Date(Date.now() + 3 * 86_400_000)
  return prisma.tournament.update({
    where: { id: torneo.id },
    data: {
      status: 'INSCRIPCION_ABIERTA',
      startsAt: parte,
      endsAt: new Date(parte.getTime() + 3 * 3_600_000),
      checkInOpensAt: new Date(parte.getTime() - 30 * 60_000),
    },
  })
}

async function main() {
  const torneo = await reiniciar('semanal-solo-1')

  console.log('\n0. Registro con correo y contraseña')
  await prisma.user.deleteMany({ where: { email: 'prueba@clutch.cl' } })
  const registrado = await registrarConEmail({
    email: 'Prueba@Clutch.CL',
    password: 'una clave larga y decente',
    displayName: 'jugador de prueba',
  })
  ok(`creado ${registrado.email} en estado ${registrado.status}`)
  ok(`login correcto: ${Boolean(await autenticarConEmail('prueba@clutch.cl', 'una clave larga y decente'))}`)
  ok(`login con clave mala: ${await autenticarConEmail('prueba@clutch.cl', 'otra cosa')}`)
  try {
    await registrarConEmail({ email: 'prueba@clutch.cl', password: 'otra clave larguisima', displayName: 'clon' })
    console.log('  FALLA: dejó repetir el correo')
  } catch (e) {
    ok(`correo repetido rechazado: ${(e as Error).message}`)
  }
  try {
    await registrarConEmail({ email: 'corta@clutch.cl', password: 'corta', displayName: 'corta' })
    console.log('  FALLA: aceptó una clave corta')
  } catch (e) {
    ok(`clave corta rechazada: ${(e as Error).message}`)
  }
  await cambiarClave(registrado.id, 'una clave larga y decente', 'otra clave todavia mejor')
  ok(`clave cambiada, login nuevo: ${Boolean(await autenticarConEmail('prueba@clutch.cl', 'otra clave todavia mejor'))}`)

  console.log('\n1. Crear jugadores')
  const nombres = ['vatoloco', 'kiltro', 'pelao_cl', 'tomate', 'chascon', 'weon_pro']
  const jugadores = []
  for (const [i, n] of nombres.entries()) {
    const u = await prisma.user.upsert({
      where: { discordId: `d-${n}` },
      create: {
        discordId: `d-${n}`, epicAccountId: `epic-${n}`, epicNick: n,
        displayName: n, slug: n, status: 'VERIFIED', region: i % 2 ? 'RM' : 'Valparaíso',
        birthDate: new Date('2000-01-01'),
      },
      update: {},
    })
    jugadores.push(u)
  }
  ok(`${jugadores.length} jugadores`)

  console.log('\n2. Inscripción (debe exigir nick de Epic confirmado)')
  try {
    await inscribir(torneo.id, registrado.id)
    console.log('  FALLA: dejó inscribirse sin nick confirmado')
  } catch (e) {
    ok(`rechazado: ${(e as Error).message}`)
  }
  for (const j of jugadores) await inscribir(torneo.id, j.id)
  ok(`${jugadores.length} inscripciones`)

  console.log('\n3. Check-in')
  await prisma.tournament.update({
    where: { id: torneo.id },
    data: { checkInOpensAt: new Date(Date.now() - 60_000), startsAt: new Date(Date.now() + 600_000) },
  })
  for (const j of jugadores.slice(0, 5)) {
    const r = await prisma.registration.findFirstOrThrow({ where: { tournamentId: torneo.id, userId: j.id } })
    await hacerCheckIn(r.id, j.id)
  }
  ok('5 de 6 hicieron check-in')

  console.log('\n4. Cierre de check-in: no-show y strike')
  await cerrarCheckIn(torneo.id)
  const rezagado = await prisma.user.findUniqueOrThrow({ where: { id: jugadores[5]!.id } })
  ok(`no-show con ${rezagado.strikes} strike(s)`)

  console.log('\n5. Reporte de resultados')
  const partidas = await prisma.match.findMany({ where: { tournamentId: torneo.id }, orderBy: { index: 'asc' } })
  await prisma.tournament.update({ where: { id: torneo.id }, data: { endsAt: new Date(Date.now() + 60_000) } })
  const posiciones = [[1, 2, 3, 4, 5], [2, 1, 4, 3, 5], [1, 3, 2, 5, 4], [3, 1, 2, 4, 5], [1, 2, 5, 3, 4], [2, 3, 1, 4, 5]]
  for (const [pi, partida] of partidas.slice(0, 6).entries()) {
    for (const [ji, j] of jugadores.slice(0, 5).entries()) {
      await reportarResultado(
        { matchId: partida.id, placement: posiciones[pi]![ji]!, eliminations: 6 - (posiciones[pi]![ji] ?? 0), evidenceUrl: 'https://i.imgur.com/x.png' },
        j.id,
      )
    }
  }
  ok('30 resultados reportados, puntos calculados en el servidor')

  console.log('\n6. Tabla del torneo')
  const tabla = await tablaTorneo(torneo.id)
  for (const f of tabla.slice(0, 5)) console.log(`      ${f.posicion}. ${f.displayName.padEnd(10)} ${f.puntos} pts  (${f.partidasJugadas} partidas)`)

  console.log('\n7. Ranking Glicko-2')
  await prisma.tournament.update({ where: { id: torneo.id }, data: { status: 'CERRADO', endsAt: new Date(Date.now() - 1000) } })
  const n = await aplicarTorneoAlRanking(torneo.id)
  ok(`${n} ratings actualizados`)
  const repetido = await aplicarTorneoAlRanking(torneo.id)
  ok(`idempotencia: segunda pasada actualizó ${repetido}`)
  const ratings = await prisma.rating.findMany({ orderBy: { rating: 'desc' }, include: { user: true } })
  for (const r of ratings) console.log(`      ${r.user.displayName.padEnd(10)} ${Math.round(r.rating)}  (RD ${Math.round(r.deviation)})`)

  console.log('\n8. Tabla pública: mínimo 5 torneos')
  const publica = await tablaPublica({ game: 'FORTNITE' })
  ok(`con 1 torneo jugado, la tabla pública muestra ${publica.length} jugadores`)

  console.log('\n9. Premios cifrados')
  const admin = jugadores[0]!
  await prisma.user.update({ where: { id: admin.id }, data: { isAdmin: true } })
  await cargarCodigos(['VBUX-1111-2222-3333'], 'VBUCKS', 2800, admin.id, 'lote-1')
  const asignados = await asignarPremios(torneo.id, admin.id)
  ok(`${asignados} premio(s) asignado(s)`)
  const guardado = await prisma.prizeCode.findFirstOrThrow()
  console.log(`      en base de datos: ${guardado.encryptedCode?.slice(0, 40)}...`)
  const ganador = tabla[0]!
  await guardarRut(ganador.userId, '11.111.111-1')
  const reclamo = await prisma.prizeClaim.findFirstOrThrow({ where: { userId: ganador.userId } })
  const codigo = await revelarCodigo(reclamo.id, ganador.userId, '190.1.1.1')
  ok(`revelado una vez: ${codigo}`)
  try {
    await revelarCodigo(reclamo.id, ganador.userId, '190.1.1.1')
    console.log('  FALLA: lo mostró dos veces')
  } catch (e) {
    ok(`segundo intento bloqueado: ${(e as Error).message}`)
  }

  console.log('\n10. Comparación cabeza a cabeza')
  const comp = await compararJugadores(jugadores[0]!.slug, jugadores[1]!.slug)
  ok(`${comp.cruces.length} cruce(s), marcador ${comp.marcador.a}-${comp.marcador.b}`)

  console.log('\n11. Búsqueda')
  ok(`exacta "kiltro": ${(await buscar('kiltro')).length} resultado(s)`)
  ok(`con typo "kilto": ${(await buscar('kilto')).map((r) => `${r.displayName} (${r.tipo})`).join(', ') || 'sin coincidencias'}`)

  console.log('\n12. Auditoría')
  const log = await prisma.auditLog.count()
  ok(`${log} entradas en AuditLog`)
  const fuga = await prisma.auditLog.count({ where: { metadata: { string_contains: 'VBUX-1111' } } })
  console.log(`  ${fuga === 0 ? 'ok ' : 'FALLA'}  códigos filtrados al log: ${fuga}`)
}

main().catch((e) => { console.error('FALLÓ:', e); process.exit(1) }).finally(() => prisma.$disconnect())
