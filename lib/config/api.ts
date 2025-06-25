/**
 * API設定 - プレビュー環境対応
 */

// Worker URLの取得（プレビュー環境対応）
export const getWorkerUrl = (): string => {
  // プレビュー環境では動的に設定されたURLを使用
  if (process.env.NEXT_PUBLIC_WORKER_URL) {
    return process.env.NEXT_PUBLIC_WORKER_URL
  }
  
  // Vercelプレビュー環境のフォールバック
  if (process.env.VERCEL_ENV === 'preview') {
    // プレビュー環境でもWorker URLが設定されていない場合は本番URLを使用
    console.warn('Preview environment detected but NEXT_PUBLIC_WORKER_URL not set')
  }
  
  // 本番環境のURL
  return 'https://nico-rank.com'
}

// プレビュートークンの取得
export const getPreviewToken = (): string | undefined => {
  return process.env.NEXT_PUBLIC_PREVIEW_TOKEN
}

// APIクライアントの基本設定
export const apiConfig = {
  baseUrl: getWorkerUrl(),
  headers: (): HeadersInit => {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }
    
    // プレビュー環境の場合はトークンを追加
    const previewToken = getPreviewToken()
    if (previewToken) {
      headers['X-Preview-Token'] = previewToken
    }
    
    return headers
  }
}