/**
 * マイリスト内動画検索のユニットテスト
 * t-wada式TDDで実装
 */

import { describe, it, expect } from 'vitest'
import { searchMylistVideos } from '@/lib/search/video-search'
import type { MylistVideo } from '@/lib/storage/types'

// テスト用のモックデータ
const mockVideos: MylistVideo[] = [
  {
    id: 'sm1001',
    mylistId: 'mylist-1',
    title: '初音ミクの消失',
    thumbURL: 'https://example.com/thumb1.jpg',
    addedAt: Date.now(),
    authorName: 'cosMo@暴走P',
    memo: '神曲'
  },
  {
    id: 'sm1002',
    mylistId: 'mylist-1',
    title: 'Tell Your World',
    thumbURL: 'https://example.com/thumb2.jpg',
    addedAt: Date.now(),
    authorName: 'kz(livetune)',
    memo: 'Google ChromeのCM曲'
  },
  {
    id: 'sm1003',
    mylistId: 'mylist-1',
    title: '千本桜',
    thumbURL: 'https://example.com/thumb3.jpg',
    addedAt: Date.now(),
    authorName: '黒うさP',
    memo: '和風ロック'
  },
  {
    id: 'sm1004',
    mylistId: 'mylist-1',
    title: 'からくりピエロ',
    thumbURL: 'https://example.com/thumb4.jpg',
    addedAt: Date.now(),
    authorName: '40mP',
    memo: null
  },
  {
    id: 'sm1005',
    mylistId: 'mylist-1',
    title: 'ワールドイズマイン',
    thumbURL: 'https://example.com/thumb5.jpg',
    addedAt: Date.now(),
    authorName: 'ryo(supercell)',
    // memoなし
  }
]

describe('searchMylistVideos', () => {
  describe('タイトル検索', () => {
    it('完全一致するタイトルを検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '千本桜',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('千本桜')
    })

    it('部分一致するタイトルを検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'ワールド',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(2)
      expect(result.map(v => v.title)).toContain('Tell Your World')
      expect(result.map(v => v.title)).toContain('ワールドイズマイン')
    })

    it('大文字小文字を区別せずに検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'tell',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('Tell Your World')
    })

    it('空文字で検索するとすべての動画を返す', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(mockVideos.length)
    })

    it('該当する動画がない場合は空配列を返す', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '存在しないタイトル',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(0)
    })
  })

  describe('投稿者名検索', () => {
    it('完全一致する投稿者名を検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '黒うさP',
        searchFields: ['author']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].authorName).toBe('黒うさP')
    })

    it('部分一致する投稿者名を検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'P',
        searchFields: ['author']
      })
      
      expect(result).toHaveLength(3)
      const authors = result.map(v => v.authorName)
      expect(authors).toContain('cosMo@暴走P')
      expect(authors).toContain('黒うさP')
      expect(authors).toContain('40mP')
    })

    it('投稿者名が存在しない動画は検索結果に含まれない', () => {
      const videosWithoutAuthor: MylistVideo[] = [
        ...mockVideos,
        {
          id: 'sm1006',
          mylistId: 'mylist-1',
          title: '投稿者不明の動画',
          thumbURL: 'https://example.com/thumb6.jpg',
          addedAt: Date.now(),
          // authorNameなし
        }
      ]
      
      const result = searchMylistVideos(videosWithoutAuthor, {
        searchQuery: 'P',
        searchFields: ['author']
      })
      
      expect(result).toHaveLength(3)
      expect(result.every(v => v.authorName)).toBe(true)
    })
  })

  describe('メモ検索', () => {
    it('完全一致するメモを検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '神曲',
        searchFields: ['memo']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].memo).toBe('神曲')
    })

    it('部分一致するメモを検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'CM',
        searchFields: ['memo']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].memo).toBe('Google ChromeのCM曲')
    })

    it('メモがnullまたは未定義の動画は検索結果に含まれない', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'ロック',
        searchFields: ['memo']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].memo).toBe('和風ロック')
    })
  })

  describe('複数フィールド検索', () => {
    it('タイトルと投稿者名の両方で検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'P',
        searchFields: ['title', 'author']
      })
      
      expect(result).toHaveLength(3)
      // タイトルまたは投稿者名に'P'が含まれる動画
      const resultIds = result.map(v => v.id)
      expect(resultIds).toContain('sm1001') // cosMo@暴走P
      expect(resultIds).toContain('sm1003') // 黒うさP
      expect(resultIds).toContain('sm1004') // 40mP
    })

    it('すべてのフィールドで検索できる', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: 'ロック',
        searchFields: ['title', 'author', 'memo']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('sm1003') // メモに'和風ロック'
    })

    it('複数フィールドで同じ動画がヒットしても重複しない', () => {
      const videosWithDuplicate: MylistVideo[] = [
        {
          id: 'sm2001',
          mylistId: 'mylist-1',
          title: 'テストソング by テストP',
          thumbURL: 'https://example.com/thumb.jpg',
          addedAt: Date.now(),
          authorName: 'テストP',
          memo: 'テスト用の曲'
        }
      ]
      
      const result = searchMylistVideos(videosWithDuplicate, {
        searchQuery: 'テスト',
        searchFields: ['title', 'author', 'memo']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('sm2001')
    })
  })

  describe('特殊文字のエスケープ', () => {
    it('正規表現の特殊文字を含む検索ができる', () => {
      const specialVideos: MylistVideo[] = [
        {
          id: 'sm3001',
          mylistId: 'mylist-1',
          title: '[公式] テスト動画 (2023)',
          thumbURL: 'https://example.com/thumb.jpg',
          addedAt: Date.now(),
          authorName: 'test+user@example',
          memo: '.*特殊文字のテスト$'
        }
      ]
      
      const result1 = searchMylistVideos(specialVideos, {
        searchQuery: '[公式]',
        searchFields: ['title']
      })
      expect(result1).toHaveLength(1)
      
      const result2 = searchMylistVideos(specialVideos, {
        searchQuery: 'test+user',
        searchFields: ['author']
      })
      expect(result2).toHaveLength(1)
      
      const result3 = searchMylistVideos(specialVideos, {
        searchQuery: '.*特殊',
        searchFields: ['memo']
      })
      expect(result3).toHaveLength(1)
    })
  })

  describe('日本語検索', () => {
    it('ひらがな・カタカナ・漢字を正しく検索できる', () => {
      const result1 = searchMylistVideos(mockVideos, {
        searchQuery: 'ミク',
        searchFields: ['title']
      })
      expect(result1).toHaveLength(1)
      expect(result1[0].title).toBe('初音ミクの消失')
      
      const result2 = searchMylistVideos(mockVideos, {
        searchQuery: '千本',
        searchFields: ['title']
      })
      expect(result2).toHaveLength(1)
      expect(result2[0].title).toBe('千本桜')
      
      const result3 = searchMylistVideos(mockVideos, {
        searchQuery: 'うさ',
        searchFields: ['author']
      })
      expect(result3).toHaveLength(1)
      expect(result3[0].authorName).toBe('黒うさP')
    })
  })

  describe('空の配列の処理', () => {
    it('空の動画配列を検索すると空配列を返す', () => {
      const result = searchMylistVideos([], {
        searchQuery: 'test',
        searchFields: ['title']
      })
      
      expect(result).toEqual([])
    })
  })

  describe('検索クエリの前後の空白処理', () => {
    it('検索クエリの前後の空白を除去して検索する', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '  千本桜  ',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(1)
      expect(result[0].title).toBe('千本桜')
    })

    it('空白のみの検索クエリはすべての動画を返す', () => {
      const result = searchMylistVideos(mockVideos, {
        searchQuery: '   ',
        searchFields: ['title']
      })
      
      expect(result).toHaveLength(mockVideos.length)
    })
  })
})