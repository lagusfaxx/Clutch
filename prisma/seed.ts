import { PrismaClient } from '@prisma/client'
import { PUNTAJE_FNCS } from '../src/server/services/scoring'

const prisma = new PrismaClient()

/**
 * Datos mínimos para levantar el proyecto local: una temporada abierta y un
 * torneo semanal gratis con la tabla de puntaje estilo FNCS.
 */
async function main() {
  const inicio = new Date()
  const fin = new Date(inicio.getTime() + 90 * 86_400_000)

  const temporada = await prisma.season.upsert({
    where: { slug: 'fortnite-t1' },
    create: {
      slug: 'fortnite-t1',
      name: 'Temporada 1',
      game: 'FORTNITE',
      startsAt: inicio,
      endsAt: fin,
    },
    update: {},
  })

  const parte = new Date(Date.now() + 3 * 86_400_000)
  parte.setHours(21, 0, 0, 0)
  const termina = new Date(parte.getTime() + 3 * 3_600_000)

  const torneo = await prisma.tournament.upsert({
    where: { slug: 'semanal-solo-1' },
    create: {
      slug: 'semanal-solo-1',
      name: 'Semanal Solo #1',
      description:
        'Ocho partidas en tres horas, cuentan las mejores seis. Servidor BR. Gratis, con V-Bucks para el podio.',
      game: 'FORTNITE',
      format: 'PUNTOS',
      mode: 'SOLO',
      status: 'INSCRIPCION_ABIERTA',
      serverRegion: 'BR',
      seasonId: temporada.id,
      startsAt: parte,
      endsAt: termina,
      checkInOpensAt: new Date(parte.getTime() - 30 * 60_000),
      maxSlots: 100,
      minSlots: 12,
      entryFeeClp: 0,
      matchesTotal: 8,
      matchesCounted: 6,
      scoringConfig: PUNTAJE_FNCS as object,
    },
    update: {},
  })

  const partidas = await prisma.match.count({ where: { tournamentId: torneo.id } })
  if (partidas === 0) {
    await prisma.match.createMany({
      data: Array.from({ length: 8 }, (_, i) => ({ tournamentId: torneo.id, index: i + 1 })),
    })
  }

  await prisma.prize.upsert({
    where: { tournamentId_placement: { tournamentId: torneo.id, placement: 1 } },
    create: { tournamentId: torneo.id, placement: 1, type: 'VBUCKS', faceValue: 2800, description: '2.800 V-Bucks' },
    update: {},
  })

  console.log(`Listo: temporada ${temporada.slug} y torneo ${torneo.slug}.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
