'use client'

import { useMemo } from 'react'
import { useGenreOrderV2 } from './use-genre-order-v2'
import { RankingGenre } from '@/types/ranking-config'

/**
 * ジャンル順序管理フック
 * useGenreOrderV2の簡易ラッパーとして機能し、
 * 既存のコンポーネントで使用できるインターフェースを提供
 */
export function useGenreOrder() {
  const { visibleGenres, hiddenGenres } = useGenreOrderV2()
  
  return useMemo(() => ({
    // 表示されているジャンルの順序
    order: visibleGenres,
    
    // 非表示のジャンルのセット
    hidden: new Set(hiddenGenres),
    
    // 後方互換性のためのメソッド（実際の更新はGenreOrderCustomizerで行う）
    updateOrder: (newOrder: RankingGenre[]) => {
      console.warn('updateOrder is deprecated. Use GenreOrderCustomizer component.')
    },
    
    toggleGenreVisibility: (genre: RankingGenre) => {
      console.warn('toggleGenreVisibility is deprecated. Use GenreOrderCustomizer component.')
    },
    
    resetToDefault: () => {
      console.warn('resetToDefault is deprecated. Use GenreOrderCustomizer component.')
    }
  }), [visibleGenres, hiddenGenres])
}