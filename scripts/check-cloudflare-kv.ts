/**
 * Cloudflare KV詳細調査スクリプト
 * KV内のデータ構造とキャッシュ状況を確認する
 */

async function checkCloudflareKV() {
  console.log('=== Cloudflare KV 詳細調査 ===\n')
  
  // 環境変数の確認
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID  
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
  
  console.log('設定情報:')
  console.log(`- Account ID: ${CF_ACCOUNT_ID ? CF_ACCOUNT_ID.substring(0, 8) + '...' : '未設定'}`)
  console.log(`- Namespace ID: ${CF_NAMESPACE_ID ? CF_NAMESPACE_ID.substring(0, 8) + '...' : '未設定'}`)
  console.log(`- API Token: ${CF_API_TOKEN ? 'あり (隠匿)' : '未設定'}`)
  
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    console.log('\n❌ 必要な環境変数が設定されていません。')
    console.log('以下を.env.localに設定してください:')
    console.log('- CLOUDFLARE_ACCOUNT_ID')
    console.log('- CLOUDFLARE_KV_NAMESPACE_ID')
    console.log('- CLOUDFLARE_KV_API_TOKEN')
    return
  }
  
  try {
    // 1. KVネームスペースの一覧を取得
    console.log('\n1. KVネームスペース一覧の取得:')
    const namespaceUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces`
    
    const namespaceResponse = await fetch(namespaceUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Auth-Email': process.env.CLOUDFLARE_EMAIL || ''
      }
    })
    
    if (namespaceResponse.ok) {
      const namespaceData = await namespaceResponse.json()
      console.log(`- 見つかったネームスペース数: ${namespaceData.result?.length || 0}`)
      
      namespaceData.result?.forEach((ns: any) => {
        console.log(`  - ${ns.title} (ID: ${ns.id})`)
        if (ns.id === CF_NAMESPACE_ID) {
          console.log('    ✅ これが現在使用中のネームスペースです')
        }
      })
    } else {
      console.log(`❌ ネームスペース取得失敗: ${namespaceResponse.status}`)
    }
    
    // 2. KV内のキー一覧を取得
    console.log('\n2. KV内のキー一覧:')
    const keysUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys`
    
    const keysResponse = await fetch(keysUrl, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`
      }
    })
    
    if (keysResponse.ok) {
      const keysData = await keysResponse.json()
      console.log(`- 保存されているキー数: ${keysData.result?.length || 0}`)
      
      keysData.result?.forEach((key: any) => {
        console.log(`  - ${key.name}`)
        if (key.metadata) {
          console.log(`    メタデータ: ${JSON.stringify(key.metadata)}`)
        }
      })
    } else {
      console.log(`❌ キー一覧取得失敗: ${keysResponse.status}`)
    }
    
    // 3. 重要なキーの詳細確認
    console.log('\n3. 重要なキーの詳細確認:')
    
    const importantKeys = [
      'RANKING_LATEST',
      'ng-list-manual', 
      'ng-list-derived',
      'ranking-all-24h',
      'ranking-all-hour',
      'ranking-other-24h'
    ]
    
    for (const keyName of importantKeys) {
      try {
        const keyUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/metadata/${keyName}`
        
        const keyResponse = await fetch(keyUrl, {
          headers: {
            'Authorization': `Bearer ${CF_API_TOKEN}`
          }
        })
        
        if (keyResponse.ok) {
          const keyMeta = await keyResponse.json()
          console.log(`\n${keyName}:`)
          console.log(`  - 存在: ✅`)
          console.log(`  - メタデータ: ${JSON.stringify(keyMeta.result || {})}`)
          
          // データサイズの概算を取得
          try {
            const valueUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${keyName}`
            const valueResponse = await fetch(valueUrl, {
              method: 'HEAD',
              headers: {
                'Authorization': `Bearer ${CF_API_TOKEN}`
              }
            })
            
            if (valueResponse.ok) {
              const contentLength = valueResponse.headers.get('content-length')
              if (contentLength) {
                const sizeKB = Math.round(parseInt(contentLength) / 1024)
                console.log(`  - データサイズ: ${sizeKB} KB`)
              }
            }
          } catch (sizeError) {
            // サイズ取得失敗は無視
          }
          
        } else if (keyResponse.status === 404) {
          console.log(`\n${keyName}: ❌ 存在しません`)
        } else {
          console.log(`\n${keyName}: ❌ エラー (${keyResponse.status})`)
        }
      } catch (error) {
        console.log(`\n${keyName}: ❌ 確認エラー`)
      }
    }
    
    // 4. NGリストの詳細確認
    console.log('\n4. NGリストの詳細確認:')
    
    try {
      const ngManualUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-manual`
      const ngManualResponse = await fetch(ngManualUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`
        }
      })
      
      if (ngManualResponse.ok) {
        const ngManualData = await ngManualResponse.json()
        console.log('ng-list-manual:')
        console.log(`  - 動画ID数: ${ngManualData.videoIds?.length || 0}`)
        console.log(`  - 動画タイトル数: ${ngManualData.videoTitles?.length || 0}`)
        console.log(`  - 投稿者ID数: ${ngManualData.authorIds?.length || 0}`)
        console.log(`  - 投稿者名数: ${ngManualData.authorNames?.length || 0}`)
        
        if (ngManualData.authorNames?.length > 0) {
          console.log('  - 投稿者名の例:')
          ngManualData.authorNames.slice(0, 3).forEach((name: string) => {
            console.log(`    * ${name}`)
          })
        }
      } else {
        console.log('ng-list-manual: ❌ 取得失敗 or 存在しない')
      }
      
      const ngDerivedUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`
      const ngDerivedResponse = await fetch(ngDerivedUrl, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`
        }
      })
      
      if (ngDerivedResponse.ok) {
        const ngDerivedData = await ngDerivedResponse.json()
        console.log('ng-list-derived:')
        console.log(`  - 派生動画ID数: ${ngDerivedData?.length || 0}`)
      } else {
        console.log('ng-list-derived: ❌ 取得失敗 or 存在しない')
      }
      
    } catch (ngError) {
      console.log('NGリスト確認エラー:', ngError)
    }
    
  } catch (error) {
    console.error('調査エラー:', error)
  }
}

// Node.js環境での実行
if (require.main === module) {
  require('dotenv').config({ path: '.env.local' })
  checkCloudflareKV().catch(console.error)
}

export default checkCloudflareKV