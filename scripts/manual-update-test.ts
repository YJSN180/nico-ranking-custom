import 'dotenv/config'
import { updateRankingData } from '../lib/update-ranking'

async function manualUpdateTest() {
  console.log('=== 手動でupdate-rankingを実行 ===\n')
  
  // 環境変数の確認
  const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
  console.log(`KV環境変数: ${hasKV ? '✅ 設定済み' : '❌ 未設定'}\n`)
  
  if (!hasKV) {
    console.error('KV環境変数が設定されていません。.env.localファイルを確認してください。')
    return
  }
  
  try {
    console.log('更新を開始します...\n')
    const startTime = Date.now()
    
    const result = await updateRankingData()
    
    const endTime = Date.now()
    const duration = Math.round((endTime - startTime) / 1000)
    
    console.log('\n=== 更新結果 ===')
    console.log(`成功: ${result.success}`)
    console.log(`更新されたジャンル・期間: ${result.updatedGenres.length}件`)
    if (result.updatedGenres.length > 0) {
      console.log(`  ${result.updatedGenres.join(', ')}`)
    }
    
    if (result.failedGenres && result.failedGenres.length > 0) {
      console.log(`失敗したジャンル・期間: ${result.failedGenres.length}件`)
      console.log(`  ${result.failedGenres.join(', ')}`)
    }
    
    if (result.error) {
      console.log(`エラー: ${result.error}`)
    }
    
    console.log(`\n実行時間: ${duration}秒`)
    
  } catch (error) {
    console.error('致命的エラー:', error)
  }
}

// dotenvで.env.localを読み込む
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

manualUpdateTest().catch(console.error)