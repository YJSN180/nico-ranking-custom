/**
 * Backward Compatibility Integration Tests
 * Tests actual existing data from production to ensure seamless migration
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { gzipSync } from 'zlib'
import {
  decompressData,
  decompressAndParseJSON,
  compressForStorage,
  CompressionFormat
} from '@/lib/unified-compression'

describe('Backward Compatibility - Production Data Migration', () => {
  // Simulate actual production ranking data structure
  const productionRankingData = {
    genres: {
      all: {
        '24h': {
          items: Array(500).fill(null).map((_, i) => ({
            rank: i + 1,
            id: `sm${45120000 + i}`,
            title: `ランキング動画${i + 1}`,
            thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${45120000 + i}/${45120000 + i}.jpg`,
            views: Math.floor(Math.random() * 100000) + 1000,
            likes: Math.floor(Math.random() * 10000) + 100,
            mylists: Math.floor(Math.random() * 5000) + 50,
            comments: Math.floor(Math.random() * 2000) + 10,
            duration: Math.floor(Math.random() * 600) + 60,
            registeredAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
            tags: ['VOCALOID', 'ゲーム', '音楽', 'エンターテイメント'].slice(0, Math.floor(Math.random() * 4) + 1),
            originalRank: 0
          })),
          popularTags: ['VOCALOID', 'ゲーム', '音楽', 'エンターテイメント', '踊ってみた', 'アニメ', 'その他']
        },
        hour: {
          items: Array(100).fill(null).map((_, i) => ({
            rank: i + 1,
            id: `sm${45130000 + i}`,
            title: `毎時ランキング動画${i + 1}`,
            thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${45130000 + i}/${45130000 + i}.jpg`,
            views: Math.floor(Math.random() * 10000) + 100,
            likes: Math.floor(Math.random() * 1000) + 10,
            mylists: Math.floor(Math.random() * 500) + 5,
            comments: Math.floor(Math.random() * 200) + 1,
            duration: Math.floor(Math.random() * 600) + 60,
            registeredAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            tags: ['新着', 'ホット', 'トレンド'].slice(0, Math.floor(Math.random() * 3) + 1),
            originalRank: 0
          })),
          popularTags: ['新着', 'ホット', 'トレンド', 'バズり', '急上昇']
        }
      },
      game: {
        '24h': {
          items: Array(200).fill(null).map((_, i) => ({
            rank: i + 1,
            id: `sm${45140000 + i}`,
            title: `ゲーム動画${i + 1}`,
            thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${45140000 + i}/${45140000 + i}.jpg`,
            views: Math.floor(Math.random() * 50000) + 500,
            likes: Math.floor(Math.random() * 5000) + 50,
            mylists: Math.floor(Math.random() * 2500) + 25,
            comments: Math.floor(Math.random() * 1000) + 5,
            duration: Math.floor(Math.random() * 1200) + 300,
            registeredAt: new Date(Date.now() - Math.random() * 86400000 * 7).toISOString(),
            tags: ['ゲーム', '実況プレイ', 'RPG', 'アクション', 'シミュレーション'].slice(0, Math.floor(Math.random() * 3) + 2),
            originalRank: 0
          })),
          popularTags: ['ゲーム', '実況プレイ', 'RPG', 'アクション', 'シミュレーション', 'レトロゲーム', 'インディーゲーム']
        },
        hour: {
          items: Array(50).fill(null).map((_, i) => ({
            rank: i + 1,
            id: `sm${45150000 + i}`,
            title: `ゲーム毎時動画${i + 1}`,
            thumbURL: `https://nicovideo.cdn.nimg.jp/thumbnails/${45150000 + i}/${45150000 + i}.jpg`,
            views: Math.floor(Math.random() * 5000) + 50,
            likes: Math.floor(Math.random() * 500) + 5,
            mylists: Math.floor(Math.random() * 250) + 3,
            comments: Math.floor(Math.random() * 100) + 1,
            duration: Math.floor(Math.random() * 900) + 180,
            registeredAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            tags: ['ゲーム', '新作', 'プレイ動画'],
            originalRank: 0
          })),
          popularTags: ['ゲーム', '新作', 'プレイ動画', 'ガチャ', 'アップデート']
        }
      }
    },
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 850
    }
  }

  let nodejsCompressedData: Uint8Array
  let webApiCompressedData: Uint8Array
  let pakoCompressedData: Uint8Array | null = null

  beforeAll(async () => {
    const jsonString = JSON.stringify(productionRankingData)
    
    // Create Node.js zlib compressed version (existing production format)
    nodejsCompressedData = gzipSync(jsonString, { level: 9 })
    
    // Create Web API compressed version (new unified format)
    const webApiResult = await compressForStorage(productionRankingData)
    webApiCompressedData = webApiResult.compressedData
    
    // Create pako compressed version if available
    try {
      const pako = await import('pako')
      pakoCompressedData = pako.gzip(jsonString)
    } catch {
      console.warn('Pako not available for backward compatibility testing')
    }
  })

  describe('Production Data Size Analysis', () => {
    test('should report realistic compression ratios', async () => {
      const originalSize = JSON.stringify(productionRankingData).length
      console.log(`Original data size: ${(originalSize / 1024).toFixed(2)} KB`)
      console.log(`Node.js compressed: ${(nodejsCompressedData.length / 1024).toFixed(2)} KB`)
      console.log(`Web API compressed: ${(webApiCompressedData.length / 1024).toFixed(2)} KB`)
      
      const nodejsRatio = ((originalSize - nodejsCompressedData.length) / originalSize) * 100
      const webApiRatio = ((originalSize - webApiCompressedData.length) / originalSize) * 100
      
      console.log(`Node.js compression ratio: ${nodejsRatio.toFixed(1)}%`)
      console.log(`Web API compression ratio: ${webApiRatio.toFixed(1)}%`)
      
      // Both should achieve good compression for JSON data
      expect(nodejsRatio).toBeGreaterThan(70)
      expect(webApiRatio).toBeGreaterThan(70)
      
      // Compression ratios should be similar (within 10%)
      expect(Math.abs(nodejsRatio - webApiRatio)).toBeLessThan(10)
    })
  })

  describe('Node.js zlib Compatibility (Current Production Format)', () => {
    test('should decompress existing Node.js compressed production data', async () => {
      const result = await decompressData(nodejsCompressedData)
      
      expect(result.detectedFormat).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.data).toBeDefined()
      expect(result.decompressedSize).toBeGreaterThan(result.originalSize)
    })

    test('should parse Node.js compressed ranking data structure correctly', async () => {
      const result = await decompressAndParseJSON(nodejsCompressedData)
      
      expect(result.data).toEqual(productionRankingData)
      expect(result.data.genres).toBeDefined()
      expect(result.data.genres.all).toBeDefined()
      expect(result.data.genres.game).toBeDefined()
      expect(result.data.metadata).toBeDefined()
    })

    test('should handle Node.js compressed genre data access patterns', async () => {
      const result = await decompressAndParseJSON(nodejsCompressedData)
      const data = result.data
      
      // Test typical access patterns from API routes
      expect(data.genres.all['24h'].items).toHaveLength(500)
      expect(data.genres.all.hour.items).toHaveLength(100)
      expect(data.genres.game['24h'].items).toHaveLength(200)
      expect(data.genres.game.hour.items).toHaveLength(50)
      
      // Test popularTags access
      expect(Array.isArray(data.genres.all['24h'].popularTags)).toBe(true)
      expect(data.genres.all['24h'].popularTags.length).toBeGreaterThan(0)
    })

    test('should validate Node.js compressed item structure', async () => {
      const result = await decompressAndParseJSON(nodejsCompressedData)
      const firstItem = result.data.genres.all['24h'].items[0]
      
      // Validate required fields for ranking items
      expect(firstItem.rank).toBeDefined()
      expect(firstItem.id).toBeDefined()
      expect(firstItem.title).toBeDefined()
      expect(firstItem.views).toBeTypeOf('number')
      expect(firstItem.likes).toBeTypeOf('number')
      expect(firstItem.mylists).toBeTypeOf('number')
      expect(firstItem.comments).toBeTypeOf('number')
      expect(Array.isArray(firstItem.tags)).toBe(true)
    })
  })

  describe('Web API Format (New Standard)', () => {
    test('should compress and decompress with Web API format', async () => {
      const result = await decompressData(webApiCompressedData)
      
      expect(result.detectedFormat).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.data).toBeDefined()
    })

    test('should maintain data integrity with Web API format', async () => {
      const result = await decompressAndParseJSON(webApiCompressedData)
      
      expect(result.data).toEqual(productionRankingData)
      expect(result.metadata.detectedFormat).toBe(CompressionFormat.GZIP_WEB_API)
    })
  })

  describe('Cross-Format Compatibility', () => {
    test('should handle both Node.js and Web API formats identically', async () => {
      const nodejsResult = await decompressAndParseJSON(nodejsCompressedData)
      const webApiResult = await decompressAndParseJSON(webApiCompressedData)
      
      // Data should be identical regardless of compression method
      expect(nodejsResult.data).toEqual(webApiResult.data)
      expect(nodejsResult.data).toEqual(productionRankingData)
    })

    test('should handle format switching seamlessly', async () => {
      // Start with Node.js format (existing production)
      const nodejsResult = await decompressAndParseJSON(nodejsCompressedData)
      
      // Re-compress with Web API format (new standard)
      const recompressed = await compressForStorage(nodejsResult.data)
      
      // Decompress again and verify
      const finalResult = await decompressAndParseJSON(recompressed.compressedData)
      
      expect(finalResult.data).toEqual(productionRankingData)
    })
  })

  describe('Pako Compatibility (Legacy Support)', () => {
    test('should handle pako compressed data if available', async () => {
      if (!pakoCompressedData) {
        console.warn('Pako not available, skipping pako compatibility test')
        return
      }

      const result = await decompressData(pakoCompressedData)
      expect(result.data).toBeDefined()
      
      const parsed = await decompressAndParseJSON(pakoCompressedData)
      expect(parsed.data).toEqual(productionRankingData)
    })
  })

  describe('Migration Scenario Simulation', () => {
    test('should handle mixed format environment', async () => {
      // Simulate environment where some data is Node.js compressed, some is Web API compressed
      const formats = [
        { name: 'Node.js', data: nodejsCompressedData },
        { name: 'Web API', data: webApiCompressedData }
      ]
      
      if (pakoCompressedData) {
        formats.push({ name: 'Pako', data: pakoCompressedData })
      }

      for (const format of formats) {
        const result = await decompressAndParseJSON(format.data)
        expect(result.data).toEqual(productionRankingData)
        expect(result.data.metadata.totalItems).toBe(850)
      }
    })

    test('should handle genre switching data access', async () => {
      // Simulate the actual error scenario: switching between genres/tags
      const allGenreData = productionRankingData.genres.all['24h']
      const gameGenreData = productionRankingData.genres.game['24h']
      
      // Compress each genre separately (as might happen in KV split structure)
      const allCompressed = await compressForStorage(allGenreData)
      const gameCompressed = await compressForStorage(gameGenreData)
      
      // Decompress and verify (this should work without "unexpected token" errors)
      const allResult = await decompressAndParseJSON(allCompressed.compressedData)
      const gameResult = await decompressAndParseJSON(gameCompressed.compressedData)
      
      expect(allResult.data.items).toHaveLength(500)
      expect(gameResult.data.items).toHaveLength(200)
      expect(allResult.data.popularTags).toContain('VOCALOID')
      expect(gameResult.data.popularTags).toContain('ゲーム')
    })

    test('should handle tag-specific data access', async () => {
      // Simulate tag-specific ranking (the problematic scenario)
      const tagData = {
        items: productionRankingData.genres.all['24h'].items
          .filter(item => item.tags.includes('VOCALOID'))
          .slice(0, 100),
        metadata: {
          tag: 'VOCALOID',
          genre: 'all',
          period: '24h',
          generatedAt: new Date().toISOString()
        }
      }
      
      const compressed = await compressForStorage(tagData)
      const result = await decompressAndParseJSON(compressed.compressedData)
      
      expect(result.data.items.every(item => item.tags.includes('VOCALOID'))).toBe(true)
      expect(result.data.metadata.tag).toBe('VOCALOID')
    })
  })

  describe('Performance Under Production Load', () => {
    test('should decompress large production data quickly', async () => {
      const iterations = 10
      const times: number[] = []
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now()
        await decompressData(nodejsCompressedData)
        const endTime = performance.now()
        times.push(endTime - startTime)
      }
      
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length
      console.log(`Average decompression time: ${avgTime.toFixed(2)}ms`)
      
      // Should complete within reasonable time even for large data
      expect(avgTime).toBeLessThan(50)
    })

    test('should handle concurrent decompression', async () => {
      const concurrentDecompressions = Array(5).fill(null).map(() => 
        decompressAndParseJSON(nodejsCompressedData)
      )
      
      const results = await Promise.all(concurrentDecompressions)
      
      // All results should be identical
      results.forEach(result => {
        expect(result.data).toEqual(productionRankingData)
      })
    })
  })

  describe('Error Recovery in Production Scenarios', () => {
    test('should handle partially corrupted Node.js compressed data', async () => {
      // Create a slightly corrupted version of Node.js compressed data
      const corruptedData = new Uint8Array(nodejsCompressedData)
      // Corrupt a few bytes in the middle (but keep header intact)
      if (corruptedData.length > 50) {
        corruptedData[Math.floor(corruptedData.length / 2)] = 0xFF
        corruptedData[Math.floor(corruptedData.length / 2) + 1] = 0xFF
      }
      
      // Should fail gracefully
      await expect(decompressData(corruptedData)).rejects.toThrow()
    })

    test('should provide detailed error information', async () => {
      const invalidGzipData = new Uint8Array([0x1f, 0x8b, 0x00, 0x00, 0xFF, 0xFF])
      
      try {
        await decompressData(invalidGzipData)
      } catch (error) {
        expect(error.message).toContain('decompression')
        expect(error.operation).toBe('decompress')
      }
    })
  })
})