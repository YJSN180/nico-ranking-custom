import Script from 'next/script'
import type { RankingData } from '@/types/ranking'

interface JsonLdProps {
  rankingData: RankingData
  genre: string
  period: string
}

export function JsonLd({ rankingData, genre, period }: JsonLdProps) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `ニコニコ動画 ${genre} ${period === '24h' ? '24時間' : '毎時'}ランキング`,
    description: 'ニコニコ動画の人気動画ランキング',
    url: `https://nico-rank.com?genre=${genre}&period=${period}`,
    numberOfItems: rankingData.length,
    itemListElement: rankingData.slice(0, 10).map((item, index) => ({
      '@type': 'VideoObject',
      position: index + 1,
      name: item.title,
      url: `https://www.nicovideo.jp/watch/${item.id}`,
      thumbnailUrl: item.thumbURL,
      uploadDate: item.registeredAt,
      interactionStatistic: [
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/WatchAction',
          userInteractionCount: item.views,
        },
        {
          '@type': 'InteractionCounter',
          interactionType: 'https://schema.org/CommentAction',
          userInteractionCount: item.comments || 0,
        },
      ],
      author: item.authorName ? {
        '@type': 'Person',
        name: item.authorName,
        url: item.authorId ? `https://www.nicovideo.jp/user/${item.authorId}` : undefined,
      } : undefined,
    })),
  }

  return (
    <Script
      id="json-ld"
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(jsonLd),
      }}
      strategy="afterInteractive"
    />
  )
}