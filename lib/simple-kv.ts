// Simple KV utility using Cloudflare KV REST API
// Provides a unified interface for key-value storage operations

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

    const maxRetries = 3
    let attempt = 0
    
    while (attempt < maxRetries) {
      try {
        const response = await fetch(`${BASE_URL}/values/${encodeURIComponent(key)}`, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
          },
        })

        if (response.status === 404) {
          return null
        }

        if (response.status === 429) {
          // Rate limited, wait with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
          console.warn(`KV rate limited, retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
          attempt++
          continue
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
        if (attempt === maxRetries - 1) {
          // Sanitize key for logging to prevent format string injection
          const sanitizedKey = typeof key === 'string' ? key.replace(/[%$`]/g, '_') : String(key)
          console.error('KV get error for key:', sanitizedKey, error)
          return null
        }
        
        // Retry on network errors
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        console.warn(`KV request failed, retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        attempt++
      }
    }
    
    return null
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
    // Sanitize key for logging to prevent format string injection
    const sanitizedKey = typeof key === 'string' ? key.replace(/[%$`]/g, '_') : String(key)
    console.warn('expire() not supported on Cloudflare KV for key:', sanitizedKey)
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