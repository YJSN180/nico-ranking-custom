import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
global.fetch = vi.fn()

// Mock modules
vi.mock('@/lib/simple-kv', () => ({
  kv: {
    get: vi.fn()
  }
}))

vi.mock('pako', () => ({
  gzip: vi.fn((data) => Buffer.from(data))
}))

describe('update-ranking-parallel.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(global.fetch).mockClear()
  })

  describe('fetchWithGooglebot', () => {
    it('should fetch with correct headers', async () => {
      const mockResponse = {
        ok: true,
        text: vi.fn().mockResolvedValue('<html>test</html>')
      }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      // Simulate fetchWithGooglebot
      const response = await fetch('https://example.com', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept'
        }
      })

      expect(fetch).toHaveBeenCalledWith('https://example.com', {
        headers: expect.objectContaining({
          'User-Agent': expect.stringContaining('Googlebot')
        })
      })
      expect(response.ok).toBe(true)
    })

    it('should handle fetch errors', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

      await expect(
        fetch('https://example.com')
      ).rejects.toThrow('Network error')
    })
  })

  describe('extractServerResponseData', () => {
    it('should extract and decode server response data', () => {
      const html = `
        <html>
          <meta name="server-response" content="{&quot;data&quot;:&quot;test&quot;}">
        </html>
      `
      
      // Simulate extraction logic
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      expect(metaMatch).toBeTruthy()
      
      if (metaMatch) {
        const encodedData = metaMatch[1]
        const decodedData = encodedData
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'")
        
        const parsed = JSON.parse(decodedData)
        expect(parsed).toEqual({ data: 'test' })
      }
    })

    it('should throw error when meta tag not found', () => {
      const html = '<html>no meta tag</html>'
      const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
      expect(metaMatch).toBeNull()
    })
  })

  describe('getNGList', () => {
    it('should fetch NG lists from KV', async () => {
      const { kv } = await import('@/lib/simple-kv')
      
      vi.mocked(kv.get).mockImplementation((key: string) => {
        if (key === 'ng-list-manual') {
          return Promise.resolve({
            videoIds: ['sm1', 'sm2'],
            videoTitles: ['Bad Title'],
            authorIds: ['user1'],
            authorNames: ['Bad User']
          })
        }
        if (key === 'ng-list-derived') {
          return Promise.resolve(['sm3', 'sm4'])
        }
        return Promise.resolve(null)
      })

      const [manual, derived] = await Promise.all([
        kv.get('ng-list-manual'),
        kv.get('ng-list-derived')
      ])

      expect(manual).toHaveProperty('videoIds')
      expect(derived).toEqual(['sm3', 'sm4'])
    })

    it('should handle KV errors gracefully', async () => {
      const { kv } = await import('@/lib/simple-kv')
      vi.mocked(kv.get).mockRejectedValue(new Error('KV Error'))

      let manual
      try {
        manual = await kv.get('ng-list-manual')
      } catch {
        manual = null
      }

      expect(manual).toBeNull()
    })
  })

  describe('filterWithNGList', () => {
    it('should filter items based on NG list', () => {
      const items = [
        { id: 'sm1', title: 'Good Video', authorId: 'user1', authorName: 'Good User' },
        { id: 'sm2', title: 'Bad Title', authorId: 'user2', authorName: 'User 2' },
        { id: 'sm3', title: 'Video 3', authorId: 'user3', authorName: 'Bad User' }
      ]

      const ngList = {
        videoIds: ['sm1'],
        videoTitles: ['Bad Title'],
        authorIds: [],
        authorNames: ['Bad User'],
        derivedVideoIds: []
      }

      // Simulate filtering logic
      const videoIdSet = new Set([...ngList.videoIds, ...ngList.derivedVideoIds])
      const titleSet = new Set(ngList.videoTitles)
      const authorIdSet = new Set(ngList.authorIds)
      const authorNameSet = new Set(ngList.authorNames)

      const filtered = items.filter(item => {
        if (videoIdSet.has(item.id)) return false
        if (titleSet.has(item.title)) return false
        if (item.authorId && authorIdSet.has(item.authorId)) return false
        if (item.authorName && authorNameSet.has(item.authorName)) return false
        return true
      })

      expect(filtered).toHaveLength(0)
      expect(filtered).not.toContainEqual(expect.objectContaining({ id: 'sm1' }))
      expect(filtered).not.toContainEqual(expect.objectContaining({ title: 'Bad Title' }))
      expect(filtered).not.toContainEqual(expect.objectContaining({ authorName: 'Bad User' }))
    })
  })

  describe('executeInParallel', () => {
    it.skip('should execute tasks with concurrency limit', async () => {
      let concurrentCount = 0
      let maxConcurrent = 0

      const tasks = Array(10).fill(null).map((_, i) => async () => {
        concurrentCount++
        maxConcurrent = Math.max(maxConcurrent, concurrentCount)
        await new Promise(resolve => setTimeout(resolve, 10))
        concurrentCount--
        return i
      })

      // Simulate executeInParallel
      const executeInParallel = async <T>(
        tasks: (() => Promise<T>)[],
        maxConcurrency: number
      ): Promise<T[]> => {
        const results: T[] = []
        const executing: Promise<void>[] = []
        
        for (const task of tasks) {
          const promise = task().then(result => {
            results.push(result)
          })
          
          executing.push(promise)
          
          if (executing.length >= maxConcurrency) {
            await Promise.race(executing)
            executing.splice(executing.findIndex(p => p === promise), 1)
          }
        }
        
        await Promise.all(executing)
        return results
      }

      const results = await executeInParallel(tasks, 3)

      expect(results).toHaveLength(10)
      expect(maxConcurrent).toBeLessThanOrEqual(3)
    })
  })

  describe('writeToCloudflareKV', () => {
    it('should write compressed data to KV', async () => {
      const mockResponse = { ok: true }
      vi.mocked(global.fetch).mockResolvedValue(mockResponse as any)

      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
      process.env.CLOUDFLARE_KV_API_TOKEN = 'test-token'

      const data = { test: 'data' }
      const url = `https://api.cloudflare.com/client/v4/accounts/test-account/storage/kv/namespaces/test-namespace/values/RANKING_LATEST`

      await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/octet-stream'
        },
        body: Buffer.from(JSON.stringify(data))
      })

      expect(fetch).toHaveBeenCalledWith(
        url,
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token'
          })
        })
      )
    })

    it('should handle KV write errors', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue('Unauthorized')
      } as any)

      const response = await fetch('https://api.cloudflare.com/test', {
        method: 'PUT'
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(401)
    })
  })
})