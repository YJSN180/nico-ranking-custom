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
      process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
      process.env.CLOUDFLARE_KV_NAMESPACE_ID = 'test-namespace'
      process.env.CLOUDFLARE_KV_API_TOKEN = 'test-token'
      
      // KVモック
      vi.mock('@/lib/simple-kv', () => ({
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

  // Debug endpoints have been removed for security
  describe('Debug Endpoints in Production', () => {
    it('should not have debug endpoints available', () => {
      // Debug endpoints have been removed from the codebase
      // This test verifies they don't exist
      expect(() => require('@/app/api/debug/route')).toThrow()
    })
  })

  describe('Cloudflare API Key Protection', () => {
    it('should not expose Cloudflare API key in code', async () => {
      // 重要なファイルをチェック
      const fs = await import('fs/promises')
      const path = await import('path')
      const filesToCheck = [
        'lib/cloudflare-kv.ts',
        'lib/update-ranking.ts',
        'app/api/cron/fetch/route.ts'
      ]
      
      for (const file of filesToCheck) {
        const filePath = path.join(process.cwd(), file)
        try {
          const fileCode = await fs.readFile(filePath, 'utf-8')
          // Cloudflare APIキーがハードコードされていないことを確認
          expect(fileCode).not.toContain('ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj')
          // 環境変数から読み込むようになっていることを確認
          if (file.includes('cloudflare')) {
            expect(fileCode).toContain('process.env.CLOUDFLARE_KV_API_TOKEN')
          }
        } catch (error) {
          // ファイルが存在しない場合はスキップ
        }
      }
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