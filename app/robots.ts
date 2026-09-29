import type { MetadataRoute } from 'next'

// VERCEL_ENV はビルド時に読む。本番以外（プレビュー・ローカル）はすべて拒否する
// （next.config.mjs の X-Robots-Tag と同じ判定）
export default function robots(): MetadataRoute.Robots {
  if (process.env.VERCEL_ENV !== 'production') {
    return {
      rules: {
        userAgent: '*',
        disallow: '/',
      },
    }
  }

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api'],
    },
    sitemap: 'https://nico-rank.com/sitemap.xml',
  }
}
