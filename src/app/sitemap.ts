import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Los perfiles son el motor de crecimiento orgánico: la gente googlea su
 * propio nick (§2.10). Los fantasmas también entran, que para eso existen.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitio = process.env.SITE_URL ?? 'https://clutch.cl'

  const [jugadores, fantasmas, torneos] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, status: { not: 'BANNED' } },
      select: { slug: true, updatedAt: true },
      take: 5000,
    }),
    prisma.ghostProfile.findMany({
      where: { notFound: false, claimedByUserId: null },
      select: { slug: true, lastSyncedAt: true },
      take: 5000,
    }),
    prisma.tournament.findMany({
      where: { deletedAt: null, status: { not: 'DRAFT' } },
      select: { slug: true, updatedAt: true },
      take: 2000,
    }),
  ])

  return [
    { url: sitio, changeFrequency: 'hourly', priority: 1 },
    { url: `${sitio}/ranking`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${sitio}/torneos`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${sitio}/reglas`, changeFrequency: 'monthly', priority: 0.3 },
    ...jugadores.map((j) => ({ url: `${sitio}/j/${j.slug}`, lastModified: j.updatedAt, priority: 0.7 })),
    ...fantasmas.map((f) => ({
      url: `${sitio}/j/${f.slug}`,
      lastModified: f.lastSyncedAt ?? undefined,
      priority: 0.4,
    })),
    ...torneos.map((t) => ({ url: `${sitio}/torneos/${t.slug}`, lastModified: t.updatedAt, priority: 0.8 })),
  ]
}
