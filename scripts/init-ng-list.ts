import { kv } from '../lib/simple-kv'
import type { NGList } from '../types/ng-list'

async function initializeNGList() {
  try {
    // 初期NGリスト（「蠍媛」を投稿者名NGに追加）
    const initialNGList: Omit<NGList, 'derivedVideoIds'> = {
      videoIds: [],
      videoTitles: [],
      authorIds: [],
      authorNames: ['蠍媛'] // 投稿者名「蠍媛」をNGに設定
    }
    
    // 手動NGリストを設定
    await kv.set('ng-list-manual', initialNGList)
    
    // 派生NGリストを初期化（空の配列）
    await kv.set('ng-list-derived', [])
    
    console.log('NGリストを初期化しました:')
    console.log('- 投稿者名NG: 蠍媛')
    
  } catch (error) {
    console.error('NGリストの初期化に失敗しました:', error)
    process.exit(1)
  }
}

// 環境変数チェック
if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
  console.error('KV_REST_API_URLとKV_REST_API_TOKENが設定されていません')
  process.exit(1)
}

// 実行
initializeNGList().then(() => {
  console.log('完了しました')
  process.exit(0)
})