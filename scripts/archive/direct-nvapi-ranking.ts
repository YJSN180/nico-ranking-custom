// nvapi を直接呼び出して例のソレジャンルのランキングを取得

async function getNvapiRanking() {
  // 例のソレジャンル MMDタグのランキング
  const baseUrl = 'https://nvapi.nicovideo.jp/v1/ranking/genre/d2um7mc4/tag/MMD'
  const params = new URLSearchParams({
    term: '24h',
    page: '1',
    pageSize: '10'
  })
  
  const url = `${baseUrl}?${params}`
  
  console.log('=== nvapi 直接アクセステスト ===')
  console.log(`URL: ${url}`)
  
  try {
    // 1. Googlebotとして試す
    console.log('\n1. Googlebot User-Agent:')
    const response1 = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1',
        'Accept': 'application/json',
        'Accept-Language': 'ja',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    })
    
    console.log(`Status: ${response1.status}`)
    if (response1.ok) {
      const data = await response1.json()
      console.log('Success! Data structure:', Object.keys(data))
      if (data.data?.items?.length > 0) {
        console.log(`\n取得した動画（最初の3件）:`)
        data.data.items.slice(0, 3).forEach((item: any, i: number) => {
          console.log(`${i + 1}. ${item.title} (${item.id})`)
          console.log(`   再生数: ${item.count?.view?.toLocaleString()}`)
        })
      }
    } else {
      const errorText = await response1.text()
      console.log('Error response:', errorText.substring(0, 200))
    }
    
    // 2. ブラウザUser-Agentで試す
    console.log('\n2. ブラウザ User-Agent:')
    const response2 = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'ja',
        'Origin': 'https://www.nicovideo.jp',
        'Referer': 'https://www.nicovideo.jp/',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    })
    
    console.log(`Status: ${response2.status}`)
    if (response2.ok) {
      const data = await response2.json()
      console.log('Success!')
    } else {
      console.log('Failed')
    }
    
    // 3. Cookie付きで試す
    console.log('\n3. Cookie認証付き:')
    const cookies = 'user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6; sensitive_material_status=accept'
    
    const response3 = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'ja',
        'Cookie': cookies,
        'Origin': 'https://www.nicovideo.jp',
        'Referer': 'https://www.nicovideo.jp/',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0'
      }
    })
    
    console.log(`Status: ${response3.status}`)
    
  } catch (error) {
    console.error('Error:', error)
  }
}

// 通常のランキングAPIも試す
async function getRegularNvapiRanking() {
  console.log('\n\n=== 通常のnvapiランキングエンドポイント ===')
  
  // 前回発見したエンドポイント
  const url = 'https://nvapi.nicovideo.jp/v1/ranking/teiban/d2um7mc4?term=24h&page=1&pageSize=10'
  
  console.log(`URL: ${url}`)
  
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Googlebot/2.1',
        'Accept': 'application/json'
      }
    })
    
    console.log(`Status: ${response.status}`)
    if (!response.ok) {
      const text = await response.text()
      console.log('Response:', text.substring(0, 300))
    } else {
      const data = await response.json()
      console.log('Success! Got data')
    }
  } catch (error) {
    console.error('Error:', error)
  }
}

async function main() {
  await getNvapiRanking()
  await getRegularNvapiRanking()
}

main().catch(console.error)