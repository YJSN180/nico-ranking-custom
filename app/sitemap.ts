import { MetadataRoute } from 'next'
import { RANKING_GENRES } from '@/types/ranking-config'

// URLをXML用にエスケープする関数
function escapeXmlUrl(url: string): string {
  // Next.js 15.3.3では自動エスケープが効かないため手動でエスケープ
  return url.replace(/&/g, '&amp;')
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://nico-rank.com'
  const currentDate = new Date()

  // 基本ページ
  const staticPages = [
    {
      url: baseUrl,
      lastModified: currentDate,
      changeFrequency: 'hourly' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date('2025-06-17'),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: new Date('2025-06-17'),
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date('2025-06-17'),
      changeFrequency: 'monthly' as const,
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date('2025-06-15'),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    },
  ]

  // ジャンル別ページ
  const genrePages = RANKING_GENRES.map((genre) => ({
    url: escapeXmlUrl(`${baseUrl}?genre=${genre.value}`),
    lastModified: currentDate,
    changeFrequency: 'hourly' as const,
    priority: 0.8,
  }))

  // 期間別ページ（24h/hour）
  const periodPages = RANKING_GENRES.flatMap((genre) => [
    {
      url: escapeXmlUrl(`${baseUrl}?genre=${genre.value}&period=24h`),
      lastModified: currentDate,
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    },
    {
      url: escapeXmlUrl(`${baseUrl}?genre=${genre.value}&period=hour`),
      lastModified: currentDate,
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    },
  ])

  return [...staticPages, ...genrePages, ...periodPages]
}