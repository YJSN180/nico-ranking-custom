// Simple KV utility that mimics Vercel KV API using Cloudflare KV REST API
// This provides a drop-in replacement for @vercel/kv

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
  console.warn('Cloudflare KV credentials not configured')
}

const BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}`

class SimpleKV {
  /**
   * Get a value from KV
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    try {
      const response = await fetch(`${BASE_URL}/values/${encodeURIComponent(key)}`, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
      })

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(`KV get failed: ${response.status}`)
      }

      const text = await response.text()
      try {
        return JSON.parse(text)
      } catch {
        return text as T
      }
    } catch (error) {
      console.error(`KV get error for key ${key}:`, error)
      return null
    }
  }

  /**
   * Set a value in KV
   */
  async set(key: string, value: any, options?: { ex?: number }): Promise<void> {
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const url = new URL(`${BASE_URL}/values/${encodeURIComponent(key)}`)
    
    // Add TTL if specified
    if (options?.ex) {
      url.searchParams.set('expiration_ttl', options.ex.toString())
    }

    const body = typeof value === 'string' ? value : JSON.stringify(value)

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`KV set failed: ${response.status}`)
    }
  }

  /**
   * Delete a key from KV
   */
  async del(key: string): Promise<void> {
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const response = await fetch(`${BASE_URL}/values/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`KV delete failed: ${response.status}`)
    }
  }

  /**
   * Set expiration for a key (Vercel KV compatibility)
   */
  async expire(key: string, seconds: number): Promise<void> {
    // Cloudflare KV doesn't support setting TTL on existing keys
    // This is a no-op for compatibility
    console.warn(`expire() not supported on Cloudflare KV for key: ${key}`)
  }

  /**
   * Get TTL for a key (Vercel KV compatibility)
   */
  async ttl(key: string): Promise<number> {
    // Cloudflare KV doesn't support getting TTL
    // Return -1 for compatibility (no expiry)
    return -1
  }
}

// Export a singleton instance
export const kv = new SimpleKV()