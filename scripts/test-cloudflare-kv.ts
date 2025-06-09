import { getFromCloudflareKV } from '../lib/cloudflare-kv';
import { ungzip } from 'pako';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込む
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function testCloudflareKV() {
  console.log("Testing Cloudflare KV...");
  
  try {
    const compressed = await getFromCloudflareKV('RANKING_LATEST');
    
    if (!compressed) {
      console.log("No data found in Cloudflare KV");
      return;
    }
    
    // 解凍
    const decompressed = ungzip(new Uint8Array(compressed));
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decompressed);
    const snapshot = JSON.parse(jsonStr);
    
    console.log("Cloudflare KV data found:");
    console.log("- Timestamp:", snapshot.timestamp);
    console.log("- Version:", snapshot.version);
    console.log("- Genres:", Object.keys(snapshot.genres).length);
    
    // 各ジャンルのデータ数を確認
    for (const [genre, data] of Object.entries(snapshot.genres) as any) {
      console.log(`\n${genre}:`);
      if (data['24h']) {
        console.log(`  - 24h: ${data['24h'].items.length} items, ${data['24h'].popularTags?.length || 0} popular tags`);
      }
      if (data['hour']) {
        console.log(`  - hour: ${data['hour'].items.length} items, ${data['hour'].popularTags?.length || 0} popular tags`);
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testCloudflareKV();