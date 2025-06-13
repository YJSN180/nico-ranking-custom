/**
 * 動画ページのwatch APIデータからタグを取得するテスト
 */

async function testWatchApiData() {
  console.log('=== Watch APIデータからのタグ取得テスト ===\n')
  
  const testVideoId = 'sm45081492'
  
  // 1. 動画ページのHTMLを取得
  const watchUrl = `https://www.nicovideo.jp/watch/${testVideoId}`
  console.log(`動画ページURL: ${watchUrl}`)
  
  try {
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    })
    
    console.log(`ステータス: ${response.status}`)
    
    if (response.ok) {
      const html = await response.text()
      
      // 1. data-api-dataを探す（新しい形式）
      const apiDataMatches = [
        /<div[^>]*data-api-data="([^"]+)"/,
        /<script[^>]*data-api-data="([^"]+)"/,
        /data-api-data=["']([^"']+)["']/
      ]
      
      for (const pattern of apiDataMatches) {
        const match = html.match(pattern)
        if (match) {
          console.log('\ndata-api-dataが見つかりました')
          try {
            const decoded = match[1]
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
            
            const data = JSON.parse(decoded)
            console.log('APIデータのキー:', Object.keys(data))
            
            // タグを探す
            findTags(data, '')
          } catch (e) {
            console.log('パースエラー:', e)
          }
          break
        }
      }
      
      // 2. nvAPIへの直接リクエストを探す
      const nvapiPattern = /fetch\(["']([^"']*nvapi[^"']+)["']/g
      let nvapiMatch
      const nvapiUrls = []
      
      while ((nvapiMatch = nvapiPattern.exec(html)) !== null) {
        nvapiUrls.push(nvapiMatch[1])
      }
      
      if (nvapiUrls.length > 0) {
        console.log('\n\nNVAPI URLが見つかりました:')
        nvapiUrls.forEach(url => console.log(`- ${url}`))
      }
      
      // 3. window.__INITIAL_DATA__を探す
      const initialDataMatch = html.match(/window\.__INITIAL_DATA__\s*=\s*({[^;]+});/)
      if (initialDataMatch) {
        console.log('\n\nwindow.__INITIAL_DATA__が見つかりました')
        try {
          const data = JSON.parse(initialDataMatch[1])
          console.log('データのキー:', Object.keys(data))
          findTags(data, '')
        } catch (e) {
          console.log('パースエラー:', e)
        }
      }
      
      // 4. タグリンクを直接探す
      const tagLinks = html.matchAll(/<a[^>]+href="\/tag\/([^"?]+)[^"]*"[^>]*>([^<]+)<\/a>/g)
      const tags = []
      
      for (const match of tagLinks) {
        const tagUrl = decodeURIComponent(match[1])
        const tagText = match[2].trim()
        if (!tags.some(t => t.url === tagUrl)) {
          tags.push({ url: tagUrl, text: tagText })
        }
      }
      
      if (tags.length > 0) {
        console.log('\n\nHTMLから抽出したタグ:')
        tags.forEach(tag => console.log(`- ${tag.text} (${tag.url})`))
      }
      
    } else if (response.status === 302 || response.status === 301) {
      console.log('リダイレクトされました')
      const location = response.headers.get('location')
      if (location) {
        console.log('リダイレクト先:', location)
      }
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// タグデータを再帰的に探す
function findTags(obj: any, path: string): void {
  if (!obj || typeof obj !== 'object') return
  
  for (const key in obj) {
    const newPath = path ? `${path}.${key}` : key
    
    if (key.toLowerCase().includes('tag')) {
      console.log(`\nタグ関連データ発見: ${newPath}`)
      console.log('値:', JSON.stringify(obj[key], null, 2).substring(0, 500))
    }
    
    if (obj[key] && typeof obj[key] === 'object') {
      findTags(obj[key], newPath)
    }
  }
}

// 実行
if (require.main === module) {
  testWatchApiData().catch(console.error)
}

export default testWatchApiData