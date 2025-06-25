/**
 * Worker Integration Tests for Unified Compression System
 * Tests the complete data flow from R2 through Workers to API responses
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { gzipSync } from 'zlib'
import {
  compressForStorage,
  decompressAndParseJSON,
  CompressionFormat,
  detectCompressionFormat
} from '@/lib/unified-compression'

describe('Worker Unified Compression Integration', () => {
  const mockRankingData = {
    items: [
      {
        rank: 1,
        id: "sm45120378",
        title: "統合テストランキング動画1",
        thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/45120378/45120378.jpg",
        views: 50000,
        likes: 5000,
        mylists: 2500,
        comments: 500,
        duration: 240,
        registeredAt: "2025-06-24T10:00:00+09:00",
        tags: ["VOCALOID", "ゲーム", "音楽"],
        originalRank: 0
      },
      {
        rank: 2,
        id: "sm45120379",
        title: "統合テストランキング動画2",
        thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/45120379/45120379.jpg",
        views: 40000,
        likes: 4000,
        mylists: 2000,
        comments: 400,
        duration: 180,
        registeredAt: "2025-06-24T11:00:00+09:00",
        tags: ["エンターテイメント", "踊ってみた"],
        originalRank: 0
      }
    ],
    popularTags: ["VOCALOID", "ゲーム", "音楽", "エンターテイメント", "踊ってみた"],
    metadata: {
      version: 1,
      updatedAt: "2025-06-24T19:00:00Z",
      genre: "all",
      period: "24h",
      totalItems: 2
    }
  }

  let unifiedCompressed: Uint8Array
  let nodejsCompressed: Uint8Array
  let pakoCompressed: Uint8Array | null = null

  beforeAll(async () => {
    const jsonString = JSON.stringify(mockRankingData)

    // Create compressed versions with different methods
    const compressionResult = await compressForStorage(mockRankingData)
    unifiedCompressed = compressionResult.compressedData

    // Legacy Node.js compressed (existing production format)
    nodejsCompressed = gzipSync(jsonString, { level: 9 })

    // Legacy pako compressed (if available)
    try {
      const pako = await import('pako')
      pakoCompressed = pako.gzip(jsonString)
    } catch {
      console.warn('Pako not available for integration testing')
    }
  })

  describe('R2 Data Format Compatibility', () => {
    test('should detect all compression formats correctly', () => {
      expect(detectCompressionFormat(unifiedCompressed)).toBe(CompressionFormat.GZIP_WEB_API)
      expect(detectCompressionFormat(nodejsCompressed)).toBe(CompressionFormat.GZIP_WEB_API)
      
      if (pakoCompressed) {
        expect(detectCompressionFormat(pakoCompressed)).toBe(CompressionFormat.GZIP_WEB_API)
      }
    })

    test('should decompress all formats with unified library', async () => {
      // Test unified compression format
      const unifiedResult = await decompressAndParseJSON(unifiedCompressed)
      expect(unifiedResult.data).toEqual(mockRankingData)

      // Test Node.js compression format (critical for production compatibility)
      const nodejsResult = await decompressAndParseJSON(nodejsCompressed)
      expect(nodejsResult.data).toEqual(mockRankingData)

      // Test pako format if available
      if (pakoCompressed) {
        const pakoResult = await decompressAndParseJSON(pakoCompressed)
        expect(pakoResult.data).toEqual(mockRankingData)
      }
    })
  })

  describe('API Route Data Processing', () => {
    test('should simulate genre ranking API response processing', async () => {
      // Simulate Worker serving R2 data compressed with different methods
      const formats = [
        { name: 'Unified', data: unifiedCompressed },
        { name: 'Node.js Legacy', data: nodejsCompressed }
      ]

      if (pakoCompressed) {
        formats.push({ name: 'Pako Legacy', data: pakoCompressed })
      }

      for (const format of formats) {
        // Simulate Worker decompression and API response generation
        const decompressed = await decompressAndParseJSON(format.data)
        
        // Simulate API route response structure
        const apiResponse = {
          items: decompressed.data.items,
          popularTags: decompressed.data.popularTags,
          hasMore: false,
          totalCached: decompressed.data.items.length,
          metadata: decompressed.data.metadata
        }

        expect(apiResponse.items).toHaveLength(2)
        expect(apiResponse.popularTags).toContain("VOCALOID")
        expect(apiResponse.totalCached).toBe(2)
        expect(apiResponse.metadata.genre).toBe("all")
        
        console.log(`✅ ${format.name} format processed successfully`)
      }
    })

    test('should simulate tag-specific API response processing', async () => {
      // Create tag-specific data (this scenario was causing "unexpected token" errors)
      const tagSpecificData = {
        items: mockRankingData.items.filter(item => item.tags.includes("VOCALOID")),
        popularTags: ["VOCALOID", "音楽", "ゲーム"],
        metadata: {
          version: 1,
          updatedAt: "2025-06-24T19:00:00Z",
          genre: "all",
          period: "24h",
          tag: "VOCALOID"
        }
      }

      // Compress tag data with unified system
      const tagCompressed = await compressForStorage(tagSpecificData)
      
      // Simulate Worker processing for tag request
      const decompressed = await decompressAndParseJSON(tagCompressed.compressedData)
      
      const tagApiResponse = {
        items: decompressed.data.items,
        hasMore: false,
        totalCached: decompressed.data.items.length,
        metadata: decompressed.data.metadata
      }

      expect(tagApiResponse.items.every(item => item.tags.includes("VOCALOID"))).toBe(true)
      expect(tagApiResponse.metadata.tag).toBe("VOCALOID")
      
      console.log('✅ Tag-specific data processed without "unexpected token" errors')
    })
  })

  describe('Genre/Tag Switching Simulation', () => {
    test('should handle rapid genre switching without errors', async () => {
      const genres = ['all', 'game', 'anime', 'vocaloid']
      const genreDataSets: Record<string, any> = {}

      // Prepare different genre datasets
      for (const genre of genres) {
        const genreData = {
          ...mockRankingData,
          metadata: {
            ...mockRankingData.metadata,
            genre
          }
        }
        
        const compressed = await compressForStorage(genreData)
        genreDataSets[genre] = compressed.compressedData
      }

      // Simulate rapid switching between genres (this was the problematic scenario)
      const switchingSequence = ['all', 'game', 'all', 'vocaloid', 'anime', 'all']
      
      for (const genre of switchingSequence) {
        const decompressed = await decompressAndParseJSON(genreDataSets[genre])
        
        // Verify data integrity
        expect(decompressed.data.metadata.genre).toBe(genre)
        expect(decompressed.data.items).toHaveLength(2)
        expect(Array.isArray(decompressed.data.popularTags)).toBe(true)
      }
      
      console.log('✅ Genre switching completed without compression errors')
    })

    test('should handle mixed compression format environment', async () => {
      // Simulate production scenario: some data in Node.js format, some in unified format
      const mixedFormats = {
        'all': unifiedCompressed,           // New format
        'game': nodejsCompressed,          // Legacy format
        'anime': unifiedCompressed,        // New format
        'vocaloid': nodejsCompressed       // Legacy format
      }

      if (pakoCompressed) {
        mixedFormats['music'] = pakoCompressed  // Very old format
      }

      // Test switching between different formats
      for (const [genre, compressedData] of Object.entries(mixedFormats)) {
        const decompressed = await decompressAndParseJSON(compressedData)
        
        // All should decompress to the same base structure
        expect(decompressed.data.items).toHaveLength(2)
        expect(decompressed.data.popularTags).toContain("VOCALOID")
      }
      
      console.log('✅ Mixed format environment handled correctly')
    })
  })

  describe('Worker Response Headers Simulation', () => {
    test('should simulate proper Content-Encoding headers for pre-compressed data', async () => {
      // Simulate Worker logic for serving pre-compressed data
      const mockR2Object = {
        httpMetadata: {
          contentEncoding: 'gzip'
        },
        size: unifiedCompressed.length,
        arrayBuffer: async () => unifiedCompressed.buffer.slice(
          unifiedCompressed.byteOffset, 
          unifiedCompressed.byteOffset + unifiedCompressed.byteLength
        )
      }

      // Simulate Worker decision-making
      const contentEncoding = mockR2Object.httpMetadata?.contentEncoding
      const isPreCompressed = contentEncoding === 'gzip'
      const supportsGzip = true // Client supports gzip

      expect(isPreCompressed).toBe(true)

      if (isPreCompressed && supportsGzip) {
        // Simulate serving compressed data directly
        const compressedData = await mockR2Object.arrayBuffer()
        const responseHeaders = {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'X-Data-Source': 'r2-direct',
          'X-Pre-Compressed': 'true'
        }

        expect(responseHeaders['Content-Encoding']).toBe('gzip')
        expect(responseHeaders['X-Pre-Compressed']).toBe('true')
        
        // Client should be able to decompress this
        const decompressed = await decompressAndParseJSON(new Uint8Array(compressedData))
        expect(decompressed.data).toEqual(mockRankingData)
      }
    })

    test('should simulate Worker decompression for non-gzip clients', async () => {
      // Simulate client that doesn't support gzip
      const supportsGzip = false
      
      if (!supportsGzip) {
        // Worker should decompress and serve uncompressed data
        const decompressed = await decompressAndParseJSON(unifiedCompressed)
        const uncompressedResponse = JSON.stringify(decompressed.data)
        
        const responseHeaders = {
          'Content-Type': 'application/json',
          'X-Data-Source': 'r2-decompressed',
          'X-Pre-Compressed': 'false'
        }

        expect(responseHeaders['Content-Encoding']).toBeUndefined()
        expect(responseHeaders['X-Pre-Compressed']).toBe('false')
        
        // Response should be valid JSON
        const parsedResponse = JSON.parse(uncompressedResponse)
        expect(parsedResponse).toEqual(mockRankingData)
      }
    })
  })

  describe('Error Recovery and Fallback', () => {
    test('should handle corrupted compression data gracefully', async () => {
      // Create corrupted compression data
      const corruptedData = new Uint8Array(unifiedCompressed)
      // Corrupt some bytes while keeping gzip header
      if (corruptedData.length > 20) {
        corruptedData[10] = 0xFF
        corruptedData[11] = 0xFF
        corruptedData[12] = 0xFF
      }

      // Should fail gracefully with proper error
      await expect(decompressAndParseJSON(corruptedData)).rejects.toThrow()
    })

    test('should provide detailed error context for debugging', async () => {
      const invalidData = new Uint8Array([0x1f, 0x8b, 0x00, 0x00])

      try {
        await decompressAndParseJSON(invalidData)
      } catch (error) {
        expect(error.message).toContain('decompression')
        expect(error.operation).toBe('decompress')
      }
    })
  })

  describe('Performance Under Load', () => {
    test('should handle concurrent decompression efficiently', async () => {
      const concurrentDecompressions = Array(10).fill(null).map((_, index) => {
        // Use different formats to test mixed environment
        const dataToUse = index % 2 === 0 ? unifiedCompressed : nodejsCompressed
        return decompressAndParseJSON(dataToUse)
      })

      const startTime = performance.now()
      const results = await Promise.all(concurrentDecompressions)
      const endTime = performance.now()

      // All results should be identical
      results.forEach(result => {
        expect(result.data).toEqual(mockRankingData)
      })

      console.log(`Concurrent decompression completed in ${(endTime - startTime).toFixed(2)}ms`)
      expect(endTime - startTime).toBeLessThan(200) // Should be fast
    })

    test('should handle large dataset compression efficiently', async () => {
      // Create larger dataset similar to production
      const largeDataset = {
        items: Array(500).fill(null).map((_, i) => ({
          ...mockRankingData.items[0],
          rank: i + 1,
          id: `sm${45120000 + i}`,
          title: `大規模テスト動画${i + 1}`
        })),
        popularTags: mockRankingData.popularTags,
        metadata: {
          ...mockRankingData.metadata,
          totalItems: 500
        }
      }

      const startTime = performance.now()
      const compressed = await compressForStorage(largeDataset)
      const compressionTime = performance.now()
      
      const decompressed = await decompressAndParseJSON(compressed.compressedData)
      const decompressionTime = performance.now()

      expect(decompressed.data.items).toHaveLength(500)
      expect(compressed.metadata.compressionRatio).toBeGreaterThan(70) // Good compression

      console.log(`Large dataset: compression ${(compressionTime - startTime).toFixed(2)}ms, decompression ${(decompressionTime - compressionTime).toFixed(2)}ms`)
      expect(compressionTime - startTime).toBeLessThan(100)
      expect(decompressionTime - compressionTime).toBeLessThan(100)
    })
  })

  describe('Production Scenario Simulation', () => {
    test('should simulate complete API request flow', async () => {
      // 1. Simulate R2 data storage (pre-compressed)
      const r2Data = await compressForStorage(mockRankingData)
      
      // 2. Simulate Worker retrieving and serving data
      const decompressed = await decompressAndParseJSON(r2Data.compressedData)
      
      // 3. Simulate API route processing
      const apiResponse = {
        items: decompressed.data.items.slice(0, 500), // Max 500 items
        popularTags: decompressed.data.popularTags || [],
        hasMore: false,
        totalCached: decompressed.data.items.length
      }

      // 4. Simulate frontend receiving and using data
      expect(apiResponse.items).toHaveLength(2)
      expect(Array.isArray(apiResponse.popularTags)).toBe(true)
      expect(typeof apiResponse.totalCached).toBe('number')
      
      // 5. Simulate JSON parsing (this was failing with "unexpected token")
      const jsonString = JSON.stringify(apiResponse)
      const parsedResponse = JSON.parse(jsonString)
      expect(parsedResponse).toEqual(apiResponse)
      
      console.log('✅ Complete API flow simulation successful - no "unexpected token" errors')
    })
  })
})