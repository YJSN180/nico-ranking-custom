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

// Covers the response body too: the signal stays attached while it is read.
const KV_REQUEST_TIMEOUT_MS = 20_000

type KvOperation = 'get' | 'set' | 'delete'

class KvHttpError extends Error {
  constructor(operation: KvOperation, readonly status: number) {
    super(`KV ${operation} failed: ${status}`)
  }
}

function describeKvFailure(error: unknown): string {
  if (error instanceof KvHttpError) return `http_${error.status}`
  if (error instanceof Error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout'
    return error instanceof TypeError ? 'network' : error.name
  }
  return 'unknown'
}

// Key names never reach the log; they can identify users or internal data.
function logKvFailure(operation: KvOperation, attempt: number, attempts: number, cause: string): void {
  console.warn(`[KV] ${operation} attempt ${attempt}/${attempts} failed: ${cause}`)
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
          signal: AbortSignal.timeout(KV_REQUEST_TIMEOUT_MS),
        })

        if (response.status === 404) {
          return null
        }

        if (response.status === 429) {
          logKvFailure('get', attempt + 1, maxRetries, 'http_429')
          // Rate limited, wait with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
          // KV rate limited, retrying with exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay))
          attempt++
          continue
        }

        if (!response.ok) {
          throw new KvHttpError('get', response.status)
        }

        const text = await response.text()
        try {
          return JSON.parse(text)
        } catch {
          return text as T
        }
      } catch (error) {
        logKvFailure('get', attempt + 1, maxRetries, describeKvFailure(error))
        if (attempt === maxRetries - 1) {
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
    const maxRetries = 3
    let lastError
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url.toString(), {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(KV_REQUEST_TIMEOUT_MS),
        })

        if (response.status === 429) {
          logKvFailure('set', attempt + 1, maxRetries, 'http_429')
          // Rate limited - use exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }

        if (!response.ok) {
          throw new KvHttpError('set', response.status)
        }

        // Success
        return
      } catch (error) {
        lastError = error
        logKvFailure('set', attempt + 1, maxRetries, describeKvFailure(error))
        if (attempt === maxRetries - 1) {
          throw error
        }
      }
    }
  }

  /**
   * Delete a key from KV
   */
  async del(key: string): Promise<void> {
    const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN } = getEnvVars()
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    let response: Response
    try {
      response = await fetch(`${getBaseUrl()}/values/${encodeURIComponent(key)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
        },
        signal: AbortSignal.timeout(KV_REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      logKvFailure('delete', 1, 1, describeKvFailure(error))
      throw error
    }

    if (!response.ok && response.status !== 404) {
      logKvFailure('delete', 1, 1, `http_${response.status}`)
      throw new KvHttpError('delete', response.status)
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