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
if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_KV_NAMESPACE_ID || !process.env.CLOUDFLARE_KV_API_TOKEN) {
  console.error('Cloudflare KVの環境変数が設定されていません')
  console.error('以下の環境変数を設定してください:')
  console.error('  - CLOUDFLARE_ACCOUNT_ID')
  console.error('  - CLOUDFLARE_KV_NAMESPACE_ID')
  console.error('  - CLOUDFLARE_KV_API_TOKEN')
  process.exit(1)
}

// 実行
initializeNGList().then(() => {
  console.log('完了しました')
  process.exit(0)
})