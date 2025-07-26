import { describe, it, expect, beforeEach, vi } from 'vitest'
import { applyCustomFilters } from '@/lib/custom-ranking-filter'
import { rankingCache } from '@/lib/ranking-cache'
import type { RankingItem } from '@/types/ranking'
import type { TagCondition } from '@/types/custom-ranking'

// モックデータ
const mockRankingItems: RankingItem[] = [
  {
    id: '1',
    contentId: 'sm1',
    rank: 1,
    title: 'ゲーム実況動画',
    viewCounter: 10000,
    mylistCounter: 100,
    likeCounter: 500,
    lengthSeconds: 600,
    startTime: '2025-01-01T00:00:00+09:00',
    thumbnailUrl: 'https://example.com/thumb1.jpg',
    tags: ['ゲーム', '実況プレイ動画', 'RPG'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },
      { name: '実況プレイ動画', isLocked: false },
      { name: 'RPG', isLocked: false }
    ]
  },
  {
    id: '2',
    contentId: 'sm2',
    rank: 2,
    title: 'MMD作品',
    viewCounter: 8000,
    mylistCounter: 80,
    likeCounter: 400,
    lengthSeconds: 300,
    startTime: '2025-01-01T00:00:00+09:00',
    thumbnailUrl: 'https://example.com/thumb2.jpg',
    tags: ['MMD', 'MikuMikuDance', '初音ミク'],
    tagDetails: [
      { name: 'MMD', isLocked: false },
      { name: 'MikuMikuDance', isLocked: true },
      { name: '初音ミク', isLocked: false }
    ]
  },
  {
    id: '3',
    contentId: 'sm3',
    rank: 3,
    title: 'ゲーム音楽アレンジ',
    viewCounter: 6000,
    mylistCounter: 60,
    likeCounter: 300,
    lengthSeconds: 240,
    startTime: '2025-01-01T00:00:00+09:00',
    thumbnailUrl: 'https://example.com/thumb3.jpg',
    tags: ['音楽', 'ゲーム', 'アレンジ', 'RPG'],
    tagDetails: [
      { name: '音楽', isLocked: true },
      { name: 'ゲーム', isLocked: true },
      { name: 'アレンジ', isLocked: false },
      { name: 'RPG', isLocked: false }
    ]
  }
]

describe('カスタムランキング即時フィルタリング', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('applyCustomFilters', () => {
    it('AND条件で正しくフィルタリングされる', () => {
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'both' },
        { tag: 'RPG', operator: 'AND', tagType: 'both' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      // ゲームとRPGの両方を含む動画のみ
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('1')
      expect(filtered[1].id).toBe('3')
    })

    it('OR条件で正しくフィルタリングされる', () => {
      const conditions: TagCondition[] = [
        { tag: 'MMD', operator: 'OR', tagType: 'both' },
        { tag: 'RPG', operator: 'OR', tagType: 'both' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      // MMDまたはRPGを含む動画
      expect(filtered).toHaveLength(3) // すべての動画が該当
    })

    it('NOT条件で正しくフィルタリングされる', () => {
      const conditions: TagCondition[] = [
        { tag: 'MMD', operator: 'NOT', tagType: 'both' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      // MMDを含まない動画のみ
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('1')
      expect(filtered[1].id).toBe('3')
    })

    it('タグタイプ（ロックタグ）で正しくフィルタリングされる', () => {
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'lock' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      // ロックタグの「ゲーム」を持つ動画のみ
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('1')
      expect(filtered[1].id).toBe('3')
    })

    it('タグタイプ（ユーザータグ）で正しくフィルタリングされる', () => {
      const conditions: TagCondition[] = [
        { tag: 'RPG', operator: 'AND', tagType: 'user' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      // ユーザータグの「RPG」を持つ動画のみ
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('1')
      expect(filtered[1].id).toBe('3')
    })

    it('複合条件で正しくフィルタリングされる', () => {
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'lock' },
        { tag: 'MMD', operator: 'NOT', tagType: 'both' },
        { tag: 'アレンジ', operator: 'OR', tagType: 'user' },
        { tag: '実況プレイ動画', operator: 'OR', tagType: 'user' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      // ロックタグ「ゲーム」を含み、MMDを含まず、
      // ユーザータグ「アレンジ」または「実況プレイ動画」を含む
      expect(filtered).toHaveLength(2)
      expect(filtered[0].id).toBe('1')
      expect(filtered[1].id).toBe('3')
    })
  })

  describe('即時フィルタリング統合テスト', () => {
    it('キャッシュからのデータ取得とフィルタリング適用が同期的に動作する', () => {
      // キャッシュにデータを設定
      rankingCache.set('game', 'daily', mockRankingItems)
      
      // キャッシュからデータを取得
      const cachedData = rankingCache.get('game', 'daily')
      expect(cachedData).not.toBeNull()
      expect(cachedData!.data).toHaveLength(3)
      
      // フィルタリング条件
      const conditions: TagCondition[] = [
        { tag: 'RPG', operator: 'AND', tagType: 'both' }
      ]
      
      // フィルタリング適用
      const filtered = applyCustomFilters(cachedData!.data, conditions)
      
      // 結果確認
      expect(filtered).toHaveLength(2)
      expect(filtered[0].title).toContain('ゲーム実況')
      expect(filtered[1].title).toContain('ゲーム音楽')
    })

    it('空の条件では全データが返される', () => {
      const conditions: TagCondition[] = []
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      expect(filtered).toHaveLength(mockRankingItems.length)
      expect(filtered).toEqual(mockRankingItems)
    })

    it('該当する動画がない条件では空配列が返される', () => {
      const conditions: TagCondition[] = [
        { tag: '存在しないタグ', operator: 'AND', tagType: 'both' }
      ]
      
      const filtered = applyCustomFilters(mockRankingItems, conditions)
      
      expect(filtered).toHaveLength(0)
    })
  })

  describe('ユーザーNGリストとの動作比較', () => {
    it('フィルタリング結果が即座に反映される（リロード不要）', () => {
      // 初期状態
      let displayData = mockRankingItems
      expect(displayData).toHaveLength(3)
      
      // カスタムランキング作成・適用
      const conditions: TagCondition[] = [
        { tag: 'RPG', operator: 'AND', tagType: 'both' }
      ]
      
      // 即座にフィルタリング適用（handleCreateCustomRankingWithFilterの動作を模倣）
      displayData = applyCustomFilters(displayData, conditions)
      
      // 結果が即座に反映されることを確認
      expect(displayData).toHaveLength(2)
      expect(displayData.every(item => item.tags.includes('RPG'))).toBe(true)
    })

    it('条件変更時も即座に再フィルタリングされる', () => {
      let displayData = mockRankingItems
      
      // 最初の条件
      const conditions1: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'both' }
      ]
      displayData = applyCustomFilters(mockRankingItems, conditions1)
      expect(displayData).toHaveLength(2)
      
      // 条件を変更
      const conditions2: TagCondition[] = [
        { tag: 'MMD', operator: 'AND', tagType: 'both' }
      ]
      displayData = applyCustomFilters(mockRankingItems, conditions2)
      expect(displayData).toHaveLength(1)
      expect(displayData[0].title).toContain('MMD')
    })
  })
})