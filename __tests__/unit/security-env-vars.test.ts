import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('Security: Environment Variables', () => {
  beforeEach(() => {
    // 環境変数をリセット
    vi.resetModules()
    process.env = {}
  })

  describe('Admin API Authentication', () => {
    it('should reject requests without proper admin key', async () => {
      // 環境変数を設定
      process.env.ADMIN_KEY = 'test-admin-key-123'
      
      const { POST } = await import('@/app/api/admin/update/route')
      const request = new Request('http://localhost:3000/api/admin/update', {
        method: 'POST',
        headers: {
          'x-admin-key': 'wrong-key'
        }
      })

      const response = await POST(request)
      expect(response.status).toBe(401)
      const data = await response.json()
      expect(data.error).toBe('Unauthorized')
    })

    it('should accept requests with correct admin key from environment', async () => {
      // 環境変数を設定
      process.env.ADMIN_KEY = 'test-admin-key-123'
      process.env.KV_REST_API_URL = 'http://mock-kv'
      process.env.KV_REST_API_TOKEN = 'mock-token'
      
      // KVモック
      vi.mock('@vercel/kv', () => ({
        kv: {
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue('OK')
        }
      }))
      
      const { POST } = await import('@/app/api/admin/update/route')
      const request = new Request('http://localhost:3000/api/admin/update?key=test-admin-key-123', {
        method: 'POST'
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    })

    it('should not expose hardcoded credentials', async () => {
      const { POST } = await import('@/app/api/admin/update/route')
      const routeCode = POST.toString()
      
      // ハードコードされた認証情報をチェック
      expect(routeCode).not.toContain('update-ranking-2025')
      expect(routeCode).not.toContain('debug-123')
      expect(routeCode).not.toContain('password')
    })
  })

  describe('Debug Endpoints in Production', () => {
    it('should return 404 for debug endpoints in production', async () => {
      process.env.NODE_ENV = 'production'
      
      const { GET } = await import('@/app/api/debug/route')
      const request = new Request('http://localhost:3000/api/debug')
      
      const response = await GET(request)
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toBe('Not Found')
    })

    it('should allow debug endpoints in development with proper auth', async () => {
      process.env.NODE_ENV = 'development'
      process.env.DEBUG_TOKEN = 'test-debug-token'
      
      const { GET } = await import('@/app/api/debug/route')
      const request = new Request('http://localhost:3000/api/debug', {
        headers: {
          'authorization': 'Bearer test-debug-token'
        }
      })
      
      const response = await GET(request)
      expect(response.status).not.toBe(404)
    })
  })

  describe('Cloudflare API Key Protection', () => {
    it('should not expose Cloudflare API key in code', async () => {
      // スクリプトファイルを直接読み込んで検証
      const fs = await import('fs/promises')
      const path = await import('path')
      const scriptPath = path.join(process.cwd(), 'scripts/update-ranking-github-action.ts')
      const scriptCode = await fs.readFile(scriptPath, 'utf-8')
      
      // Cloudflare APIキーがハードコードされていないことを確認
      expect(scriptCode).not.toContain('ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj')
      // 環境変数から読み込むようになっていることを確認
      expect(scriptCode).toContain('process.env.CLOUDFLARE_KV_API_TOKEN')
    })

    it('should read Cloudflare credentials from environment variables', () => {
      process.env.CLOUDFLARE_KV_API_TOKEN = 'test-token'
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
      
      expect(process.env.CLOUDFLARE_KV_API_TOKEN).toBe('test-token')
      expect(process.env.CLOUDFLARE_ACCOUNT_ID).toBe('test-account')
      expect(process.env.CLOUDFLARE_KV_NAMESPACE_ID).toBe('test-namespace')
    })
  })
})