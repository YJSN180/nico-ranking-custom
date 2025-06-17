#!/usr/bin/env npx tsx
import 'dotenv/config'

// Check KV usage and write statistics
async function checkKVUsage() {
  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
  const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN;

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    throw new Error("Cloudflare KV credentials not configured");
  }

  try {
    // Get account analytics
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const analyticsUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/analytics`;
    
    console.log('Fetching KV usage analytics...\n');
    
    const response = await fetch(analyticsUrl, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`Failed to fetch analytics: ${response.status} - ${error}`);
      
      // Try to get namespace details instead
      const namespaceUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}`;
      const nsResponse = await fetch(namespaceUrl, {
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
        },
      });
      
      if (nsResponse.ok) {
        const nsData = await nsResponse.json();
        console.log('Namespace details:', nsData);
      }
      
      // List recent keys
      console.log('\nListing recent keys in KV...');
      const listUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/keys?limit=100`;
      const listResponse = await fetch(listUrl, {
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
        },
      });
      
      if (listResponse.ok) {
        const listData = await listResponse.json();
        console.log(`Total keys: ${listData.result_info?.count || 'unknown'}`);
        console.log('\nRecent keys:');
        listData.result?.slice(0, 20).forEach((key: any) => {
          console.log(`- ${key.name}`);
        });
      }
      
      return;
    }

    const data = await response.json();
    console.log('KV Usage Analytics:', JSON.stringify(data, null, 2));
    
  } catch (error) {
    console.error('Error checking KV usage:', error);
  }
}

// Check recent write activity
async function checkRecentWrites() {
  console.log('\n--- Checking Recent Write Activity ---\n');
  
  // Calculate write frequency based on current setup
  const genresCount = 23;
  const periodsCount = 2; // 24h and hour
  const maxTagsPerGenre = 5; // After our fix
  const tagPeriodCombos = maxTagsPerGenre * periodsCount; // 10 tag writes per genre
  
  const totalWritesPerRun = 1; // Just RANKING_LATEST now
  const runsPerDay = 24; // After reducing to hourly
  const totalWritesPerDay = totalWritesPerRun * runsPerDay;
  
  console.log('Expected KV writes with current configuration:');
  console.log(`- Genres: ${genresCount}`);
  console.log(`- Periods per genre: ${periodsCount}`);
  console.log(`- Max tags per genre: ${maxTagsPerGenre} (limited)`);
  console.log(`- Total data points per run: ${genresCount * periodsCount} main + ${genresCount * tagPeriodCombos} tag rankings`);
  console.log(`- KV writes per run: ${totalWritesPerRun} (single aggregated write)`);
  console.log(`- Runs per day (hourly): ${runsPerDay}`);
  console.log(`- Total KV writes per day: ${totalWritesPerDay}`);
  console.log('\nCloudflare KV Free Tier Limits:');
  console.log('- 1,000 write operations per day');
  console.log('- 100,000 read operations per day');
  console.log(`\nCurrent usage: ${totalWritesPerDay}/1000 writes per day (${(totalWritesPerDay/1000*100).toFixed(1)}%)`);
  
  if (totalWritesPerDay > 1000) {
    console.log('\n⚠️  WARNING: Current configuration exceeds free tier write limit!');
  } else {
    console.log('\n✅ Current configuration is within free tier limits');
  }
}

async function main() {
  await checkKVUsage();
  await checkRecentWrites();
}

if (require.main === module) {
  main();
}