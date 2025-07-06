/**
 * サムネイル取得APIのテスト
 * Cloudflare Workers環境でのテスト用
 */

// テスト用のビデオID
const TEST_VIDEO_IDS = [
  'sm9', // 最初期の動画
  'sm2413267', // 人気動画の例
  'sm40000000', // 最近の動画の例
]

/**
 * サムネイル取得APIのテスト関数
 * @param apiEndpoint - APIのエンドポイントURL (例: https://nico-rank.com/api/thumbnail/)
 */
export async function testThumbnailAPI(apiEndpoint: string) {
  console.log('=== サムネイル取得APIテスト開始 ===')
  console.log(`エンドポイント: ${apiEndpoint}`)
  console.log('')

  for (const videoId of TEST_VIDEO_IDS) {
    console.log(`--- ${videoId} のテスト ---`)
    
    try {
      // 1回目: キャッシュなし (MISS)
      console.log('1回目のリクエスト (キャッシュなし)...')
      const response1 = await fetch(`${apiEndpoint}${videoId}`)
      const data1 = await response1.json()
      
      console.log(`ステータス: ${response1.status}`)
      console.log(`キャッシュ状態: ${response1.headers.get('X-Cache-Status') || 'N/A'}`)
      console.log(`レスポンス:`, data1)
      
      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 2回目: キャッシュあり (HIT)
      console.log('\n2回目のリクエスト (キャッシュあり)...')
      const response2 = await fetch(`${apiEndpoint}${videoId}`)
      const data2 = await response2.json()
      
      console.log(`ステータス: ${response2.status}`)
      console.log(`キャッシュ状態: ${response2.headers.get('X-Cache-Status') || 'N/A'}`)
      console.log(`レスポンス:`, data2)
      
      // 検証
      if (data2.cached === false && response2.headers.get('X-Cache-Status') === 'HIT') {
        console.warn('警告: cachedフラグとX-Cache-Statusが一致しません')
      }
      
    } catch (error) {
      console.error(`エラー: ${error}`)
    }
    
    console.log('')
  }
  
  // 無効なビデオIDのテスト
  console.log('--- 無効なビデオIDのテスト ---')
  try {
    const invalidResponse = await fetch(`${apiEndpoint}invalid-id!@#`)
    console.log(`ステータス: ${invalidResponse.status}`)
    console.log(`レスポンス:`, await invalidResponse.json())
  } catch (error) {
    console.error(`エラー: ${error}`)
  }
  
  console.log('\n=== テスト完了 ===')
}

// Node.js環境でのテスト実行
if (typeof process !== 'undefined' && process.argv[2]) {
  const endpoint = process.argv[2]
  testThumbnailAPI(endpoint).catch(console.error)
}