#!/usr/bin/env tsx

// RemixContextの詳細とクライアントサイドAPIを確認

async function checkRemixContextDetail() {
  console.log('=== RemixContextとクライアントサイドAPIの確認 ===')
  
  const fullHeaders = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Referer': 'https://sp.nicovideo.jp/',
    'Cookie': 'nicosid=1725186023.265332462; _ss_pp_id=2d36063cde9e940bcf21725153625674; _yjsu_yjad=1725186026.a31135ca-301e-4f44-aab2-ebfcf7ff867f; _id5_uid=ID5-5c99Wsu2SS8KuOtp39Cc13xhSy8xFDSzzAq-JgGQ9A; _tt_enable_cookie=1; rpr_opted_in=1; rpr_uid=204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c; rpr_is_first_session={%22204eb3b0-8c91-11ef-b6ea-69ffc2d6a68c%22:1}; rpr_session_started_at=1729174041194; rpr_event_last_tracked_at=1729174041873; user_session=user_session_134077750_2da2315c5d1f49d1246ce0a83cc9519e18ab79a9bab91f27463f5dca8d10641a; user_session_secure=MTM0MDc3NzUwOlROZDFSSE1sdm9GLWouaXotV3RTbEVHYlU3M0I4eTM4QUpsVGVGcDRaRE0; lang=ja-jp; area=JP; _ttp=on9NPOyKGsihlDV2IepgZa8Cjdr.tt.1; experimentalNicoliveColorTheme=light; __eoi=ID=a832e02020c5267d:T=1740844182:RT=1745570905:S=AA-AfjaVdxRz3KhFVUc1fv-bKrV_; dlive_bid=dlive_bid_nwTL9LSbsgwRQsMekAohwYuZgJt2jP5k; nico_gc=tg_s%3Dn%26tg_o%3Dd%26srch_s%3Dv%26srch_o%3Dd; _td=5d217bdf-14ac-4916-b2da-6ae7b4ec3738; common-header-oshirasebox-new-allival=false; lastViewedRanking=%7B%22type%22%3A%22featured-key%22%2C%22featuredKey%22%3A%22d2um7mc4%22%2C%22term%22%3A%2224h%22%7D'
  }
  
  // 例のソレジャンルで確認
  const url = 'https://sp.nicovideo.jp/ranking/genre/d2um7mc4?redirected=1'
  console.log(`URL: ${url}`)
  
  try {
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: url,
        headers: fullHeaders
      }),
    })

    const proxyData = await response.json()
    
    if (proxyData.status === 200) {
      const html = proxyData.body
      console.log(`HTMLサイズ: ${html.length.toLocaleString()}文字`)
      
      // 1. RemixContextの内容を確認
      const remixMatch = html.match(/window\.__remixContext\s*=\s*({.+?});/)
      if (remixMatch) {
        const remixData = JSON.parse(remixMatch[1])
        console.log('\n=== RemixContext 詳細 ===')
        console.log(JSON.stringify(remixData, null, 2))
        
        // loaderDataのroute情報を確認
        if (remixData.state?.loaderData) {
          const loaderData = remixData.state.loaderData
          const featuredKeyRoute = loaderData['routes/_l-common._l-video.ranking.genre.$featuredKey']
          
          if (featuredKeyRoute) {
            console.log('\n=== FeaturedKey Route情報 ===')
            console.log('featuredKey:', featuredKeyRoute.featuredKey)
            console.log('term:', featuredKeyRoute.term)
            console.log('tag:', featuredKeyRoute.tag)
            
            // この情報を使ってAPIを推測
            if (featuredKeyRoute.featuredKey === 'd2um7mc4') {
              console.log('\n✅ 例のソレジャンルが正しく設定されています')
              console.log('APIエンドポイントの可能性:')
              console.log(`- /api/ranking/genre/${featuredKeyRoute.featuredKey}`)
              console.log(`- /api/v1/ranking/teiban/${featuredKeyRoute.featuredKey}`)
              console.log(`- ${remixData.state.loaderData.root.spwebContext.env.Url.NVAPI_BASE_URL}/v1/ranking/teiban/${featuredKeyRoute.featuredKey}`)
            }
          }
        }
      }
      
      // 2. JavaScriptファイルのURLを確認
      console.log('\n=== JavaScriptファイルURL ===')
      const scriptTags = html.match(/<script[^>]*src="[^"]+"/g)
      if (scriptTags) {
        scriptTags.forEach(tag => {
          const srcMatch = tag.match(/src="([^"]+)"/)
          if (srcMatch) {
            console.log(`- ${srcMatch[1]}`)
          }
        })
      }
      
      // 3. APIコール関連の情報を探す
      console.log('\n=== API関連の設定を探す ===')
      
      // window.__remixRouteModulesを確認
      const routeModulesMatch = html.match(/window\.__remixRouteModules\s*=\s*({.+?});/)
      if (routeModulesMatch) {
        console.log('__remixRouteModules 発見:')
        console.log(routeModulesMatch[1])
      }
      
      // 4. クライアントサイドでのデータ取得方法を推測
      console.log('\n=== クライアントサイドデータ取得の推測 ===')
      console.log('Remixフレームワークの動作:')
      console.log('1. 初期HTMLにはメタデータのみ含まれる')
      console.log('2. クライアントサイドでJavaScriptが実行される')
      console.log('3. APIコールで実際のランキングデータを取得')
      console.log('4. React/Remixがデータをレンダリング')
      
      // 5. 先ほど発見したnvapiエンドポイントを再確認
      console.log('\n=== 正しいAPIエンドポイント ===')
      const nvapiBase = 'https://nvapi.nicovideo.jp'
      const endpoints = [
        `${nvapiBase}/v1/ranking/teiban/d2um7mc4?term=24h&page=1&pageSize=100`,
        `${nvapiBase}/v1/ranking/teiban/ramuboyn?term=24h&page=1&pageSize=100`
      ]
      
      console.log('開発者ツールで確認されたエンドポイント:')
      endpoints.forEach(endpoint => console.log(`- ${endpoint}`))
      
      console.log('\n🎯 結論:')
      console.log('スマートフォン版はSSRではなく、クライアントサイドレンダリング')
      console.log('開発者ツールで確認したnvapi APIが正しいデータソース')
      console.log('APIには適切な認証ヘッダーが必要')
      
    } else {
      console.log(`HTML取得失敗: ${proxyData.status}`)
    }
    
  } catch (error) {
    console.error('確認エラー:', error)
  }
}

checkRemixContextDetail().catch(console.error)