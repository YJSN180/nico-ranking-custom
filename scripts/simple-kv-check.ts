/**
 * シンプルなKV確認スクリプト - エラー詳細表示
 */

async function simpleKVCheck() {
  console.log('=== Cloudflare KV簡易確認 ===\n')
  
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID  
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  console.log('環境変数:')
  console.log(`- CLOUDFLARE_ACCOUNT_ID: ${CF_ACCOUNT_ID ? CF_ACCOUNT_ID.slice(0,4)+'...' : '未設定'}`)
  console.log(`- CLOUDFLARE_KV_NAMESPACE_ID: ${CF_NAMESPACE_ID ? CF_NAMESPACE_ID.slice(0,4)+'...' : '未設定'}`)
  console.log(`- CLOUDFLARE_KV_API_TOKEN: ${CF_API_TOKEN ? 'あり' : '未設定'}\n`)
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.log('❌ 必要な環境変数が不足しています')
    return
  }
  
  // 指定されたネームスペースIDでキー一覧を取得
  const keysUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys`
  
  console.log('APIエンドポイント:', keysUrl)
  console.log('リクエスト送信中...\n')
  
  try {
    const response = await fetch(keysUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    console.log(`ステータスコード: ${response.status}`)
    console.log(`ステータステキスト: ${response.statusText}`)
    
    const responseText = await response.text()
    console.log('レスポンス内容:')
    
    try {
      const responseJson = JSON.parse(responseText)
      console.log(JSON.stringify(responseJson, null, 2))
      
      if (responseJson.success && responseJson.result) {
        console.log('\n✅ KVキー取得成功!')
        console.log(`保存されているキー数: ${responseJson.result.length}`)
        
        responseJson.result.forEach((key: any, index: number) => {
          console.log(`${index + 1}. ${key.name}`)
          if (key.metadata) {
            console.log(`   メタデータ: ${JSON.stringify(key.metadata)}`)
          }
        })
      } else {
        console.log('\n❌ API呼び出しが失敗しました')
        if (responseJson.errors) {
          console.log('エラー詳細:')
          responseJson.errors.forEach((error: any) => {
            console.log(`- ${error.message} (コード: ${error.code})`)
          })
        }
      }
    } catch (parseError) {
      console.log('JSONパースエラー。生レスポンス:')
      console.log(responseText)
    }
    
  } catch (error) {
    console.error('リクエストエラー:', error)
  }
}

// 実行
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' })
  simpleKVCheck().catch(console.error)
}

export default simpleKVCheck