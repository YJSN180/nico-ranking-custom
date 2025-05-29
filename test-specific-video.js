// 特定の動画（実際の4位）を調査
async function testSpecificVideo() {
  // ニコニコ公式の4位の動画IDを特定するため、まず公式サイトのランキングAPIを調べる
  console.log('=== Testing Official Ranking API ===');
  
  // 公式サイトが使用している可能性のあるエンドポイント
  const endpoints = [
    'https://www.nicovideo.jp/api/v2/ranking/genre/other?term=24h',
    'https://nvapi.nicovideo.jp/v2/ranking/genre/other?term=24h',
    'https://nvcomment.nicovideo.jp/v1/ranking/genre/other?term=24h',
    'https://public.api.nicovideo.jp/v1/ranking/genre/other?term=24h',
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.nicovideo.jp/',
        }
      });
      
      console.log(`\n${endpoint}:`);
      console.log(`Status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response structure:', Object.keys(data));
      }
    } catch (error) {
      console.log(`Failed: ${error.message}`);
    }
  }
  
  // センシティブフラグを含む詳細情報を取得する試み
  console.log('\n=== Testing Video Details API ===');
  
  // 仮に4位の動画IDがわかっている場合のテスト
  const testVideoIds = ['sm45021696', 'sm45029566']; // 現在の3位と5位
  
  for (const videoId of testVideoIds) {
    try {
      const response = await fetch(`https://nvapi.nicovideo.jp/v1/video/${videoId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'Referer': `https://www.nicovideo.jp/watch/${videoId}`,
        }
      });
      
      const data = await response.json();
      console.log(`\n${videoId}:`);
      console.log('Status:', data.meta?.status);
      
      if (data.data?.video) {
        const video = data.data.video;
        console.log('Title:', video.title);
        console.log('isDeleted:', video.isDeleted);
        console.log('isPrivate:', video.isPrivate);
        console.log('isOfficial:', video.isOfficial);
        console.log('isMemberOnly:', video.isMemberOnly);
        console.log('isChannelMemberOnly:', video.isChannelMemberOnly);
        
        // センシティブ関連のフィールドを探す
        const sensitiveFields = Object.keys(video).filter(key => 
          key.toLowerCase().includes('sensitive') || 
          key.toLowerCase().includes('restrict') ||
          key.toLowerCase().includes('adult') ||
          key.toLowerCase().includes('rating') ||
          key.toLowerCase().includes('device')
        );
        
        if (sensitiveFields.length > 0) {
          console.log('Sensitive-related fields:', sensitiveFields);
          sensitiveFields.forEach(field => {
            console.log(`  ${field}:`, video[field]);
          });
        }
      }
    } catch (error) {
      console.log(`${videoId}: Failed - ${error.message}`);
    }
  }
  
  // PCとモバイルで異なるAPIを使用している可能性
  console.log('\n=== Testing Mobile API ===');
  
  try {
    const response = await fetch('https://nvapi.nicovideo.jp/v1/ranking/genre/other?term=24h', {
      headers: {
        'User-Agent': 'niconicoapp/1.0 (iOS 16.0; iPhone13,2)',
        'Accept': 'application/json',
        'X-Frontend-Id': '10', // モバイルアプリのID
        'X-Frontend-Version': '0',
        'X-Nicovideo-Language': 'ja-jp',
        'X-Request-With': 'niconicoapp',
      }
    });
    
    const data = await response.json();
    console.log('Mobile API items:', data.data?.items?.length);
    
    if (data.data?.items?.length > 0) {
      console.log('First 5 items:');
      data.data.items.slice(0, 5).forEach((item, i) => {
        console.log(`${i+1}. ${item.title} (${item.id})`);
      });
    }
  } catch (error) {
    console.log('Mobile API failed:', error.message);
  }
}

testSpecificVideo();