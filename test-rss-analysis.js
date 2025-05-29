// RSSフィードの詳細解析
const { XMLParser } = require('fast-xml-parser');

async function analyzeRSS() {
  console.log('=== RSS Feed Analysis ===');
  
  try {
    const response = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=24h&rss=2.0&lang=ja-jp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      }
    });
    
    const xmlText = await response.text();
    
    // XMLをパース
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_'
    });
    
    const result = parser.parse(xmlText);
    const items = result?.rss?.channel?.item || [];
    
    console.log(`Total items in RSS: ${items.length}`);
    
    // 最初の10件を表示
    console.log('\nFirst 10 items from RSS:');
    items.slice(0, 10).forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`);
      
      // 4位と5位を探す
      if (item.title.includes('Gundam') || item.title.includes('ジークソクス')) {
        console.log(`   ⭐ This is the missing 4th place video!`);
        console.log(`   Link: ${item.link}`);
        console.log(`   Description: ${item.description?.substring(0, 100)}...`);
      }
      if (item.title.includes('静電気') || item.title.includes('ドッキリ')) {
        console.log(`   ⭐ This is the missing 5th place video!`);
        console.log(`   Link: ${item.link}`);
        console.log(`   Description: ${item.description?.substring(0, 100)}...`);
      }
    });
    
    // APIレスポンスと比較
    console.log('\n=== Comparing RSS vs API ===');
    
    const apiResponse = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=24h', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'X-Frontend-Id': '6',
        'X-Frontend-Version': '0',
        'Referer': 'https://www.nicovideo.jp/',
      }
    });
    
    const apiData = await apiResponse.json();
    const apiItems = apiData.data?.items || [];
    
    console.log(`RSS items: ${items.length}`);
    console.log(`API items: ${apiItems.length}`);
    
    // RSSにあってAPIにないアイテムを探す
    const rssVideoIds = items.map(item => {
      const match = item.link?.match(/watch\/(sm\d+)/);
      return match ? match[1] : null;
    }).filter(Boolean);
    
    const apiVideoIds = apiItems.map(item => item.id);
    
    const missingInAPI = rssVideoIds.filter(id => !apiVideoIds.includes(id));
    
    console.log(`\nVideos in RSS but not in API: ${missingInAPI.length}`);
    if (missingInAPI.length > 0) {
      console.log('Missing video IDs:', missingInAPI.slice(0, 10));
      
      // 欠けている動画の詳細を取得
      console.log('\nDetails of missing videos:');
      for (let i = 0; i < Math.min(5, missingInAPI.length); i++) {
        const videoId = missingInAPI[i];
        const rssItem = items.find(item => item.link?.includes(videoId));
        if (rssItem) {
          console.log(`\n${videoId}: ${rssItem.title}`);
          
          // この動画の詳細をAPIで取得してみる
          try {
            const videoResponse = await fetch(`https://nvapi.nicovideo.jp/v1/video/${videoId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'X-Frontend-Id': '6',
                'X-Frontend-Version': '0',
                'Referer': `https://www.nicovideo.jp/watch/${videoId}`,
              }
            });
            
            if (videoResponse.ok) {
              const videoData = await videoResponse.json();
              if (videoData.data?.video) {
                console.log('  API access: OK');
                console.log('  isDeleted:', videoData.data.video.isDeleted);
                console.log('  registeredAt:', videoData.data.video.registeredAt);
                
                // すべてのプロパティを確認
                const allKeys = Object.keys(videoData.data.video);
                const restrictionKeys = allKeys.filter(key => 
                  key.toLowerCase().includes('restrict') ||
                  key.toLowerCase().includes('device') ||
                  key.toLowerCase().includes('sensitive') ||
                  key.toLowerCase().includes('rating')
                );
                if (restrictionKeys.length > 0) {
                  console.log('  Restriction-related fields:', restrictionKeys);
                }
              }
            } else {
              console.log(`  API access: Failed (${videoResponse.status})`);
            }
          } catch (error) {
            console.log('  API access: Error -', error.message);
          }
        }
      }
    }
    
  } catch (error) {
    console.error('RSS Analysis failed:', error);
  }
}

analyzeRSS();