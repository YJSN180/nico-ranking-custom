import dynamic from 'next/dynamic'
import { SuspenseWrapper } from '@/components/suspense-wrapper'
import { getOtherGenre500Items } from './utils/data-fetcher'

// ClientPage を動的インポートで遅延ロード
const ClientPage = dynamic(() => import('../client-page'), {
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '400px',
      color: 'var(--text-secondary)'
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ 
          fontSize: '18px',
          fontWeight: '500',
          marginBottom: '8px'
        }}>
          ランキングデータを読み込んでいます
        </div>
        <div style={{ 
          fontSize: '14px',
          opacity: 0.7
        }}>
          500件のデータを処理中...
        </div>
      </div>
    </div>
  )
})

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
          initialData={items} 
          totalItems={items.items.length}
          initialGenre="other"
          initialPeriod="24h"
          popularTags={popularTags}
        />
      </SuspenseWrapper>
    </div>
  )
}