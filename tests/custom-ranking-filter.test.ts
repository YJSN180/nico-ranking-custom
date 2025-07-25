import { applyCustomFilters } from '@/lib/custom-ranking-filter'
import type { RankingItem } from '@/types/ranking'
import type { TagCondition } from '@/types/custom-ranking'

describe('カスタムランキングフィルタリングロジック', () => {
  // テスト用のモックデータ
  const createItem = (tags: string[]): RankingItem => ({
    rank: 1,
    previousRank: 1,
    title: 'テスト動画',
    videoId: 'sm12345',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    viewCount: 1000,
    likeCount: 100,
    mylistCount: 10,
    commentCount: 50,
    lengthSeconds: 300,
    postedAt: '2025-01-01T00:00:00Z',
    tags: tags,
    tagDetails: tags.map(tag => ({ name: tag, isLocked: false }))
  })

  describe('基本的なフィルタリング', () => {
    test('条件なしの場合はすべてのアイテムを返す', () => {
      const items = [
        createItem(['タグA']),
        createItem(['タグB'])
      ]
      const result = applyCustomFilters(items, [])
      expect(result).toHaveLength(2)
    })

    test('単一AND条件', () => {
      const items = [
        createItem(['タグA', 'タグB']),
        createItem(['タグB', 'タグC']),
        createItem(['タグC', 'タグD'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグA', operator: 'AND', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].tags).toContain('タグA')
    })

    test('単一OR条件', () => {
      const items = [
        createItem(['タグA']),
        createItem(['タグB']),
        createItem(['タグC'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグA', operator: 'OR', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1)
      expect(result[0].tags).toContain('タグA')
    })

    test('単一NOT条件', () => {
      const items = [
        createItem(['タグA', 'タグB']),
        createItem(['タグB', 'タグC']),
        createItem(['タグC', 'タグD'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグA', operator: 'NOT', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2)
      expect(result.every(item => !item.tags?.includes('タグA'))).toBe(true)
    })
  })

  describe('複雑なフィルタリング', () => {
    test('複数AND条件（すべて満たす必要）', () => {
      const items = [
        createItem(['タグA', 'タグB', 'タグC']),
        createItem(['タグA', 'タグB']),
        createItem(['タグA', 'タグC']),
        createItem(['タグB', 'タグC'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグA', operator: 'AND', tagType: 'both' },
        { tag: 'タグB', operator: 'AND', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2) // タグAとタグBの両方を含む
      expect(result.every(item => 
        item.tags?.includes('タグA') && item.tags?.includes('タグB')
      )).toBe(true)
    })

    test('複数OR条件（いずれか1つ満たせばOK）', () => {
      const items = [
        createItem(['タグA']),
        createItem(['タグB']),
        createItem(['タグC']),
        createItem(['タグD'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグA', operator: 'OR', tagType: 'both' },
        { tag: 'タグB', operator: 'OR', tagType: 'both' },
        { tag: 'タグC', operator: 'OR', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(3) // タグA、B、Cのいずれかを含む
    })

    test('AND + OR条件の組み合わせ', () => {
      const items = [
        createItem(['必須タグ', '選択タグA']),
        createItem(['必須タグ', '選択タグB']),
        createItem(['必須タグ', '選択タグC']),
        createItem(['必須タグ']),
        createItem(['選択タグA', '選択タグB'])
      ]
      const conditions: TagCondition[] = [
        { tag: '必須タグ', operator: 'AND', tagType: 'both' },
        { tag: '選択タグA', operator: 'OR', tagType: 'both' },
        { tag: '選択タグB', operator: 'OR', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2) // 必須タグを含み、かつ選択タグAかBを含む
    })

    test('AND + NOT条件の組み合わせ', () => {
      const items = [
        createItem(['必須タグ', '除外タグ']),
        createItem(['必須タグ', '他のタグ']),
        createItem(['必須タグ']),
        createItem(['除外タグ'])
      ]
      const conditions: TagCondition[] = [
        { tag: '必須タグ', operator: 'AND', tagType: 'both' },
        { tag: '除外タグ', operator: 'NOT', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2) // 必須タグを含み、除外タグを含まない
      expect(result.every(item => 
        item.tags?.includes('必須タグ') && !item.tags?.includes('除外タグ')
      )).toBe(true)
    })

    test('AND + OR + NOT条件すべての組み合わせ', () => {
      const items = [
        createItem(['ゲーム', '実況プレイ', 'ホラー']),
        createItem(['ゲーム', '実況プレイ', 'アクション']),
        createItem(['ゲーム', 'ゆっくり実況', 'ホラー']),
        createItem(['ゲーム', 'VOICEROID実況', 'RPG']),
        createItem(['音楽', '実況プレイ']),
        createItem(['ゲーム', '実況プレイ', 'R-18'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'both' },
        { tag: '実況プレイ', operator: 'OR', tagType: 'both' },
        { tag: 'ゆっくり実況', operator: 'OR', tagType: 'both' },
        { tag: 'VOICEROID実況', operator: 'OR', tagType: 'both' },
        { tag: 'R-18', operator: 'NOT', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(4) // ゲームタグ必須、実況系タグのいずれか、R-18除外
    })

    test('真夏の夜の淫夢タグのケース', () => {
      const items = [
        createItem(['真夏の夜の淫夢', 'エンターテイメント']),
        createItem(['真夏の夜の淫夢', 'ゲーム']),
        createItem(['エンターテイメント']),
        createItem(['ゲーム'])
      ]
      const conditions: TagCondition[] = [
        { tag: '真夏の夜の淫夢', operator: 'AND', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2)
      expect(result.every(item => item.tags?.includes('真夏の夜の淫夢'))).toBe(true)
    })
  })

  describe('エッジケース', () => {
    test('同じタグに対して矛盾する条件（AND + NOT）', () => {
      const items = [
        createItem(['タグA']),
        createItem(['タグB'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグA', operator: 'AND', tagType: 'both' },
        { tag: 'タグA', operator: 'NOT', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(0) // 矛盾するため何も返さない
    })

    test('OR条件のみで他の条件なし', () => {
      const items = [
        createItem(['タグA']),
        createItem(['タグB']),
        createItem(['タグC'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'タグD', operator: 'OR', tagType: 'both' },
        { tag: 'タグE', operator: 'OR', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(0) // OR条件のどれも満たさない
    })

    test('大文字小文字の区別なし', () => {
      const items = [
        createItem(['VOCALOID']),
        createItem(['vocaloid']),
        createItem(['Vocaloid'])
      ]
      const conditions: TagCondition[] = [
        { tag: 'vocaloid', operator: 'AND', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(3) // 大文字小文字に関わらずマッチ
    })
  })

  describe('タグタイプ（ロック/ユーザー）のフィルタリング', () => {
    const createItemWithDetails = (tags: Array<{name: string, isLocked: boolean}>): RankingItem => ({
      rank: 1,
      previousRank: 1,
      title: 'テスト動画',
      videoId: 'sm12345',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      viewCount: 1000,
      likeCount: 100,
      mylistCount: 10,
      commentCount: 50,
      lengthSeconds: 300,
      postedAt: '2025-01-01T00:00:00Z',
      tags: tags.map(t => t.name),
      tagDetails: tags
    })

    test('ロックタグのみを対象', () => {
      const items = [
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: '実況プレイ', isLocked: false }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: false },
          { name: '実況プレイ', isLocked: true }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'lock' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1) // ロックされたゲームタグのみ
    })

    test('ユーザータグのみを対象', () => {
      const items = [
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: '実況プレイ', isLocked: false }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: false },
          { name: '実況プレイ', isLocked: true }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'user' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1) // ユーザーが付けたゲームタグのみ
    })

    test('両方のタグタイプを対象（デフォルト）', () => {
      const items = [
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: '実況プレイ', isLocked: false }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: false },
          { name: '実況プレイ', isLocked: true }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'both' }
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2) // ロック・ユーザー両方のゲームタグ
    })

    test('複数のタグタイプ条件の組み合わせ', () => {
      const items = [
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: '実況プレイ', isLocked: false },
          { name: 'ホラー', isLocked: true }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: '実況プレイ', isLocked: true },
          { name: 'アクション', isLocked: false }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: false },
          { name: '実況プレイ', isLocked: false },
          { name: 'RPG', isLocked: false }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'lock' },      // ロックタグのゲーム必須
        { tag: '実況プレイ', operator: 'AND', tagType: 'user' }   // ユーザータグの実況プレイ必須
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1) // 1番目のアイテムのみ条件を満たす
    })

    test('タグタイプを考慮したOR条件', () => {
      const items = [
        createItemWithDetails([
          { name: 'VOCALOID', isLocked: true },
          { name: '初音ミク', isLocked: false }
        ]),
        createItemWithDetails([
          { name: 'VOCALOID', isLocked: false },
          { name: '鏡音リン', isLocked: false }
        ]),
        createItemWithDetails([
          { name: '歌ってみた', isLocked: true },
          { name: '初音ミク', isLocked: true }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'VOCALOID', operator: 'OR', tagType: 'lock' },    // ロックタグのVOCALOID
        { tag: 'VOCALOID', operator: 'OR', tagType: 'user' }     // ユーザータグのVOCALOID
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2) // VOCALOIDタグを持つ2つのアイテム
    })

    test('タグタイプを考慮したNOT条件', () => {
      const items = [
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: 'R-18', isLocked: true }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: 'R-18', isLocked: false }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },
          { name: '全年齢対象', isLocked: false }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'both' },
        { tag: 'R-18', operator: 'NOT', tagType: 'lock' }  // ロックタグのR-18を除外
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(2) // ロックタグのR-18がない2つのアイテム
    })

    test('実際のユースケース：ジャンルタグ（ロック）＋ユーザータグの組み合わせ', () => {
      const items = [
        createItemWithDetails([
          { name: 'エンターテイメント', isLocked: true },    // ジャンルタグ（ロック）
          { name: '真夏の夜の淫夢', isLocked: false },      // ユーザータグ
          { name: '例のアレ', isLocked: false }             // ユーザータグ
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true },              // ジャンルタグ（ロック）
          { name: '真夏の夜の淫夢', isLocked: false },      // ユーザータグ
          { name: 'biimシステム', isLocked: false }         // ユーザータグ
        ]),
        createItemWithDetails([
          { name: 'エンターテイメント', isLocked: true },    // ジャンルタグ（ロック）
          { name: '例のアレ', isLocked: false },             // ユーザータグ
          { name: 'ホモと見る', isLocked: false }           // ユーザータグ
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'エンターテイメント', operator: 'AND', tagType: 'lock' },  // ジャンルをロックタグで指定
        { tag: '真夏の夜の淫夢', operator: 'AND', tagType: 'user' }       // 特定のユーザータグ
      ]
      const result = applyCustomFilters(items, conditions)
      expect(result).toHaveLength(1) // エンタメジャンルで淫夢タグを持つもののみ
    })

    test('tagDetailsがない場合の後方互換性', () => {
      const itemWithDetails = createItemWithDetails([
        { name: 'ゲーム', isLocked: true }
      ])
      const itemWithoutDetails: RankingItem = {
        ...itemWithDetails,
        tagDetails: undefined,
        tags: ['ゲーム']
      }
      
      const items = [itemWithDetails, itemWithoutDetails]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: 'lock' }
      ]
      const result = applyCustomFilters(items, conditions)
      // tagDetailsがない場合もタグタイプに関わらず一致とする（後方互換性）
      expect(result).toHaveLength(2)
    })

    test('tagTypeが未定義の場合の後方互換性', () => {
      const items = [
        createItemWithDetails([
          { name: 'ゲーム', isLocked: true }
        ]),
        createItemWithDetails([
          { name: 'ゲーム', isLocked: false }
        ])
      ]
      const conditions: TagCondition[] = [
        { tag: 'ゲーム', operator: 'AND', tagType: undefined as any }
      ]
      const result = applyCustomFilters(items, conditions)
      // tagTypeが未定義の場合は両方を対象とする（後方互換性）
      expect(result).toHaveLength(2)
    })
  })
})