// ブラウザの動作をシミュレート
async function testBrowserSimulation() {
  console.log('=== Browser Simulation Test ===');
  
  // 実際のブラウザが送信する完全なヘッダーセット
  const browserHeaders = {
    'Host': 'nvapi.nicovideo.jp',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.nicovideo.jp/',
    'Origin': 'https://www.nicovideo.jp',
    'X-Frontend-Id': '6',
    'X-Frontend-Version': '0',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
  };
  
  // デバイス制限を回避する可能性のあるパラメータ
  const testParams = [
    '', // 基本
    '_sensitiveContent=1',
    '_contentAuth=1',
    '_deviceRestriction=0',
    'actionTrackId=1234567890_1234567890123', // セッションIDのような値
  ];
  
  for (const param of testParams) {
    const url = `https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=24h${param ? '&' + param : ''}`;
    console.log(`\nTesting: ${param || 'base URL'}`);
    
    try {
      const response = await fetch(url, { headers: browserHeaders });
      const data = await response.json();
      
      if (data.meta?.status === 200) {
        const items = data.data?.items || [];
        console.log(`  Items: ${items.length}`);
        
        // 4位と5位を探す
        const hasGundam = items.some(item => 
          item.title.includes('Gundam') || item.title.includes('ジークソクス')
        );
        const hasStaticElectricity = items.some(item => 
          item.title.includes('静電気') || item.title.includes('ドッキリ')
        );
        
        if (hasGundam || hasStaticElectricity) {
          console.log('  ⭐ Found missing videos!');
          console.log('  Gundam:', hasGundam ? 'Yes' : 'No');
          console.log('  Static electricity:', hasStaticElectricity ? 'Yes' : 'No');
        }
      } else {
        console.log(`  Status: ${data.meta?.status}`);
      }
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  // スマホアプリのAPIエンドポイントをテスト
  console.log('\n=== Testing Mobile App Endpoints ===');
  
  const mobileEndpoints = [
    'https://api.ce.nicovideo.jp/api/v1/ranking/genre/other?term=24h',
    'https://api.nicovideo.jp/v1/ranking/genre/other?term=24h',
    'https://app.nicovideo.jp/v1/ranking/genre/other?term=24h',
  ];
  
  for (const endpoint of mobileEndpoints) {
    console.log(`\nTesting: ${endpoint}`);
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'niconico/1.0 CFNetwork/1408.0.4 Darwin/22.5.0',
          'Accept': 'application/json',
          'X-Nicovideo-Connection': 'wifi',
          'X-Os-Version': '16.5.1',
        }
      });
      console.log(`  Status: ${response.status}`);
    } catch (error) {
      console.log(`  Error: ${error.message}`);
    }
  }
  
  // RSS フィードも確認
  console.log('\n=== Testing RSS Feed ===');
  try {
    const rssResponse = await fetch('https://www.nicovideo.jp/ranking/genre/other?term=24h&rss=2.0&lang=ja-jp', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      }
    });
    
    console.log('RSS Status:', rssResponse.status);
    if (rssResponse.ok) {
      const rssText = await rssResponse.text();
      const hasGundam = rssText.includes('Gundam') || rssText.includes('ジークソクス');
      const hasStatic = rssText.includes('静電気') || rssText.includes('ドッキリ');
      
      console.log('RSS contains Gundam video:', hasGundam);
      console.log('RSS contains static electricity video:', hasStatic);
      
      if (hasGundam || hasStatic) {
        console.log('\n⭐ RSS feed includes the missing videos!');
      }
    }
  } catch (error) {
    console.log('RSS Error:', error.message);
  }
}

testBrowserSimulation();