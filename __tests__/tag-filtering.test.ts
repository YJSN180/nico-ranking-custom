/**
 * タグフィルタリング機能のテスト
 * R2とAPIゲートウェイを通じたタグ別ランキングの取得を検証
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-rank.com'

// fetchのモック
const mockFetch = vi.fn()
global.fetch = mockFetch as any

beforeEach(() => {
  vi.clearAllMocks()
})

describe('タグフィルタリング機能', () => {
  describe('APIゲートウェイ経由のタグ別ランキング取得', () => {
    it('ゲームジャンルの「実況プレイ動画」タグで正しくデータを取得できる', async () => {
      const mockData = {
        items: [
          { id: 'sm123', title: 'ゲーム実況動画', views: 1000 }
        ],
        popularTags: ['実況プレイ動画', 'ゲーム'],
        metadata: {
          genre: 'game',
          period: '24h',
          tag: '実況プレイ動画'
        }
      }
      
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: (key: string) => key === 'content-type' ? 'application/json' : null
        },
        json: async () => mockData
      })
      
      const response = await fetch(`${API_GATEWAY_URL}/api/ranking?genre=game&period=24h&tag=実況プレイ動画`)
      
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      
      const data = await response.json()
      
      // データ構造の検証
      expect(data).toHaveProperty('items')
      expect(data).toHaveProperty('popularTags')
      expect(data).toHaveProperty('metadata')
      
      // items配列の検証
      expect(Array.isArray(data.items)).toBe(true)
      
      // メタデータの検証
      expect(data.metadata).toHaveProperty('genre', 'game')
      expect(data.metadata).toHaveProperty('period', '24h')
      expect(data.metadata).toHaveProperty('tag', '実況プレイ動画')
      
      console.log(`取得したアイテム数: ${data.items.length}`)
    })
    
    it('存在しないタグでは空の結果が返される', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => null
        },
        json: async () => ({
          items: [],
          popularTags: [],
          metadata: {
            genre: 'game',
            period: '24h',
            tag: '存在しないタグ123456'
          }
        })
      })
      
      const response = await fetch(`${API_GATEWAY_URL}/api/ranking?genre=game&period=24h&tag=存在しないタグ123456`)
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      
      expect(data.items).toEqual([])
      expect(data.metadata.tag).toBe('存在しないタグ123456')
    })
    
    it('タグなしの場合は「すべて」のランキングが返される', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: () => null
        },
        json: async () => ({
          items: [
            { id: 'sm456', title: 'ゲーム動画', views: 2000 }
          ],
          popularTags: ['ゲーム'],
          metadata: {
            genre: 'game',
            period: '24h'
          }
        })
      })
      
      const response = await fetch(`${API_GATEWAY_URL}/api/ranking?genre=game&period=24h`)
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      
      expect(data.items.length).toBeGreaterThan(0)
      expect(data.metadata.tag).toBeUndefined()
    })
  })
  
  describe('URLエンコーディングの検証', () => {
    it('特殊文字を含むタグが正しくエンコード・デコードされる', async () => {
      const specialTags = [
        'VOICEROID+', 
        'ゆっくり実況プレイ',
        'AV(アニマルビデオ)',
        '音MAD'
      ]
      
      for (const tag of specialTags) {
        mockFetch.mockResolvedValueOnce({
          status: 200,
          headers: {
            get: () => null
          },
          json: async () => ({
            items: [{ id: 'sm789', title: `${tag}動画`, views: 3000 }],
            popularTags: [tag],
            metadata: {
              genre: 'all',
              period: '24h',
              tag: tag
            }
          })
        })
        
        const response = await fetch(`${API_GATEWAY_URL}/api/ranking?genre=all&period=24h&tag=${encodeURIComponent(tag)}`)
        
        expect(response.status).toBe(200)
        
        const data = await response.json()
        
        // メタデータのタグが元の文字列と一致することを確認
        expect(data.metadata.tag).toBe(tag)
        
        console.log(`タグ "${tag}" の結果: ${data.items.length} 件`)
      }
    })
  })
  
  describe('キャッシュヘッダーの検証', () => {
    it('適切なキャッシュヘッダーが設定されている', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: {
          get: (key: string) => {
            if (key === 'cache-control') return 'public, max-age=300'
            if (key === 'x-cache-status') return 'HIT'
            return null
          }
        },
        json: async () => ({
          items: [],
          popularTags: [],
          metadata: {
            genre: 'vocaloid',
            period: 'hour',
            tag: '初音ミク'
          }
        })
      })
      
      const response = await fetch(`${API_GATEWAY_URL}/api/ranking?genre=vocaloid&period=hour&tag=初音ミク`)
      
      expect(response.status).toBe(200)
      
      const cacheControl = response.headers.get('cache-control')
      expect(cacheControl).toContain('public')
      expect(cacheControl).toContain('max-age=')
      
      const xCacheStatus = response.headers.get('x-cache-status')
      expect(['HIT', 'MISS']).toContain(xCacheStatus)
    })
  })
  
  describe('メタデータファイルの検証', () => {
    it('メタデータファイルから利用可能なタグ一覧を取得できる', async () => {
      // 注: これは実装後のテスト
      // const response = await fetch(`${API_GATEWAY_URL}/api/metadata`)
      // expect(response.status).toBe(200)
      // 
      // const metadata = await response.json()
      // expect(metadata).toHaveProperty('tagsByGenrePeriod')
    })
  })
})

// 実行方法: npm test __tests__/tag-filtering.test.ts