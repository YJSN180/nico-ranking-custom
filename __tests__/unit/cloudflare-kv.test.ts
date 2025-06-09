import { describe, it, expect, vi, beforeEach } from 'vitest'
import { putToCloudflareKV, getFromCloudflareKV, deleteFromCloudflareKV } from '@/lib/cloudflare-kv'

// Mock fetch globally
global.fetch = vi.fn()

describe('Cloudflare KV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set environment variables
    process.env.CF_ACCOUNT_ID = 'test-account-id'
    process.env.CF_NAMESPACE_ID = 'test-namespace-id'
    process.env.CF_API_TOKEN = 'test-api-token'
  })

  describe('putToCloudflareKV', () => {
    it('should successfully put data to KV', async () => {
      const mockResponse = new Response('', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const data = new Uint8Array([1, 2, 3, 4, 5])
      await putToCloudflareKV('test-key', data)

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/test-key',
        {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer test-api-token',
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/json',
          },
          body: data,
        }
      )
    })

    it('should throw error when credentials are missing', async () => {
      delete process.env.CF_ACCOUNT_ID

      const data = new Uint8Array([1, 2, 3])
      await expect(putToCloudflareKV('test-key', data)).rejects.toThrow('Cloudflare credentials not configured')
    })

    it('should throw error when API returns error', async () => {
      const mockResponse = new Response('Error message', { status: 400 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const data = new Uint8Array([1, 2, 3])
      await expect(putToCloudflareKV('test-key', data)).rejects.toThrow('Failed to save to Cloudflare KV: 400')
    })
  })

  describe('getFromCloudflareKV', () => {
    it('should successfully get data from KV', async () => {
      const testData = new ArrayBuffer(8)
      const mockResponse = new Response(testData, { status: 200 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const result = await getFromCloudflareKV('test-key')

      expect(result).toBeInstanceOf(ArrayBuffer)
      expect(result?.byteLength).toBe(8)
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/test-key',
        {
          headers: {
            'Authorization': 'Bearer test-api-token',
          },
        }
      )
    })

    it('should return null when key not found', async () => {
      const mockResponse = new Response('', { status: 404 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      const result = await getFromCloudflareKV('non-existent-key')
      expect(result).toBeNull()
    })

    it('should throw error when API returns error', async () => {
      const mockResponse = new Response('Error', { status: 500 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      await expect(getFromCloudflareKV('test-key')).rejects.toThrow('Failed to get from Cloudflare KV: 500')
    })
  })

  describe('deleteFromCloudflareKV', () => {
    it('should successfully delete data from KV', async () => {
      const mockResponse = new Response('', { status: 200 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      await deleteFromCloudflareKV('test-key')

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.cloudflare.com/client/v4/accounts/test-account-id/storage/kv/namespaces/test-namespace-id/values/test-key',
        {
          method: 'DELETE',
          headers: {
            'Authorization': 'Bearer test-api-token',
          },
        }
      )
    })

    it('should not throw error when key not found', async () => {
      const mockResponse = new Response('', { status: 404 })
      vi.mocked(global.fetch).mockResolvedValueOnce(mockResponse)

      await expect(deleteFromCloudflareKV('non-existent-key')).resolves.not.toThrow()
    })
  })
})