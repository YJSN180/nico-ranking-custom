import RankingItemResponsive from './ranking-item-responsive'
import type { RankingItem } from '@/types/ranking'

interface RankingListServerProps {
  items: RankingItem[]
}

// サーバーコンポーネントとして初期表示を行う
export function RankingListServer({ items }: RankingListServerProps) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {items.map((item) => (
        <RankingItemResponsive 
          key={item.id} 
          item={item}
        />
      ))}
    </ul>
  )
}