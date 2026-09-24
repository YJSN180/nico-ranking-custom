// Simple KV utility using Cloudflare KV REST API
// Provides a unified interface for key-value storage operations

// Get environment variables dynamically at runtime
function getEnvVars() {
  return {
    CF_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
    CF_NAMESPACE_ID: process.env.CLOUDFLARE_KV_NAMESPACE_ID,
    CF_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN
  }
}

function getBaseUrl() {
  const { CF_ACCOUNT_ID, CF_NAMESPACE_ID } = getEnvVars()
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID) {
    throw new Error('Cloudflare KV credentials not configured')
  }
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}`
}

const MAX_ATTEMPTS = 3

const backoffDelay = (attempt: number): number => Math.min(1000 * Math.pow(2, attempt), 10000)

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** KV の読み取り失敗（404 以外）。未設定（404）とは区別する */
export class KvReadError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'KvReadError'
    this.status = status
  }
}

export interface GetStrictOptions {
  /** 試行回数（既定 3）。直前の成功値で代替できる読み取りは 1 にして待たせない */
  attempts?: number
}

class SimpleKV {
  /**
   * Get a value from KV
   */
  async get<T = any>(key: string): Promise<T | null> {
    const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = getEnvVars()
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const maxRetries = 3
    let attempt = 0
    
    while (attempt < maxRetries) {
      try {
        const response = await fetch(`${getBaseUrl()}/values/${encodeURIComponent(key)}`, {
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
          // KV rate limited, retrying with exponential backoff
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
          // KV get error - returning null as fallback
          return null
        }
        
        // Retry on network errors
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
        // KV request failed, retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay))
        attempt++
      }
    }
    
    return null
  }

  /**
   * 未設定（404）と読み取り失敗を区別して取得する。
   * 404 は null、429 の連続・5xx・通信エラーは再試行ののち KvReadError を投げる。
   * get は失敗も null にするため、書き込みの土台にする読み取りや、失敗を
   * 「未設定」と取り違えてはいけない読み取りではこちらを使う。
   */
  async getStrict<T = unknown>(key: string, options: GetStrictOptions = {}): Promise<T | null> {
    const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = getEnvVars()
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const attempts = Math.max(1, Math.floor(options.attempts ?? MAX_ATTEMPTS))
    let lastError = new KvReadError('KV get failed')

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await sleep(backoffDelay(attempt - 1))
      let response: Response
      try {
        response = await fetch(`${getBaseUrl()}/values/${encodeURIComponent(key)}`, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
          },
        })
      } catch (error) {
        lastError = new KvReadError(`KV get failed: ${error instanceof Error ? error.message : 'network error'}`)
        continue
      }

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        lastError = new KvReadError(`KV get failed: ${response.status}`, response.status)
        // 429 と 5xx だけ再試行する（認証エラーなどは再試行しても直らない）
        if (response.status === 429 || response.status >= 500) continue
        throw lastError
      }

      let text: string
      try {
        text = await response.text()
      } catch (error) {
        lastError = new KvReadError(`KV get failed: ${error instanceof Error ? error.message : 'body read error'}`)
        continue
      }
      try {
        return JSON.parse(text) as T
      } catch {
        return text as T
      }
    }

    throw lastError
  }

  /**
   * Set a value in KV
   */
  async set(key: string, value: any, options?: { ex?: number }): Promise<void> {
    const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = getEnvVars()
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const url = new URL(`${getBaseUrl()}/values/${encodeURIComponent(key)}`)
    
    // Add TTL if specified
    if (options?.ex) {
      url.searchParams.set('expiration_ttl', options.ex.toString())
    }

    const body = typeof value === 'string' ? value : JSON.stringify(value)

    // Retry logic for 429 errors
    const maxRetries = MAX_ATTEMPTS
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body,
        })

        if (response.status === 429) {
          // Rate limited - use exponential backoff
          lastError = new Error('KV set failed: 429')
          if (attempt < maxRetries - 1) {
            await sleep(backoffDelay(attempt))
          }
          continue
        }

        if (!response.ok) {
          throw new Error(`KV set failed: ${response.status}`)
        }

        // Success
        return
      } catch (error) {
        lastError = error
        if (attempt === maxRetries - 1) {
          throw error
        }
      }
    }

    // 再試行が尽きた（429 が続いた）ときは、書けていないので例外にする
    throw lastError instanceof Error ? lastError : new Error('KV set failed')
  }

  /**
   * Delete a key from KV
   */
  async del(key: string): Promise<void> {
    const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = getEnvVars()
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const response = await fetch(`${getBaseUrl()}/values/${encodeURIComponent(key)}`, {
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
    // expire() not supported on Cloudflare KV - this is a no-op for compatibility
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