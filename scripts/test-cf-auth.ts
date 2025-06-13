/**
 * Cloudflare API認証テスト
 */

async function testCloudflareAuth() {
  console.log('=== Cloudflare API認証テスト ===\n')
  
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  if (!CF_API_TOKEN) {
    console.log('❌ CLOUDFLARE_KV_API_TOKEN が設定されていません')
    return
  }
  
  console.log('APIトークン設定済み（認証テスト中...）\n')
  
  // 1. トークン検証API
  const verifyUrl = 'https://api.cloudflare.com/client/v4/user/tokens/verify'
  
  try {
    const response = await fetch(verifyUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
    
    console.log(`認証ステータス: ${response.status}`)
    const result = await response.json()
    
    if (result.success) {
      console.log('✅ APIトークンは有効です')
      console.log('トークン情報:')
      console.log(`- ID: ${result.result.id}`)
      console.log(`- Status: ${result.result.status}`)
      
      if (result.result.policies) {
        console.log('- 権限:')
        result.result.policies.forEach((policy: any, index: number) => {
          console.log(`  ${index + 1}. リソース: ${JSON.stringify(policy.resources)}`)
          console.log(`     権限: ${JSON.stringify(policy.permission_groups)}`)
        })
      }
    } else {
      console.log('❌ APIトークンが無効です')
      console.log('エラー:', result.errors)
    }
    
  } catch (error) {
    console.error('認証テストエラー:', error)
  }
  
  // 2. アカウント情報取得テスト
  console.log('\n--- アカウント情報取得テスト ---')
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  
  if (CF_ACCOUNT_ID) {
    const accountUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
    
    try {
      const response = await fetch(accountUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      })
      
      console.log(`アカウント情報ステータス: ${response.status}`)
      const result = await response.json()
      
      if (result.success) {
        console.log('✅ アカウント情報取得成功')
        console.log(`- アカウント名: ${result.result.name}`)
        console.log(`- アカウントID: ${result.result.id}`)
      } else {
        console.log('❌ アカウント情報取得失敗')
        console.log('エラー:', result.errors)
      }
      
    } catch (error) {
      console.error('アカウント情報テストエラー:', error)
    }
  }
}

// 実行
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' })
  testCloudflareAuth().catch(console.error)
}

export default testCloudflareAuth