#!/usr/bin/env tsx

// APIレスポンスのデバッグ

async function debugApiResponse() {
  console.log('=== APIレスポンスのデバッグ ===')
  
  const mobileHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'application/json;charset=utf-8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Origin': 'https://sp.nicovideo.jp',
    'Referer': 'https://sp.nicovideo.jp/',
    'X-Client-Os-Type': 'ios',
    'X-Frontend-Id': '3',
    'X-Frontend-Version': '',
    'X-Niconico-Language': 'ja-jp',
    'Cookie': 'nicosid=1725186023.265332462; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP'
  }
  
  // 1. 例のソレAPIを再テスト（先ほど成功したもの）
  console.log('\n=== 1. 例のソレAPI再テスト ===')
  const exampleSoreUrl = 'https://nvapi.nicovideo.jp/v1/ranking/teiban/d2um7mc4?term=24h&page=1&pageSize=10'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: exampleSoreUrl,
        headers: mobileHeaders
      }),
    })

    console.log('レスポンス status:', response.status)
    console.log('レスポンス ok:', response.ok)
    
    const proxyData = await response.json()
    console.log('プロキシレスポンス構造:', Object.keys(proxyData))
    console.log('statusCode:', proxyData.statusCode)
    console.log('body type:', typeof proxyData.body)
    
    if (proxyData.statusCode === 200) {
      try {
        const apiData = JSON.parse(proxyData.body)
        console.log('✅ 例のソレAPI成功')
        console.log('API構造:', Object.keys(apiData))
        
        if (apiData.data?.items) {
          console.log(`動画数: ${apiData.data.items.length}`)
          console.log('上位3動画:')
          apiData.data.items.slice(0, 3).forEach((item: any, index: number) => {
            console.log(`  ${index + 1}. ${item.title}`)
          })
        }
      } catch (parseError) {
        console.log('JSON解析エラー:', parseError)
        console.log('生データ（最初の200文字）:', proxyData.body.substring(0, 200))
      }
    } else {
      console.log('✗ API失敗')
      console.log('エラー詳細:', proxyData)
    }
    
  } catch (error) {
    console.error('リクエストエラー:', error)
  }
  
  // 2. その他ジャンルAPIをテスト
  console.log('\n=== 2. その他ジャンルAPIテスト ===')
  const otherGenreUrl = 'https://nvapi.nicovideo.jp/v1/ranking/teiban/ramuboyn?term=24h&page=1&pageSize=10'
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: otherGenreUrl,
        headers: mobileHeaders
      }),
    })

    const proxyData = await response.json()
    console.log('その他ジャンル statusCode:', proxyData.statusCode)
    
    if (proxyData.statusCode === 200) {
      try {
        const apiData = JSON.parse(proxyData.body)
        console.log('✅ その他ジャンルAPI成功')
        
        if (apiData.data?.items) {
          console.log(`動画数: ${apiData.data.items.length}`)
          console.log('上位3動画:')
          apiData.data.items.slice(0, 3).forEach((item: any, index: number) => {
            console.log(`  ${index + 1}. ${item.title}`)
          })
        }
      } catch (parseError) {
        console.log('JSON解析エラー:', parseError)
      }
    } else {
      console.log('✗ その他ジャンルAPI失敗')
      console.log('エラー:', proxyData.body)
    }
    
  } catch (error) {
    console.error('その他ジャンルエラー:', error)
  }
  
  // 3. プロキシサーバーの状態確認
  console.log('\n=== 3. プロキシサーバー状態確認 ===')
  
  try {
    const testResponse = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: 'https://httpbin.org/json',
        headers: {
          'User-Agent': 'test'
        }
      }),
    })

    const testData = await testResponse.json()
    console.log('プロキシテスト statusCode:', testData.statusCode)
    
    if (testData.statusCode === 200) {
      console.log('✅ プロキシサーバー正常動作')
    } else {
      console.log('✗ プロキシサーバー異常')
    }
    
  } catch (error) {
    console.error('プロキシテストエラー:', error)
  }
}

debugApiResponse().catch(console.error)