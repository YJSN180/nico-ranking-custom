/**
 * 動画詳細ページからタグを取得するテスト
 */

async function testVideoPageTags() {
  console.log('=== 動画詳細ページからのタグ取得テスト ===\n')
  
  const testVideoId = 'sm45081492' // 琴葉茜とユニティを自動化して無限にガチャを引くゲーム
  const videoUrl = `https://www.nicovideo.jp/watch/${testVideoId}`
  
  console.log(`テスト動画: ${testVideoId}`)
  console.log(`URL: ${videoUrl}`)
  
  try {
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    console.log(`\nステータス: ${response.status}`)
    
    if (response.ok) {
      const html = await response.text()
      
      // 1. data-api-dataからタグを抽出
      const apiDataMatch = html.match(/<div[^>]*id="js-initial-watch-data"[^>]*data-api-data="([^"]+)"/);
      if (apiDataMatch) {
        console.log('\n1. data-api-dataからのタグ抽出:')
        try {
          const encodedData = apiDataMatch[1]
          const decodedData = encodedData
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#39;/g, "'")
          
          const apiData = JSON.parse(decodedData)
          
          // タグ情報を探す
          if (apiData.tags) {
            console.log('タグ配列:', apiData.tags)
          }
          
          if (apiData.video?.tags) {
            console.log('video.tags:', apiData.video.tags)
          }
          
          if (apiData.tag) {
            console.log('tag:', apiData.tag)
          }
          
          // 他の可能性のある場所も探す
          console.log('\nAPIデータのキー:', Object.keys(apiData))
          
        } catch (error) {
          console.log('パースエラー:', error)
        }
      } else {
        console.log('data-api-dataが見つかりません')
      }
      
      // 2. ld+jsonからタグを抽出
      const ldJsonMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
      if (ldJsonMatch) {
        console.log('\n2. ld+jsonからのタグ抽出:')
        try {
          const ldJson = JSON.parse(ldJsonMatch[1])
          if (ldJson.keywords) {
            console.log('keywords:', ldJson.keywords)
          }
          if (ldJson.genre) {
            console.log('genre:', ldJson.genre)
          }
        } catch (error) {
          console.log('パースエラー:', error)
        }
      }
      
      // 3. タグリンクを直接探す
      console.log('\n3. HTMLタグリンクからの抽出:')
      const tagLinkPattern = /<a[^>]+href="\/tag\/([^"?]+)[^"]*"[^>]*>([^<]+)<\/a>/g
      const tags = []
      let tagMatch
      
      while ((tagMatch = tagLinkPattern.exec(html)) !== null) {
        const tagUrl = decodeURIComponent(tagMatch[1]).replace(/\+/g, ' ')
        const tagText = tagMatch[2].trim()
        if (!tags.some(t => t.url === tagUrl)) {
          tags.push({ url: tagUrl, text: tagText })
        }
      }
      
      if (tags.length > 0) {
        console.log(`見つかったタグ数: ${tags.length}`)
        tags.slice(0, 10).forEach(tag => {
          console.log(`- ${tag.text} (${tag.url})`)
        })
      } else {
        console.log('タグリンクが見つかりません')
      }
      
      // 4. HTMLの一部を出力して確認
      const tagAreaMatch = html.match(/<div[^>]*class="[^"]*TagList[^"]*"[^>]*>[\s\S]{0,1000}/);
      if (tagAreaMatch) {
        console.log('\n4. タグエリアのHTML（最初の1000文字）:')
        console.log(tagAreaMatch[0])
      }
      
    } else {
      console.log('動画ページの取得に失敗しました')
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 実行
if (require.main === module) {
  testVideoPageTags().catch(console.error)
}

export default testVideoPageTags