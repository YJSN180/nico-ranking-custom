/**
 * test-500 ページ用のデータ取得ユーティリティ
 * 重い KV アクセスと API 処理を分離
 */

// 動的インポートで KV を遅延ロード
async function getKV() {
  const { kv } = await import('@/lib/simple-kv')
  return kv
}

/**
 * ベースURLを動的に取得
 * 優先順位: NEXT_PUBLIC_BASE_URL > VERCEL_URL > localhost
 */
function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }
  if (process.env.VERCEL_URL) {
    return \`https://\${process.env.VERCEL_URL}\`
  }
  return 'http://localhost:3000'
}

export async function getOtherGenre500Items() {
  try {
    // KVを動的インポート
    const kv = await getKV()
    const data = await kv.get('ranking-other-24h') as unknown

    if (data && typeof data === 'object' && 'items' in data) {
      const typedData = data as { items: unknown[]; popularTags?: unknown[] }
      return {
        items: typedData.items,
        popularTags: typedData.popularTags || []
      }
    }
  } catch (error) {
    // KVエラーは無視してフォールバックを使用
  }

  // フォールバック: テストデータ
  const baseUrl = getBaseUrl()
  const response = await fetch(\`\${baseUrl}/api/test-500-items\`, {
    cache: 'no-store'
  })

  if (!response.ok) {
    return { items: [], popularTags: [] }
  }

  return await response.json()
}
