// 例のソレジャンルのHTMLメタタグからランキングデータを取得

async function testReiSoreHtmlMeta() {
  console.log('=== 例のソレジャンル HTMLメタタグ取得テスト ===\n')
  console.log(new Date().toLocaleString('ja-JP'))
  console.log('\n')
  
  const urls = [
    {
      name: '例のソレ 毎時総合',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=hour'
    },
    {
      name: '例のソレ 24時間総合',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?term=24h'
    },
    {
      name: '例のソレ R-18タグ 毎時',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?tag=R-18&term=hour'
    },
    {
      name: '例のソレ MMDタグ 毎時',
      url: 'https://www.nicovideo.jp/ranking/genre/d2um7mc4?tag=MMD&term=hour'
    },
    {
      name: '比較：その他 毎時総合',
      url: 'https://www.nicovideo.jp/ranking/genre/ramuboyn?term=hour'
    }
  ]
  
  for (const urlInfo of urls) {
    console.log(`\n=== ${urlInfo.name} ===`)
    console.log(`URL: ${urlInfo.url}`)
    
    try {
      // 複数のUser-Agentを試す
      const userAgents = [
        {
          name: 'Googlebot',
          value: 'Googlebot/2.1 (+http://www.google.com/bot.html)'
        },
        {
          name: 'Chrome + Cookie',
          value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          cookie: 'sensitive_material_status=accept; user_session=user_session_54116935_56e7cd07bafc0c91b4e87baec017fe86bc64e014cf01c1f5cf07eaf02f0503f6'
        }
      ]
      
      for (const ua of userAgents) {
        console.log(`\n--- ${ua.name} ---`)
        
        const headers: any = {
          'User-Agent': ua.value,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja'
        }
        
        if (ua.cookie) {
          headers['Cookie'] = ua.cookie
        }
        
        const response = await fetch(urlInfo.url, { headers })
        
        console.log(`Status: ${response.status}`)
        
        if (response.status === 200) {
          const html = await response.text()
          
          // ページタイトルを確認
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
          if (titleMatch) {
            console.log(`Page title: ${titleMatch[1]}`)
          }
          
          // リダイレクトされたか確認
          if (html.includes('総合') && urlInfo.name.includes('例のソレ')) {
            console.log('⚠️ 総合ランキングにリダイレクトされた可能性')
          }
          
          // og:video:tagメタタグを探す
          const metaTags = html.matchAll(/<meta\s+property="og:video:tag"\s+content="([^"]+)"/g)
          const rankings = []
          
          for (const match of metaTags) {
            const content = match[1]
            // ランキング形式のデータか確認
            if (content.includes('第') && content.includes('位：')) {
              rankings.push(content)
            }
          }
          
          if (rankings.length > 0) {
            console.log(`✅ ランキングデータ発見: ${rankings.length}件`)
            console.log('\n最初の5件:')
            rankings.slice(0, 5).forEach((ranking, i) => {
              console.log(`${i + 1}. ${ranking}`)
              // 動画IDを抽出
              const idMatch = ranking.match(/(sm|nm|so)\d+/)
              if (idMatch) {
                console.log(`   ID: ${idMatch[0]}`)
              }
            })
          } else {
            console.log('❌ ランキングデータが見つかりません')
            
            // 他のメタタグを確認
            const allMetaTags = html.matchAll(/<meta\s+property="([^"]+)"\s+content="([^"]+)"/g)
            let count = 0
            console.log('\n他のメタタグ（最初の10件）:')
            for (const match of allMetaTags) {
              if (count++ < 10) {
                console.log(`   ${match[1]}: ${match[2].substring(0, 80)}...`)
              }
            }
            
            // og:video:tag以外の形式も確認
            const videoTags = html.matchAll(/<meta\s+property="og:video:tag"\s+content="([^"]+)"/g)
            console.log('\nog:video:tag の内容:')
            let videoTagCount = 0
            for (const match of videoTags) {
              if (videoTagCount++ < 5) {
                console.log(`   ${match[1]}`)
              }
            }
          }
          
          // HTMLの一部を保存して確認
          if (urlInfo.name === '例のソレ 毎時総合' && ua.name === 'Googlebot') {
            const fs = await import('fs')
            fs.writeFileSync('reisore-html-sample.html', html.substring(0, 10000))
            console.log('\n💾 HTMLサンプルを保存しました')
          }
          
          // 成功したら次のURLへ
          if (rankings.length > 0) {
            break
          }
        } else if (response.status === 403) {
          console.log('❌ 403 Forbidden')
        } else if (response.status === 404) {
          console.log('❌ 404 Not Found')
        }
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }
}

testReiSoreHtmlMeta().catch(console.error)