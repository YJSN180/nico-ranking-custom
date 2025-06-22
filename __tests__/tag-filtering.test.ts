/**
 * タグフィルタリング機能のテスト
 * R2とAPIゲートウェイを通じたタグ別ランキングの取得を検証
 */

import { describe, it, expect } from 'vitest'

const API_GATEWAY_URL = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://api-ranking.nico-rank.com'

describe('タグフィルタリング機能', () => {
  describe('APIゲートウェイ経由のタグ別ランキング取得', () => {
    it('ゲームジャンルの「実況プレイ動画」タグで正しくデータを取得できる', async () => {
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
      const response = await fetch(`${API_GATEWAY_URL}/api/ranking?genre=game&period=24h&tag=存在しないタグ123456`)
      
      expect(response.status).toBe(200)
      
      const data = await response.json()
      
      expect(data.items).toEqual([])
      expect(data.metadata.tag).toBe('存在しないタグ123456')
    })
    
    it('タグなしの場合は「すべて」のランキングが返される', async () => {
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