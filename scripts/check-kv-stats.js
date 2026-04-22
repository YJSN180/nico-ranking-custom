#!/usr/bin/env node
import fetch from 'node-fetch';

const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const KV_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

const STATS_KEY = 'VIDEO_STATS_LATEST';

if (!CLOUDFLARE_ACCOUNT_ID || !KV_NAMESPACE_ID || !API_TOKEN) {
  console.error('Missing required environment variables:');
  console.error(`- CLOUDFLARE_ACCOUNT_ID: ${Boolean(CLOUDFLARE_ACCOUNT_ID)}`);
  console.error(`- CLOUDFLARE_KV_NAMESPACE_ID: ${Boolean(KV_NAMESPACE_ID)}`);
  console.error(`- CLOUDFLARE_API_TOKEN: ${Boolean(API_TOKEN)}`);
  process.exit(1);
}

async function checkKVStats() {
  console.log('🔍 Checking KV stats...\n');

  try {
    // Get the value from KV
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${STATS_KEY}`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log('❌ No stats found in KV (key does not exist)');
        return;
      }
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const statsData = await response.json();

    console.log('📊 Stats found in KV:');
    console.log(`- Version: ${statsData.metadata?.version}`);
    console.log(`- Updated at: ${statsData.metadata?.updatedAt}`);
    console.log(`- Total videos: ${statsData.metadata?.totalVideos}`);

    // Check how old the data is
    if (statsData.metadata?.updatedAt) {
      const updatedAt = new Date(statsData.metadata.updatedAt);
      const now = new Date();
      const diffMinutes = Math.floor((now - updatedAt) / 1000 / 60);
      console.log(`- Age: ${diffMinutes} minutes`);

      if (diffMinutes > 5) {
        console.log('⚠️  Warning: Stats are older than 5 minutes!');
      }
    }

    // Show sample stats
    if (statsData.stats && typeof statsData.stats === 'object') {
      const videoIds = Object.keys(statsData.stats);
      console.log(`\n📹 Sample video stats (first 3 of ${videoIds.length}):`);

      videoIds.slice(0, 3).forEach(videoId => {
        const stats = statsData.stats[videoId];
        console.log(`\n- ${videoId}:`);
        console.log(`  Views: ${stats.viewCounter}`);
        console.log(`  Comments: ${stats.commentCounter}`);
        console.log(`  Mylists: ${stats.mylistCounter}`);
        console.log(`  Likes: ${stats.likeCounter}`);
      });
    }

    // Check data structure
    console.log('\n🔍 Data structure check:');
    console.log(`- Has stats object: ${!!statsData.stats}`);
    console.log(`- Has metadata: ${!!statsData.metadata}`);
    console.log(`- Stats is object: ${typeof statsData.stats === 'object'}`);
    console.log(`- Video count matches: ${Object.keys(statsData.stats || {}).length === statsData.metadata?.totalVideos}`);

  } catch (error) {
    console.error('❌ Error checking KV stats:', error);
  }
}

// Also check KV keys list
async function listKVKeys() {
  console.log('\n\n📋 Listing all KV keys...\n');

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/keys`;

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.result && data.result.length > 0) {
      console.log(`Found ${data.result.length} keys:`);
      data.result.forEach(key => {
        console.log(`- ${key.name}`);
      });
    } else {
      console.log('No keys found in KV namespace');
    }

  } catch (error) {
    console.error('❌ Error listing KV keys:', error);
  }
}

async function main() {
  await checkKVStats();
  await listKVKeys();
}

main();
