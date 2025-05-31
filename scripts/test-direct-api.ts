#!/usr/bin/env tsx

// nvapi APIを直接テスト（プロキシ経由）

async function testDirectApi() {
  console.log('=== nvapi API直接テスト ===')
  
  // 開発者ツールから取得した正確なヘッダー
  const headers = {
    'accept': 'application/json;charset=utf-8',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    'cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D',
    'origin': 'https://sp.nicovideo.jp',
    'referer': 'https://sp.nicovideo.jp/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'x-client-os-type': 'ios',
    'x-frontend-id': '3',
    'x-frontend-version': '',
    'x-niconico-language': 'ja-jp'
  }
  
  // プロキシのログ確認
  console.log('\n=== プロキシサーバー動作確認 ===')
  try {
    const testUrl = 'https://httpbin.org/get'
    const testResponse = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: testUrl,
        headers: { 'User-Agent': 'test' }
      }),
    })
    
    const testData = await testResponse.json()
    console.log('プロキシテスト:', testData.status === 200 ? '✅ 成功' : '❌ 失敗')
  } catch (error) {
    console.error('プロキシエラー:', error)
  }
  
  // APIテスト1: 例のソレジャンル基本ランキング
  console.log('\n=== 例のソレジャンル基本ランキング ===')
  const d2um7mc4Url = 'https://nvapi.nicovideo.jp/v1/ranking/teiban/d2um7mc4?term=24h&page=1&pageSize=10'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: d2um7mc4Url,
        headers: headers
      }),
    })
    
    console.log('プロキシレスポンス:', response.status, response.statusText)
    
    const proxyData = await response.json()
    console.log('プロキシData keys:', Object.keys(proxyData))
    console.log('Status:', proxyData.status || proxyData.statusCode)
    
    if (proxyData.status === 200 || proxyData.statusCode === 200) {
      const apiData = JSON.parse(proxyData.body)
      console.log('✅ API成功')
      
      if (apiData.data?.items) {
        console.log(`動画数: ${apiData.data.items.length}`)
        console.log('\n上位5動画:')
        apiData.data.items.slice(0, 5).forEach((item: any, index: number) => {
          console.log(`${index + 1}. ${item.title}`)
          console.log(`   ID: ${item.id}`)
          console.log(`   再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
        })
      }
    } else {
      console.log('❌ API失敗')
      console.log('エラー:', proxyData.body)
      
      // プロキシサーバーの問題を詳細に確認
      if (proxyData.body?.includes('INVALID_PARAMETER')) {
        console.log('\n❌ INVALID_PARAMETER エラー')
        console.log('考えられる原因:')
        console.log('1. APIのパラメータ形式が変更された')
        console.log('2. 認証情報が不十分')
        console.log('3. APIのバージョンが古い')
      }
    }
    
  } catch (error) {
    console.error('リクエストエラー:', error)
  }
  
  // APIテスト2: その他ジャンル基本ランキング
  console.log('\n=== その他ジャンル基本ランキング ===')
  const ramuboynUrl = 'https://nvapi.nicovideo.jp/v1/ranking/teiban/ramuboyn?term=24h&page=1&pageSize=10'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: ramuboynUrl,
        headers: headers
      }),
    })
    
    const proxyData = await response.json()
    
    if (proxyData.status === 200 || proxyData.statusCode === 200) {
      const apiData = JSON.parse(proxyData.body)
      console.log('✅ API成功')
      
      if (apiData.data?.items) {
        console.log(`動画数: ${apiData.data.items.length}`)
        console.log('\n上位5動画:')
        apiData.data.items.slice(0, 5).forEach((item: any, index: number) => {
          console.log(`${index + 1}. ${item.title}`)
          console.log(`   ID: ${item.id}`)
          console.log(`   再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
        })
      }
    } else {
      console.log('❌ API失敗')
      console.log('エラー:', proxyData.body)
    }
    
  } catch (error) {
    console.error('リクエストエラー:', error)
  }
  
  // APIテスト3: タグ別ランキング（例のソレ・紳士向け）
  console.log('\n=== 例のソレジャンル「紳士向け」タグランキング ===')
  const tagUrl = 'https://nvapi.nicovideo.jp/v1/ranking/teiban/d2um7mc4?term=24h&page=1&pageSize=10&tag=' + encodeURIComponent('紳士向け')
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: tagUrl,
        headers: headers
      }),
    })
    
    const proxyData = await response.json()
    
    if (proxyData.status === 200 || proxyData.statusCode === 200) {
      const apiData = JSON.parse(proxyData.body)
      console.log('✅ タグランキングAPI成功')
      
      if (apiData.data?.items) {
        console.log(`動画数: ${apiData.data.items.length}`)
        console.log('\n「紳士向け」タグ 上位5動画:')
        apiData.data.items.slice(0, 5).forEach((item: any, index: number) => {
          console.log(`${index + 1}. ${item.title}`)
          console.log(`   ID: ${item.id}`)
          console.log(`   再生数: ${item.count?.view?.toLocaleString() || '不明'}回`)
        })
      }
    } else {
      console.log('❌ タグランキングAPI失敗')
      console.log('エラー:', proxyData.body)
    }
    
  } catch (error) {
    console.error('タグランキングエラー:', error)
  }
  
  console.log('\n=== 結論 ===')
  console.log('nvapi APIの直接テスト結果を確認')
  console.log('400エラーの場合は、APIの仕様変更またはプロキシサーバーの問題')
}

testDirectApi().catch(console.error)