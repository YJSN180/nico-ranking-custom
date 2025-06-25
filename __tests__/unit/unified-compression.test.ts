/**
 * Comprehensive Unit Tests for Unified Compression Library
 * Tests all compression formats, backward compatibility, and error scenarios
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import {
  compressData,
  decompressData,
  detectCompressionFormat,
  CompressionFormat,
  compressForStorage,
  decompressAndParseJSON,
  validateAndParseJSON,
  UnifiedCompressionError
} from '@/lib/unified-compression'
import { gzipSync } from 'zlib'

describe('Unified Compression Library', () => {
  const testData = {
    items: [
      {
        id: "sm45120378",
        title: "テストランキング動画1",
        viewCount: 10000,
        mylistCount: 500,
        commentCount: 100,
        likeCount: 1000,
        tags: ["VOCALOID", "ゲーム"],
        rank: 1
      },
      {
        id: "sm45120379", 
        title: "テストランキング動画2",
        viewCount: 8000,
        mylistCount: 400,
        commentCount: 80,
        likeCount: 800,
        tags: ["踊ってみた", "音楽"],
        rank: 2
      }
    ],
    popularTags: ["VOCALOID", "ゲーム", "踊ってみた", "音楽"],
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString(),
      totalItems: 2
    }
  }

  const testJsonString = JSON.stringify(testData)
  let webApiCompressed: Uint8Array
  let nodejsCompressed: Uint8Array

  beforeAll(async () => {
    // Pre-compress test data with different methods
    const webApiResult = await compressData(testData)
    webApiCompressed = webApiResult.data

    // Create Node.js compressed version for compatibility testing
    nodejsCompressed = gzipSync(testJsonString, { level: 9 })
  })

  describe('Format Detection', () => {
    test('should detect gzip format correctly', () => {
      expect(detectCompressionFormat(webApiCompressed)).toBe(CompressionFormat.GZIP_WEB_API)
      expect(detectCompressionFormat(nodejsCompressed)).toBe(CompressionFormat.GZIP_WEB_API)
    })

    test('should detect uncompressed format', () => {
      const uncompressedData = new TextEncoder().encode(testJsonString)
      expect(detectCompressionFormat(uncompressedData)).toBe(CompressionFormat.UNCOMPRESSED)
    })

    test('should handle empty data', () => {
      const emptyData = new Uint8Array(0)
      expect(detectCompressionFormat(emptyData)).toBe(CompressionFormat.UNCOMPRESSED)
    })

    test('should handle malformed data', () => {
      const malformedData = new Uint8Array([0x1f]) // Only first magic byte
      expect(detectCompressionFormat(malformedData)).toBe(CompressionFormat.UNCOMPRESSED)
    })
  })

  describe('Compression', () => {
    test('should compress string data successfully', async () => {
      const result = await compressData(testJsonString)
      
      expect(result.format).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.data).toBeInstanceOf(Uint8Array)
      expect(result.compressedSize).toBeLessThan(result.originalSize)
      expect(result.compressionRatio).toBeGreaterThan(0)
      
      // Check gzip magic numbers
      expect(result.data[0]).toBe(0x1f)
      expect(result.data[1]).toBe(0x8b)
    })

    test('should compress object data successfully', async () => {
      const result = await compressData(testData)
      
      expect(result.format).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.data).toBeInstanceOf(Uint8Array)
      expect(result.compressedSize).toBeLessThan(result.originalSize)
      expect(result.compressionRatio).toBeGreaterThan(0)
    })

    test('should handle large data compression', async () => {
      const largeData = {
        items: Array(1000).fill(testData.items[0]),
        metadata: testData.metadata
      }
      
      const result = await compressData(largeData)
      expect(result.compressionRatio).toBeGreaterThan(50) // Should achieve good compression
    })

    test('should handle empty string compression', async () => {
      const result = await compressData('')
      expect(result.format).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.originalSize).toBe(0)
    })
  })

  describe('Decompression - Web API Format', () => {
    test('should decompress Web API compressed data', async () => {
      const result = await decompressData(webApiCompressed)
      
      expect(result.detectedFormat).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.data).toBe(testJsonString)
      expect(result.decompressedSize).toBeGreaterThan(result.originalSize)
    })

    test('should decompress and validate JSON structure', async () => {
      const decompressed = await decompressData(webApiCompressed)
      const parsed = validateAndParseJSON(decompressed.data)
      
      expect(parsed).toEqual(testData)
      expect(parsed.items).toHaveLength(2)
      expect(parsed.popularTags).toContain("VOCALOID")
    })
  })

  describe('Backward Compatibility - Node.js zlib', () => {
    test('should decompress Node.js zlib compressed data', async () => {
      const result = await decompressData(nodejsCompressed)
      
      expect(result.detectedFormat).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.data).toBe(testJsonString)
    })

    test('should parse Node.js compressed JSON correctly', async () => {
      const decompressed = await decompressData(nodejsCompressed)
      const parsed = validateAndParseJSON(decompressed.data)
      
      expect(parsed).toEqual(testData)
    })
  })

  describe('Backward Compatibility - Pako', () => {
    test('should handle pako compressed data if available', async () => {
      try {
        // Try to import pako for testing
        const pako = await import('pako')
        const pakoCompressed = pako.gzip(testJsonString)
        
        const result = await decompressData(pakoCompressed)
        expect(result.data).toBe(testJsonString)
      } catch (error) {
        // Pako might not be available in test environment
        console.warn('Pako not available for testing:', error)
      }
    })
  })

  describe('Uncompressed Data Handling', () => {
    test('should handle uncompressed JSON data', async () => {
      const uncompressedData = new TextEncoder().encode(testJsonString)
      const result = await decompressData(uncompressedData)
      
      expect(result.detectedFormat).toBe(CompressionFormat.UNCOMPRESSED)
      expect(result.data).toBe(testJsonString)
      expect(result.originalSize).toBe(result.decompressedSize)
    })

    test('should parse uncompressed JSON correctly', async () => {
      const uncompressedData = new TextEncoder().encode(testJsonString)
      const decompressed = await decompressData(uncompressedData)
      const parsed = validateAndParseJSON(decompressed.data)
      
      expect(parsed).toEqual(testData)
    })
  })

  describe('High-Level Helper Functions', () => {
    test('compressForStorage should return complete metadata', async () => {
      const result = await compressForStorage(testData)
      
      expect(result.compressedData).toBeInstanceOf(Uint8Array)
      expect(result.metadata.format).toBe(CompressionFormat.GZIP_WEB_API)
      expect(result.metadata.originalSize).toBeGreaterThan(0)
      expect(result.metadata.compressedSize).toBeGreaterThan(0)
      expect(result.metadata.compressionRatio).toBeGreaterThan(0)
    })

    test('decompressAndParseJSON should work end-to-end', async () => {
      const compressed = await compressForStorage(testData)
      const result = await decompressAndParseJSON(compressed.compressedData)
      
      expect(result.data).toEqual(testData)
      expect(result.metadata.detectedFormat).toBe(CompressionFormat.GZIP_WEB_API)
    })
  })

  describe('Error Handling', () => {
    test('should throw UnifiedCompressionError for invalid JSON', () => {
      expect(() => validateAndParseJSON('invalid json')).toThrow(UnifiedCompressionError)
    })

    test('should throw UnifiedCompressionError for decompression failure', async () => {
      const corruptedData = new Uint8Array([0x1f, 0x8b, 0x00, 0x00]) // Invalid gzip data
      
      await expect(decompressData(corruptedData)).rejects.toThrow(UnifiedCompressionError)
    })

    test('should handle completely invalid data gracefully', async () => {
      const invalidData = new Uint8Array([0xff, 0xff, 0xff, 0xff])
      
      // Should try as uncompressed first and return the decoded result (even if it's invalid UTF-8)
      const result = await decompressData(invalidData)
      expect(result.detectedFormat).toBe(CompressionFormat.UNCOMPRESSED)
      expect(result.data).toBeDefined()
      
      // But should fail when trying to parse as JSON
      expect(() => validateAndParseJSON(result.data)).toThrow(UnifiedCompressionError)
    })

    test('UnifiedCompressionError should contain proper metadata', async () => {
      try {
        validateAndParseJSON('invalid json')
      } catch (error) {
        expect(error).toBeInstanceOf(UnifiedCompressionError)
        const compressionError = error as UnifiedCompressionError
        expect(compressionError.operation).toBe('decompress')
        expect(compressionError.message).toContain('Invalid JSON')
      }
    })
  })

  describe('Performance and Size Tests', () => {
    test('should achieve reasonable compression ratio', async () => {
      const result = await compressData(testData)
      
      // Should compress to less than 50% of original size for JSON data
      expect(result.compressionRatio).toBeGreaterThan(30)
    })

    test('should compress quickly', async () => {
      const startTime = performance.now()
      await compressData(testData)
      const endTime = performance.now()
      
      // Should complete within 100ms
      expect(endTime - startTime).toBeLessThan(100)
    })

    test('should decompress quickly', async () => {
      const startTime = performance.now()
      await decompressData(webApiCompressed)
      const endTime = performance.now()
      
      // Should complete within 100ms
      expect(endTime - startTime).toBeLessThan(100)
    })
  })

  describe('Cross-Compatibility Tests', () => {
    test('compression should be deterministic', async () => {
      const result1 = await compressData(testData)
      const result2 = await compressData(testData)
      
      // Results should be similar in size (gzip can have slight variations)
      const sizeDifference = Math.abs(result1.compressedSize - result2.compressedSize)
      expect(sizeDifference).toBeLessThan(10) // Allow small variance
    })

    test('should handle round-trip compression/decompression', async () => {
      const originalJson = JSON.stringify(testData)
      
      // Compress
      const compressed = await compressData(originalJson)
      
      // Decompress
      const decompressed = await decompressData(compressed.data)
      
      // Should match exactly
      expect(decompressed.data).toBe(originalJson)
    })

    test('should handle multiple format decompression attempts', async () => {
      // This tests the fallback mechanism with Web API compressed data
      const result = await decompressData(webApiCompressed)
      expect(result.data).toBe(testJsonString)
      
      // This tests the fallback mechanism with Node.js compressed data
      const result2 = await decompressData(nodejsCompressed)
      expect(result2.data).toBe(testJsonString)
    })
  })

  describe('Edge Cases', () => {
    test('should handle very small data', async () => {
      const smallData = { a: 1 }
      const result = await compressData(smallData)
      
      expect(result.data).toBeInstanceOf(Uint8Array)
      // Small data might not compress well
      expect(result.compressedSize).toBeGreaterThan(0)
    })

    test('should handle data with special characters', async () => {
      const specialData = {
        title: "特殊文字テスト: 🎵🎮🎯",
        description: "Unicode文字列のテスト\n改行も含む\tタブも含む"
      }
      
      const compressed = await compressData(specialData)
      const decompressed = await decompressData(compressed.data)
      const parsed = validateAndParseJSON(decompressed.data)
      
      expect(parsed).toEqual(specialData)
    })

    test('should handle null and undefined values', async () => {
      const dataWithNulls = {
        nullValue: null,
        undefinedValue: undefined,
        emptyString: "",
        emptyArray: [],
        emptyObject: {}
      }
      
      const compressed = await compressData(dataWithNulls)
      const decompressed = await decompressData(compressed.data)
      const parsed = validateAndParseJSON(decompressed.data)
      
      // Note: JSON.stringify removes undefined values
      expect(parsed.nullValue).toBeNull()
      expect(parsed.undefinedValue).toBeUndefined()
      expect(parsed.emptyString).toBe("")
      expect(parsed.emptyArray).toEqual([])
      expect(parsed.emptyObject).toEqual({})
    })
  })
})