'use client'

import { memo, forwardRef } from 'react'
import { FixedSizeList as List } from 'react-window'
import RankingItemResponsive from './ranking-item-responsive'
import type { RankingItem } from '@/types/ranking'

interface VirtualizedRankingListProps {
  items: RankingItem[]
  height: number
  itemHeight: number
  className?: string
}

interface RowProps {
  index: number
  style: React.CSSProperties
  data: RankingItem[]
}

// 仮想化リスト用のアイテムコンポーネント
const VirtualizedRankingRow = memo(({ index, style, data }: RowProps) => {
  const item = data[index]
  
  return (
    <div style={style}>
      <RankingItemResponsive item={item} />
    </div>
  )
})

VirtualizedRankingRow.displayName = 'VirtualizedRankingRow'

// 仮想化されたランキングリスト
const VirtualizedRankingList = memo(forwardRef<HTMLDivElement, VirtualizedRankingListProps>(
  function VirtualizedRankingList({ items, height, itemHeight, className }, ref) {
    if (items.length === 0) {
      return null
    }

    return (
      <div ref={ref} className={className}>
        <List
          height={height}
          width="100%"
          itemCount={items.length}
          itemSize={itemHeight}
          itemData={items}
          overscanCount={5} // 画面外の要素も少し描画してスムーズなスクロール
        >
          {VirtualizedRankingRow}
        </List>
      </div>
    )
  }
))

export default VirtualizedRankingList