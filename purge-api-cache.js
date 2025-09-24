const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_ID = process.env.CLOUDFLARE_ZONE_ID || '312190a58a066f607a92a4eacf8ba0a8';

async function purgeApiCache() {
  console.log('🧹 APIキャッシュをパージ中...\n');

  const urls = [
    'https://nico-rank.com/api/ranking',
    'https://nico-rank.com/api/ranking?genre=all',
    'https://nico-rank.com/api/ranking?genre=music',
    'https://nico-rank.com/api/ranking?genre=entertainment',
    'https://nico-rank.com/api/ranking?genre=anime',
    'https://nico-rank.com/api/ranking?genre=game',
    'https://nico-rank.com/api/ranking?genre=tech',
    'https://nico-rank.com/api/ranking?genre=dance',
    'https://nico-rank.com/api/ranking?genre=vocaloid',
    'https://nico-rank.com/api/ranking?genre=niconico_indie',
    'https://nico-rank.com/api/ranking?genre=animal',
    'https://nico-rank.com/api/ranking?genre=sports',
    'https://nico-rank.com/api/ranking?genre=cooking',
    'https://nico-rank.com/api/ranking?genre=nature',
    'https://nico-rank.com/api/ranking?genre=travel',
    'https://nico-rank.com/api/ranking?genre=car',
    'https://nico-rank.com/api/ranking?genre=society_politics_news',
    'https://nico-rank.com/api/ranking?genre=science_tech',
    'https://nico-rank.com/api/ranking?genre=commentary_lecture',
    'https://nico-rank.com/api/ranking?genre=other'
  ];

  // パターンベースのパージも試す
  const patterns = [
    '*nico-rank.com/api/*'
  ];

  // URLごとにパージ
  console.log('📍 URL個別パージ:');
  for (const url of urls) {
    const response = await fetch(
      'https://api.cloudflare.com/client/v4/zones/' + ZONE_ID + '/purge_cache',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + API_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: [url]
        })
      }
    );

    const data = await response.json();
    if (data.success) {
      console.log('  ✅ ' + url.replace('https://nico-rank.com', ''));
    } else {
      console.log('  ❌ ' + url.replace('https://nico-rank.com', '') + ' - ' + JSON.stringify(data.errors));
    }
  }

  console.log('\n🌐 パターンパージ:');
  // パターンベースのパージ
  for (const pattern of patterns) {
    const response = await fetch(
      'https://api.cloudflare.com/client/v4/zones/' + ZONE_ID + '/purge_cache',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + API_TOKEN,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: [],
          prefixes: [pattern]
        })
      }
    );

    const data = await response.json();
    if (data.success) {
      console.log('  ✅ ' + pattern);
    } else {
      console.log('  ❌ ' + pattern + ' - ' + JSON.stringify(data.errors));
    }
  }

  console.log('\n✨ キャッシュパージ完了！');
}

purgeApiCache();
