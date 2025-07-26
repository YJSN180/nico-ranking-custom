/**
 * 統一CORS設定ユーティリティ
 * セキュアで実用的なCORS設定を提供
 * 
 * Features:
 * - Vercelプレビュー環境の動的URL対応
 * - 本番・開発環境の適切な制限
 * - CORS重複問題の回避
 */

interface CORSHeaders {
  'Access-Control-Allow-Origin': string
  'Access-Control-Allow-Methods': string
  'Access-Control-Allow-Headers': string
  'Access-Control-Max-Age': string
  'Access-Control-Allow-Credentials'?: string
  [key: string]: string | undefined
}

/**
 * 許可されたオリジンかどうかを判定
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  
  try {
    const url = new URL(origin)
    const hostname = url.hostname
    
    // 本番ドメイン
    if (hostname === 'nico-rank.com') {
      return true
    }
    
    // Vercel環境（プロジェクト名ベースで安全に制限）
    if (hostname.endsWith('.vercel.app')) {
      // プロジェクト名とアカウント名で制限
      if (hostname.includes('nico-ranking-custom') && 
          hostname.includes('yjsns-projects')) {
        return true
      }
    }
    
    // 開発環境（localhostのみ）
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return true
    }
    
    return false
  } catch (error) {
    // 無効なURLの場合は拒否
    return false
  }
}

/**
 * 安全なCORSヘッダーを生成
 */
export function createSecureCORSHeaders(origin: string | null): CORSHeaders {
  const allowedOrigin = origin && isAllowedOrigin(origin) 
    ? origin 
    : 'https://nico-rank.com' // フォールバック
    
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Auth, X-SSR-Request',
    'Access-Control-Max-Age': '86400' // 24時間キャッシュ
  }
}

/**
 * レスポンスからCORS関連ヘッダーを削除
 * Smart Routerでの重複問題回避用
 */
export function removeCORSHeaders(headers: Headers): Headers {
  const cleanHeaders = new Headers(headers)
  
  // CORS関連ヘッダーを削除
  cleanHeaders.delete('Access-Control-Allow-Origin')
  cleanHeaders.delete('Access-Control-Allow-Methods')
  cleanHeaders.delete('Access-Control-Allow-Headers')
  cleanHeaders.delete('Access-Control-Max-Age')
  cleanHeaders.delete('Access-Control-Allow-Credentials')
  
  return cleanHeaders
}

/**
 * レスポンスに安全なCORSヘッダーを適用
 */
export function applyCORSHeaders(
  response: Response, 
  origin: string | null,
  additionalHeaders: Record<string, string> = {}
): Response {
  const corsHeaders = createSecureCORSHeaders(origin)
  
  // 既存のヘッダーからCORS関連を削除
  const cleanHeaders = removeCORSHeaders(response.headers)
  
  // 新しいヘッダーオブジェクトを構築
  const newHeaders = new Headers(cleanHeaders)
  
  // CORSヘッダーを設定
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value)
  })
  
  // 追加ヘッダーを設定
  Object.entries(additionalHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value)
  })
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}

/**
 * OPTIONSリクエスト用のプリフライトレスポンス
 */
export function createOptionsResponse(origin: string | null): Response {
  const corsHeaders = createSecureCORSHeaders(origin)
  
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  })
}

/**
 * CORS設定のデバッグ情報
 */
export function getCORSDebugInfo(origin: string | null) {
  return {
    origin: origin,
    isAllowed: isAllowedOrigin(origin),
    selectedOrigin: origin && isAllowedOrigin(origin) ? origin : 'https://nico-rank.com',
    timestamp: new Date().toISOString()
  }
}