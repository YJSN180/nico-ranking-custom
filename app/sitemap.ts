import { MetadataRoute } from 'next'
import { RANKING_GENRES } from '@/types/ranking-config'
import { buildRankingConfigUrl } from '@/lib/ranking-url'

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

  // ランキングページの URL はサイト内のリンクと同じ形にする（総合・24時間は省略）。
  // 同じ中身を別の URL で重ねて載せない。custom は端末ごとの設定なので、クローラーには空に見える
  const rankingGenres = RANKING_GENRES.filter((genre) => genre.value !== 'custom')

  // ジャンル別ページ（24時間）。総合・24時間はトップページと同じなので除く
  const genrePages = rankingGenres
    .filter((genre) => genre.value !== 'all')
    .map((genre) => ({
      url: escapeXmlUrl(`${baseUrl}${buildRankingConfigUrl({ genre: genre.value, period: '24h' })}`),
      lastModified: currentDate,
      changeFrequency: 'hourly' as const,
      priority: 0.8,
    }))

  // 毎時ページ
  const periodPages = rankingGenres.map((genre) => ({
    url: escapeXmlUrl(`${baseUrl}${buildRankingConfigUrl({ genre: genre.value, period: 'hour' })}`),
    lastModified: currentDate,
    changeFrequency: 'hourly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...genrePages, ...periodPages]
}