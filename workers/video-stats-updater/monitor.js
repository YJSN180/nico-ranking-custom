/**
 * Worker監視スクリプト
 * KVの統計データが正しく更新されているか確認
 */

import { parseArgs } from 'util';

// CLIオプションをパース
const { values } = parseArgs({
  options: {
    'account-id': {
      type: 'string',
      short: 'a',
    },
    'namespace-id': {
      type: 'string',
      short: 'n',
    },
    'api-token': {
      type: 'string',
      short: 't',
    },
  },
});

const CF_ACCOUNT_ID = values['account-id'] || process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_NAMESPACE_ID = values['namespace-id'] || '80f4535c379b4e8cb89ce6dbdb7d2dc9';
const CF_API_TOKEN = values['api-token'] || process.env.CLOUDFLARE_API_TOKEN;

if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('❌ Error: Missing required environment variables');
  console.error('Please set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
  process.exit(1);
}

async function checkVideoStats() {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/VIDEO_STATS_LATEST`;
  
  try {
    console.log('🔍 Fetching video stats from KV...');
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log('⚠️  No stats data found yet (Worker may not have run)');
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const statsData = await response.json();
    
    console.log('\n✅ Video Stats Found:');
    console.log(`- Last Updated: ${statsData.metadata?.updatedAt || 'Unknown'}`);
    console.log(`- Total Videos: ${statsData.metadata?.totalVideos || 0}`);
    console.log(`- Data Version: ${statsData.metadata?.version || 1}`);
    
    // 最新の5動画の統計を表示
    const videoIds = Object.keys(statsData.stats || {}).slice(0, 5);
    
    if (videoIds.length > 0) {
      console.log('\n📊 Sample Video Stats (latest 5):');
      videoIds.forEach(id => {
        const stat = statsData.stats[id];
        console.log(`  ${id}:`);
        console.log(`    - Views: ${stat.viewCounter || 0}`);
        console.log(`    - Comments: ${stat.commentCounter || 0}`);
        console.log(`    - Mylists: ${stat.mylistCounter || 0}`);
        console.log(`    - Likes: ${stat.likeCounter || 0}`);
      });
    }
    
    // 更新頻度をチェック
    if (statsData.metadata?.updatedAt) {
      const lastUpdate = new Date(statsData.metadata.updatedAt);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastUpdate) / (1000 * 60));
      
      console.log(`\n⏱️  Time since last update: ${diffMinutes} minutes`);
      
      if (diffMinutes > 5) {
        console.log('⚠️  Warning: Stats may be stale (expected update every 2 minutes)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error fetching stats:', error.message);
    process.exit(1);
  }
}

// 継続的な監視モード
if (process.argv.includes('--watch')) {
  console.log('👀 Monitoring mode enabled (checking every 2 minutes)...\n');
  
  // 初回チェック
  await checkVideoStats();
  
  // 2分ごとにチェック
  setInterval(async () => {
    console.log('\n' + '='.repeat(50) + '\n');
    await checkVideoStats();
  }, 2 * 60 * 1000);
} else {
  // 単発チェック
  await checkVideoStats();
}