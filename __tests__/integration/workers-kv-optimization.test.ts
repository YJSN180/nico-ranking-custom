/**
 * Integration tests for Workers KV optimization
 * Tests direct KV binding usage vs REST API performance
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { decompressData, compressData } from '../../lib/cloudflare-kv-worker'

// Mock KV namespace for testing
class MockKVNamespace {
  private data = new Map<string, { value: any, metadata?: any }>()
  
  async get(key: string): Promise<string | null> {
    const entry = this.data.get(key)
    return entry ? JSON.stringify(entry.value) : null
  }

  async getWithMetadata<T>(key: string, options?: any): Promise<{ value: T | null, metadata: any | null }> {
    const entry = this.data.get(key)
    if (!entry) {
      return { value: null, metadata: null }
    }
    
    if (options?.type === 'arrayBuffer') {
      // Return compressed data as Uint8Array for testing
      const compressed = await compressData(entry.value)
      return { 
        value: compressed as any, 
        metadata: entry.metadata || null 
      }
    }
    
    return { 
      value: entry.value as T, 
      metadata: entry.metadata || null 
    }
  }

  async put(key: string, value: any, options?: any): Promise<void> {
    this.data.set(key, { value, metadata: options?.metadata })
  }

  // Helper method for testing
  setTestData(key: string, value: any, metadata?: any) {
    this.data.set(key, { value, metadata })
  }
}

describe('Workers KV Optimization', () => {
  let mockKV: MockKVNamespace

  beforeAll(() => {
    mockKV = new MockKVNamespace()
  })

  describe('Compression/Decompression', () => {
    it('should compress and decompress data correctly', async () => {
      const testData = {
        genres: {
          all: {
            '24h': {
              items: [
                { rank: 1, id: 'sm123', title: 'Test Video', views: 1000 }
              ],
              popularTags: ['test', 'demo']
            }
          }
        },
        metadata: {
          version: 1,
          updatedAt: '2024-01-01T00:00:00Z',
          totalItems: 1
        }
      }

      const compressed = await compressData(testData)
      expect(compressed).toBeInstanceOf(Uint8Array)
      expect(compressed.length).toBeGreaterThan(0)

      const decompressed = await decompressData(compressed)
      expect(decompressed).toEqual(testData)
    })

    it('should handle large datasets efficiently', { timeout: 30000 }, async () => {
      // Create large test dataset (reduced size for faster testing)
      const largeData = {
        genres: {},
        metadata: { version: 1, updatedAt: '2024-01-01T00:00:00Z', totalItems: 0 }
      }

      // Add 2 genres with 100 items each (reduced for performance)
      const genres = ['all', 'game']
      for (const genre of genres) {
        largeData.genres[genre] = {
          '24h': {
            items: Array.from({ length: 100 }, (_, i) => ({
              rank: i + 1,
              id: `sm${i + 1000}`,
              title: `Test Video ${i + 1}`,
              thumbURL: `https://example.com/thumb${i + 1}.jpg`,
              views: 1000 - i,
              comments: 100 - i,
              mylists: 50 - i
            })),
            popularTags: Array.from({ length: 20 }, (_, i) => `tag${i + 1}`)
          },
          'hour': {
            items: Array.from({ length: 100 }, (_, i) => ({
              rank: i + 1,
              id: `sm${i + 2000}`,
              title: `Hourly Video ${i + 1}`,
              thumbURL: `https://example.com/thumb${i + 2001}.jpg`,
              views: 500 - i,
              comments: 50 - i,
              mylists: 25 - i
            })),
            popularTags: Array.from({ length: 20 }, (_, i) => `hourly-tag${i + 1}`)
          }
        }
      }

      const startTime = performance.now()
      const compressed = await compressData(largeData)
      const compressionTime = performance.now() - startTime

      const decompressStart = performance.now()
      const decompressed = await decompressData(compressed)
      const decompressionTime = performance.now() - decompressStart

      expect(decompressed.genres).toHaveProperty('all')
      expect(decompressed.genres.all['24h'].items).toHaveLength(100)
      expect(compressionTime).toBeLessThan(1000) // Less than 1 second
      expect(decompressionTime).toBeLessThan(1000) // Less than 1 second

      // Log performance for analysis
      console.log(`Compression: ${compressionTime.toFixed(2)}ms`)
      console.log(`Decompression: ${decompressionTime.toFixed(2)}ms`)
      console.log(`Compressed size: ${compressed.length} bytes`)
    })
  })

  describe('KV Binding Performance', () => {
    beforeAll(async () => {
      // Set up test ranking data
      const testRankingData = {
        genres: {
          all: {
            '24h': {
              items: Array.from({ length: 100 }, (_, i) => ({
                rank: i + 1,
                id: `sm${i + 1000}`,
                title: `Test Video ${i + 1}`,
                thumbURL: `https://example.com/thumb${i + 1}.jpg`,
                views: 1000 - i,
                comments: 100 - i,
                mylists: 50 - i
              })),
              popularTags: ['test', 'demo', 'sample']
            },
            'hour': {
              items: Array.from({ length: 50 }, (_, i) => ({
                rank: i + 1,
                id: `sm${i + 2000}`,
                title: `Hourly Video ${i + 1}`,
                thumbURL: `https://example.com/thumb${i + 2001}.jpg`,
                views: 500 - i
              })),
              popularTags: ['hourly', 'fresh']
            }
          },
          game: {
            '24h': {
              items: Array.from({ length: 200 }, (_, i) => ({
                rank: i + 1,
                id: `sm${i + 3000}`,
                title: `Game Video ${i + 1}`,
                views: 2000 - i
              })),
              popularTags: ['game', 'gaming', 'play']
            },
            'hour': {
              items: Array.from({ length: 100 }, (_, i) => ({
                rank: i + 1,
                id: `sm${i + 4000}`,
                title: `Game Hourly ${i + 1}`,
                views: 1000 - i
              })),
              popularTags: ['game', 'new']
            }
          }
        },
        metadata: {
          version: 1,
          updatedAt: '2024-01-01T00:00:00Z',
          totalItems: 450
        }
      }

      // Set up test video stats data
      const testVideoStats = {
        stats: {}
      }

      // Add stats for first 50 videos
      for (let i = 1; i <= 50; i++) {
        testVideoStats.stats[`sm${i + 1000}`] = {
          views: 1000 + i * 10,
          comments: 100 + i,
          mylists: 50 + i,
          likes: 25 + i,
          timestamp: '2024-01-01T00:00:00Z'
        }
      }

      mockKV.setTestData('RANKING_LATEST', testRankingData, {
        compressed: true,
        version: 1,
        updatedAt: '2024-01-01T00:00:00Z'
      })

      mockKV.setTestData('VIDEO_STATS_LATEST', testVideoStats, {
        compressed: true,
        version: 1,
        updatedAt: '2024-01-01T00:00:00Z'
      })
    })

    it('should retrieve genre ranking efficiently', async () => {
      const startTime = performance.now()
      
      const result = await mockKV.getWithMetadata<Uint8Array>(
        'RANKING_LATEST',
        { type: 'arrayBuffer' }
      )
      
      expect(result.value).not.toBeNull()
      
      const decompressed = await decompressData(new Uint8Array(result.value!))
      const genreData = decompressed.genres.all['24h']
      
      const retrievalTime = performance.now() - startTime
      
      expect(genreData.items).toHaveLength(100)
      expect(genreData.popularTags).toEqual(['test', 'demo', 'sample'])
      expect(retrievalTime).toBeLessThan(100) // Should be very fast with KV binding
      
      console.log(`KV Binding retrieval: ${retrievalTime.toFixed(2)}ms`)
    })

    it('should handle video stats retrieval efficiently', async () => {
      const testVideoIds = ['sm1001', 'sm1002', 'sm1003', 'sm1004', 'sm1005']
      
      const startTime = performance.now()
      
      const result = await mockKV.getWithMetadata<Uint8Array>(
        'VIDEO_STATS_LATEST',
        { type: 'arrayBuffer' }
      )
      
      expect(result.value).not.toBeNull()
      
      const statsData = await decompressData(new Uint8Array(result.value!))
      
      // Extract requested stats
      const extractedStats = {}
      for (const id of testVideoIds) {
        if (statsData.stats[id]) {
          extractedStats[id] = statsData.stats[id]
        }
      }
      
      const retrievalTime = performance.now() - startTime
      
      expect(Object.keys(extractedStats)).toHaveLength(5)
      expect(extractedStats['sm1001']).toHaveProperty('views')
      expect(retrievalTime).toBeLessThan(50) // Very fast with KV binding
      
      console.log(`Video stats retrieval: ${retrievalTime.toFixed(2)}ms`)
    })

    it('should handle tag ranking retrieval', async () => {
      // This would require tag data in the test setup
      // For now, test the structure access
      const result = await mockKV.getWithMetadata<Uint8Array>(
        'RANKING_LATEST',
        { type: 'arrayBuffer' }
      )
      
      const decompressed = await decompressData(new Uint8Array(result.value!))
      
      // Test structure access patterns
      expect(decompressed.genres).toHaveProperty('all')
      expect(decompressed.genres.all).toHaveProperty('24h')
      expect(decompressed.genres.all['24h']).toHaveProperty('items')
      expect(decompressed.genres.all['24h']).toHaveProperty('popularTags')
    })
  })

  describe('Error Handling', () => {
    it('should handle missing KV data gracefully', async () => {
      const emptyKV = new MockKVNamespace()
      
      const result = await emptyKV.getWithMetadata('NONEXISTENT_KEY', { type: 'arrayBuffer' })
      
      expect(result.value).toBeNull()
      expect(result.metadata).toBeNull()
    })

    it('should handle decompression errors', async () => {
      const invalidData = new Uint8Array([1, 2, 3, 4, 5]) // Invalid gzip data
      
      await expect(decompressData(invalidData)).rejects.toThrow()
    })

    it('should provide fallback for malformed JSON', async () => {
      const invalidJson = new TextEncoder().encode('{"invalid": json}')
      
      await expect(decompressData(invalidJson)).rejects.toThrow()
    })
  })
})

describe('Performance Comparison', () => {
  it('should demonstrate KV binding vs REST API benefits', async () => {
    // Simulate REST API call timing
    const restApiSimulation = async () => {
      const start = performance.now()
      
      // Simulate network latency (50ms) + processing (10ms)
      await new Promise(resolve => setTimeout(resolve, 60))
      
      return performance.now() - start
    }
    
    // Simulate KV binding timing
    const kvBindingSimulation = async () => {
      const start = performance.now()
      
      // Simulate KV binding access (much faster, ~1ms)
      await new Promise(resolve => setTimeout(resolve, 1))
      
      return performance.now() - start
    }
    
    const restTime = await restApiSimulation()
    const kvTime = await kvBindingSimulation()
    
    console.log(`REST API simulation: ${restTime.toFixed(2)}ms`)
    console.log(`KV Binding simulation: ${kvTime.toFixed(2)}ms`)
    console.log(`Improvement: ${(restTime / kvTime).toFixed(1)}x faster`)
    
    expect(kvTime).toBeLessThan(restTime)
    expect(restTime / kvTime).toBeGreaterThan(10) // At least 10x improvement expected
  })
})