/**
 * test-500 ページ用のデータ取得ユーティリティ
 * 重い KV アクセスと API 処理を分離
 */

// 動的インポートで KV を遅延ロード
async function getKV() {
  const { kv } = await import('@/lib/simple-kv')
  return kv
}

export async function getOtherGenre500Items() {
  try {
    // KVを動的インポート
    const kv = await getKV()
    const data = await kv.get('ranking-other-24h') as any
    
    if (data && data.items) {
      return {
        items: data.items,
        popularTags: data.popularTags || []
      }
    }
  } catch (error) {
    // KVエラーは無視してフォールバックを使用
  }
  
  // フォールバック: テストデータ
  const response = await fetch('http://localhost:3000/api/test-500-items', {
    cache: 'no-store'
  })
  
  if (!response.ok) {
    return { items: [], popularTags: [] }
  }
  
  return await response.json()
}