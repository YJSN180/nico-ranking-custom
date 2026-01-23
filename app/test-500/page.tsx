import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { getOtherGenre500Items } from './utils/data-fetcher'
import ClientPage from '../client-page'

export default async function Test500Page() {
  const { items, popularTags } = await getOtherGenre500Items()

  return (
    <div>
      <h1 style={{ textAlign: 'center', margin: '20px 0' }}>
        その他ジャンル500件テスト（{items.length}件のデータ）
      </h1>
      <p style={{ textAlign: 'center', color: '#666', marginBottom: '20px' }}>
        NGフィルタリング済み、「もっと見る」ボタンで100件ずつ表示
      </p>
      <SuspenseWrapper>
        <ClientPage
          initialData={{ items, popularTags }}
          initialGenre="other"
          initialPeriod="24h"
        />
      </SuspenseWrapper>
    </div>
  )
}
