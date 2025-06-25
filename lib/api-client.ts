/**
 * API Client for Next.js
 * プレビュー環境と本番環境を自動的に切り替え
 */

interface ApiClientConfig {
  baseUrl?: string
  headers?: Record<string, string>
}

class ApiClient {
  private baseUrl: string
  private defaultHeaders: Record<string, string> = {}

  constructor(config?: ApiClientConfig) {
    // 環境に応じてベースURLを設定
    this.baseUrl = config?.baseUrl || this.getDefaultBaseUrl()
    
    // デフォルトヘッダーを設定
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config?.headers
    }

    // プレビュー環境の場合、認証トークンを追加
    if (process.env.NEXT_PUBLIC_PREVIEW_TOKEN) {
      this.defaultHeaders['X-Preview-Token'] = process.env.NEXT_PUBLIC_PREVIEW_TOKEN
    }
  }

  private getDefaultBaseUrl(): string {
    // プレビュー環境のWorker URL
    if (process.env.NEXT_PUBLIC_WORKER_URL) {
      return process.env.NEXT_PUBLIC_WORKER_URL
    }
    
    // 本番環境
    if (process.env.NODE_ENV === 'production') {
      return 'https://nico-rank.com'
    }
    
    // 開発環境（ローカル）
    return process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:8787'
  }

  async fetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options?.headers
      }
    })

    if (!response.ok) {
      throw new ApiError(response.status, await response.text())
    }

    return response.json()
  }

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.fetch<T>(path, { ...options, method: 'GET' })
  }

  async post<T>(path: string, data?: any, options?: RequestInit): Promise<T> {
    return this.fetch<T>(path, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async put<T>(path: string, data?: any, options?: RequestInit): Promise<T> {
    return this.fetch<T>(path, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined
    })
  }

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.fetch<T>(path, { ...options, method: 'DELETE' })
  }

  // 条件付きリクエスト（ETag対応）
  async getWithETag<T>(path: string, etag?: string): Promise<{ data: T; etag?: string }> {
    const headers: HeadersInit = {}
    if (etag) {
      headers['If-None-Match'] = etag
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        ...this.defaultHeaders,
        ...headers
      }
    })

    if (response.status === 304) {
      throw new NotModifiedError()
    }

    if (!response.ok) {
      throw new ApiError(response.status, await response.text())
    }

    return {
      data: await response.json(),
      etag: response.headers.get('ETag') || undefined
    }
  }
}

class ApiError extends Error {
  constructor(public status: number, public statusText: string) {
    super(`API Error: ${status} ${statusText}`)
    this.name = 'ApiError'
  }
}

class NotModifiedError extends Error {
  constructor() {
    super('Not Modified')
    this.name = 'NotModifiedError'
  }
}

// シングルトンインスタンスをエクスポート
export const apiClient = new ApiClient()

// 型定義もエクスポート
export { ApiClient, ApiError, NotModifiedError }
export type { ApiClientConfig }