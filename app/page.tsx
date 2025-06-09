import ClientPage from './client-page'
import { PreferenceLoader } from '@/components/preference-loader'
import { HeaderWithSettings } from '@/components/header-with-settings'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { getFromCloudflareKV } from '@/lib/cloudflare-kv'
import { ungzip } from 'pako'
import { filterRankingData } from '@/lib/ng-filter'
import type { RankingData, RankingItem } from '@/types/ranking'

// ISRを使用してFunction Invocationsを削減
export const revalidate = 300 // 5分間キャッシュ

interface PageProps {
  searchParams: { [key: string]: string | string[] | undefined }
}

async function fetchRankingData(genre: string = 'all', period: string = '24h', tag?: string): Promise<{
  items: RankingData
  popularTags?: string[]
}> {
  try {
    // Cloudflare KVからフルスナップショットを取得
    const compressed = await getFromCloudflareKV('RANKING_LATEST')
    
    if (!compressed) {
      return { items: [], popularTags: [] }
    }
    
    // 解凍
    const decompressed = ungzip(new Uint8Array(compressed))
    const decoder = new TextDecoder()
    const jsonStr = decoder.decode(decompressed)
    const snapshot = JSON.parse(jsonStr)
    
    // ジャンルとピリオドのデータを取得
    const genreData = snapshot.genres?.[genre]
    if (!genreData) {
      return { items: [], popularTags: [] }
    }
    
    const periodData = genreData[period]
    if (!periodData) {
      return { items: [], popularTags: [] }
    }
    
    let items: RankingItem[] = []
    let popularTags: string[] = periodData.popularTags || []
    
    // タグ指定がある場合
    if (tag) {
      // タグ別データを取得
      const tagData = periodData.tags?.[tag]
      if (tagData && Array.isArray(tagData)) {
        items = tagData
      } else {
        // タグデータがない場合は通常のアイテムからフィルタリング
        items = (periodData.items || []).filter((item: RankingItem) =>
          item.tags?.includes(tag)
        )
      }
    } else {
      // タグ指定がない場合は通常のアイテム
      items = periodData.items || []
    }
    
    // NGフィルタリングを適用
    const { items: filteredItems, popularTags: filteredTags } = await filterRankingData({ items, popularTags })
    
    // 最初の100件のみ返す（ページネーションはクライアント側で処理）
    return {
      items: filteredItems.slice(0, 100),
      popularTags: filteredTags
    }
  } catch (error) {
    console.error('Error fetching ranking data:', error)
    return { items: [], popularTags: [] }
  }
}

export default async function Home({ searchParams }: PageProps) {
  const genre = (searchParams.genre as string) || 'all'
  const period = (searchParams.period as string) || '24h'
  const tag = searchParams.tag as string | undefined

  const { items, popularTags } = await fetchRankingData(genre, period, tag)

  return (
    <>
      <PreferenceLoader />
      <HeaderWithSettings />
      <main className="container">
        <SuspenseWrapper>
          <ClientPage 
            initialData={items}
            initialGenre={genre}
            initialPeriod={period}
            initialTag={tag}
            popularTags={popularTags}
          />
        </SuspenseWrapper>
      </main>
    </>
  )
}