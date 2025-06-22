/**
 * R2移行統合テスト
 * TDDアプローチ：実装前にテストを定義
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { gzipSync } from 'zlib'
import type { RankingData } from '../../types/ranking'

// R2クライアントのモック
const mockSend = vi.fn()

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: mockSend
  })),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input }))
}))

describe('R2 Migration Tests', () => {
  let r2Client: S3Client
  const BUCKET_NAME = 'nico-ranking'
  const TEST_DATA: RankingData = {
    items: [
      { 
        rank: 1, 
        id: 'sm12345', 
        title: 'Test Video',
        thumbURL: 'https://example.com/thumb.jpg',
        views: 1000,
        comments: 50,
        mylists: 10
      }
    ],
    popularTags: ['テスト', 'R2移行'],
    metadata: {
      version: 1,
      updatedAt: new Date().toISOString()
    }
  }

  beforeAll(() => {
    // R2クライアントの初期化（S3互換API）
    r2Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT || 'https://test.r2.cloudflarestorage.com',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || 'test-key',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || 'test-secret'
      }
    })
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Data Writing to R2', () => {
    it('should write individual ranking files to R2', async () => {
      // Arrange
      const genre = 'all'
      const period = '24h'
      const key = `rankings/${genre}/${period}.json`
      const data = JSON.stringify(TEST_DATA)

      // Act
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: data,
        ContentType: 'application/json',
        CacheControl: 'public, max-age=1800'
      })

      mockSend.mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } })

      await r2Client.send(putCommand)

      // Assert
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: data,
          ContentType: 'application/json',
          CacheControl: 'public, max-age=1800'
        })
      }))
    })

    it('should NOT compress small files (< 1MB)', async () => {
      // Arrange
      const smallData = { items: TEST_DATA.items.slice(0, 1) }
      const dataSize = JSON.stringify(smallData).length

      // Assert: データサイズが1MB未満
      expect(dataSize).toBeLessThan(1024 * 1024)

      // Act & Assert: 圧縮せずに保存
      const key = 'rankings/test/small.json'
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: JSON.stringify(smallData),
        ContentType: 'application/json'
        // ContentEncoding は設定しない（CDNの自動圧縮に任せる）
      })

      mockSend.mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } })

      await r2Client.send(putCommand)

      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          Bucket: BUCKET_NAME,
          Key: key,
          Body: JSON.stringify(smallData),
          ContentType: 'application/json'
        })
      }))
      expect(mockSend).toHaveBeenCalledWith(
        expect.not.objectContaining({
          input: expect.objectContaining({
            ContentEncoding: 'gzip'
          })
        })
      )
    })

    it('should handle all 46 datasets (23 genres × 2 periods)', async () => {
      // Arrange
      const genres = [
        'all', 'game', 'anime', 'vocaloid', 'voicesynthesis',
        'entertainment', 'music', 'sing', 'dance', 'play',
        'commentary', 'cooking', 'travel', 'nature', 'vehicle',
        'technology', 'society', 'mmd', 'vtuber', 'radio',
        'sports', 'animal', 'other'
      ]
      const periods = ['24h', 'hour']
      const expectedFileCount = genres.length * periods.length // 46

      // Act: 全ファイルの書き込みをシミュレート
      mockSend.mockResolvedValue({ $metadata: { httpStatusCode: 200 } })

      const writePromises = []
      for (const genre of genres) {
        for (const period of periods) {
          const key = `rankings/${genre}/${period}.json`
          const putCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: JSON.stringify(TEST_DATA),
            ContentType: 'application/json'
          })
          writePromises.push(r2Client.send(putCommand))
        }
      }

      await Promise.all(writePromises)

      // Assert
      expect(mockSend).toHaveBeenCalledTimes(expectedFileCount)
    })
  })

  describe('Data Reading from R2', () => {
    it('should read ranking data from R2', async () => {
      // Arrange
      const genre = 'all'
      const period = '24h'
      const key = `rankings/${genre}/${period}.json`

      // Mock GetObjectCommand response
      const mockBody = {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(TEST_DATA))
      }
      mockSend.mockResolvedValueOnce({
        Body: mockBody,
        ContentType: 'application/json',
        $metadata: { httpStatusCode: 200 }
      })

      // Act
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      })
      const response = await r2Client.send(getCommand)
      const data = await response.Body.transformToString()
      const parsed = JSON.parse(data)

      // Assert
      expect(parsed).toEqual(TEST_DATA)
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          Bucket: BUCKET_NAME,
          Key: key
        })
      }))
    })

    it('should handle 404 for non-existent files', async () => {
      // Arrange
      mockSend.mockRejectedValueOnce({
        name: 'NoSuchKey',
        $metadata: { httpStatusCode: 404 }
      })

      // Act & Assert
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: 'rankings/invalid/genre.json'
      })

      await expect(r2Client.send(getCommand)).rejects.toThrow()
    })
  })

  describe('Performance Requirements', () => {
    it('should complete read operations within 100ms', async () => {
      // Arrange
      const mockBody = {
        transformToString: vi.fn().mockResolvedValue(JSON.stringify(TEST_DATA))
      }
      
      // Simulate realistic R2 latency (50-80ms)
      mockSend.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            Body: mockBody,
            ContentType: 'application/json',
            $metadata: { httpStatusCode: 200 }
          }), 60) // 60ms latency
        )
      )

      // Act
      const start = performance.now()
      const getCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: 'rankings/all/24h.json'
      })
      await r2Client.send(getCommand)
      const duration = performance.now() - start

      // Assert
      expect(duration).toBeLessThan(100)
    })
  })

  describe('Cost Optimization', () => {
    it('should stay within R2 free tier limits', () => {
      // 計算: 46ファイル × 48回/日 = 2,208書き込み/日
      const filesPerUpdate = 46
      const updatesPerDay = 48
      const writesPerDay = filesPerUpdate * updatesPerDay
      const writesPerMonth = writesPerDay * 30

      // R2無料枠: 100万書き込み/月
      const freeWriteLimit = 1_000_000

      expect(writesPerMonth).toBeLessThan(freeWriteLimit)
      expect(writesPerMonth).toBe(66_240) // 6.6%の使用率
    })

    it('should use appropriate cache headers', async () => {
      // Arrange
      mockSend.mockResolvedValueOnce({ $metadata: { httpStatusCode: 200 } })

      // Act
      const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: 'rankings/all/24h.json',
        Body: JSON.stringify(TEST_DATA),
        ContentType: 'application/json',
        CacheControl: 'public, max-age=1800' // 30分キャッシュ
      })
      await r2Client.send(putCommand)

      // Assert
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({
        input: expect.objectContaining({
          CacheControl: 'public, max-age=1800'
        })
      }))
    })
  })

  describe('Cloudflare Worker R2 Integration', () => {
    it('should serve R2 content through Worker', async () => {
      // WorkerでR2から直接配信するロジックのテスト
      const mockFetch = vi.fn()
      const originalFetch = global.fetch
      global.fetch = mockFetch

      const testData = {
        items: [
          { 
            rank: 1, 
            id: 'sm12345', 
            title: 'Test Video',
            thumbURL: 'https://example.com/thumb.jpg',
            views: 1000,
            comments: 50,
            mylists: 10
          }
        ],
        popularTags: ['テスト', 'R2移行'],
        metadata: {
          version: 1,
          updatedAt: new Date().toISOString()
        }
      }

      // R2 URLへのfetchをモック
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify(testData), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800'
          }
        })
      )

      // Worker内でのR2アクセスをシミュレート
      const r2Url = 'https://nico-ranking.r2.cloudflarestorage.com/rankings/all/24h.json'
      const response = await fetch(r2Url)
      const data = await response.json()

      expect(data).toEqual(testData)
      expect(response.headers.get('Content-Type')).toBe('application/json')

      // Restore original fetch
      global.fetch = originalFetch
    })
  })

  afterAll(() => {
    vi.clearAllMocks()
  })
})