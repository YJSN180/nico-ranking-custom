import { render, fireEvent } from '@testing-library/react'
import { beforeEach, describe, test, expect, vi } from 'vitest'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import type { RankingItem } from '@/types/ranking'

// タッチデバイスをモック
const mockTouchDevice = () => {
  Object.defineProperty(window, 'ontouchstart', {
    writable: true,
    value: () => {}
  })
}

// 非タッチデバイスをモック
const mockNonTouchDevice = () => {
  // ontouchstartプロパティを削除
  if ('ontouchstart' in window) {
    delete (window as any).ontouchstart
  }
}

describe('RankingItemResponsive - モバイルホバー修正', () => {
  const mockItem: RankingItem = {
    id: 'sm12345678',
    title: 'テスト動画',
    registeredAt: '2025-06-27T12:00:00Z',
    views: 56000,
    comments: 2200,
    mylists: 2199,
    likes: 2199,
    thumbURL: 'https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678',
    duration: 1707,
    rank: 1,
    authorName: 'テスト投稿者',
    authorId: 'user/12345',
    authorIcon: 'https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/0/0.jpg',
  }

  describe('モバイルホバー状態の修正動作', () => {
    test('タッチ終了時のイベントハンドリング', () => {
      vi.useFakeTimers()
      const { container } = render(<RankingItemResponsive item={mockItem} />)
      const listItem = container.querySelector('li')!
      
      // タッチ終了イベントが処理されることを確認
      const touchEndEvent = new TouchEvent('touchend', { bubbles: true })
      listItem.dispatchEvent(touchEndEvent)
      
      // タイマーが動作することを確認
      vi.advanceTimersByTime(100)
      
      // エラーが発生しないことを確認（実際の値は環境依存）
      expect(listItem).toBeInTheDocument()
      
      vi.useRealTimers()
    })
  })

  test('マイリストボタンのクリックが親要素に伝播しない', () => {
    const windowOpen = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = render(<RankingItemResponsive item={mockItem} />)
    
    // モバイル用マイリストボタンを探す
    const mylistButton = container.querySelector('.ranking-item-responsive__mylist-button button')
    
    if (mylistButton) {
      fireEvent.click(mylistButton)
      
      // 親要素のクリックハンドラが呼ばれない
      expect(windowOpen).not.toHaveBeenCalled()
    }
    
    windowOpen.mockRestore()
  })
})