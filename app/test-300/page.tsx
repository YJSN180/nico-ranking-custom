import ClientPage from '../client-page'
import { kv } from '@vercel/kv'
import { SuspenseWrapper } from '@/components/suspense-wrapper'

async function getOtherGenre300Items() {
  try {
    // KVから直接「その他」ジャンルのデータを取得
    const data = await kv.get('ranking-other-24h') as any
    
    if (data && data.items) {
      return {
        items: data.items,
        popularTags: data.popularTags || []
      }
    }
  } catch (error) {
    // KVエラーは無視してフォールバックを使用
  }
  
  // フォールバック: テストデータ
  const response = await fetch('http://localhost:3000/api/test-300-items', {
    cache: 'no-store'
  })
  
  if (!response.ok) {
    return { items: [], popularTags: [] }
  }
  
  return await response.json()
}

export default async function Test300Page() {
  const { items, popularTags } = await getOtherGenre300Items()
  
  return (
    <div>
      <h1 style={{ textAlign: 'center', margin: '20px 0' }}>
        その他ジャンル300件テスト（{items.length}件のデータ）
      </h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>
        NGフィルタリング済み、「もっと見る」ボタンで100件ずつ表示
      </p>
      <SuspenseWrapper>
        <ClientPage 
          initialData={items} 
          initialGenre="other"
          initialPeriod="24h"
          popularTags={popularTags}
        />
      </SuspenseWrapper>
    </div>
  )
}