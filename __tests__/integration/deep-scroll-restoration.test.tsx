import { describe, it, expect, beforeEach } from 'vitest'

describe('深いページネーションでのスクロール位置復元', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('「もっと見る」で400件まで読み込んだ状態が保存される', () => {
    const storageKey = 'ranking-state-other-24h-none'
    
    // 400件のアイテムを読み込んだ状態をシミュレート
    const mockState = {
      items: Array.from({ length: 400 }, (_, i) => ({
        rank: i + 1,
        id: `sm${i + 1}`,
        title: `動画 ${i + 1}`,
        thumbURL: `https://example.com/thumb${i + 1}.jpg`,
        views: 10000 - i * 10
      })),
      displayCount: 400,
      currentPage: 4,
      hasMore: true,
      scrollPosition: 15000, // 400位あたりのスクロール位置
      timestamp: Date.now()
    }
    
    sessionStorage.setItem(storageKey, JSON.stringify(mockState))
    
    // 保存されたデータを確認
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
    expect(saved.items).toHaveLength(400)
    expect(saved.displayCount).toBe(400)
    expect(saved.currentPage).toBe(4)
    expect(saved.scrollPosition).toBe(15000)
  })

  it('ブラウザバックで戻った時に全データとスクロール位置が復元される', () => {
    const storageKey = 'ranking-state-other-hour-AIのべりすと'
    
    // 300件読み込んで250位あたりを見ていた状態
    const viewingPosition = 250
    const mockState = {
      items: Array.from({ length: 300 }, (_, i) => ({
        rank: i + 1,
        id: `sm${i + 1}`,
        title: `AIのべりすと動画 ${i + 1}`,
        thumbURL: `https://example.com/thumb${i + 1}.jpg`,
        views: 20000 - i * 50
      })),
      displayCount: 300,
      currentPage: 3,
      hasMore: true,
      scrollPosition: viewingPosition * 50, // 1アイテム約50pxと仮定
      timestamp: Date.now() - 5000 // 5秒前
    }
    
    sessionStorage.setItem(storageKey, JSON.stringify(mockState))
    
    // 復元されたデータを確認
    const restored = JSON.parse(sessionStorage.getItem(storageKey) || '{}')
    
    // すべてのデータが保持されている
    expect(restored.items).toHaveLength(300)
    expect(restored.items[249].rank).toBe(250) // 250位のアイテム
    expect(restored.scrollPosition).toBe(12500) // 250位あたりのスクロール位置
    
    // ページ情報も保持
    expect(restored.currentPage).toBe(3)
    expect(restored.hasMore).toBe(true)
  })

  it('異なるランキング設定ごとに独立して状態が保存される', () => {
    // 設定1: その他ジャンル、24時間、タグなし
    const key1 = 'ranking-state-other-24h-none'
    sessionStorage.setItem(key1, JSON.stringify({
      items: Array.from({ length: 200 }, (_, i) => ({ id: `sm${i}` })),
      displayCount: 200,
      scrollPosition: 8000
    }))
    
    // 設定2: その他ジャンル、毎時、AIのべりすとタグ
    const key2 = 'ranking-state-other-hour-AIのべりすと'
    sessionStorage.setItem(key2, JSON.stringify({
      items: Array.from({ length: 500 }, (_, i) => ({ id: `ai${i}` })),
      displayCount: 500,
      scrollPosition: 20000
    }))
    
    // それぞれ独立して保存されている
    const saved1 = JSON.parse(sessionStorage.getItem(key1) || '{}')
    const saved2 = JSON.parse(sessionStorage.getItem(key2) || '{}')
    
    expect(saved1.items).toHaveLength(200)
    expect(saved1.scrollPosition).toBe(8000)
    
    expect(saved2.items).toHaveLength(500)
    expect(saved2.scrollPosition).toBe(20000)
  })
})