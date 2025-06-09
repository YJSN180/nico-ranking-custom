import { getFromCloudflareKV } from '../lib/cloudflare-kv';
import { ungzip } from 'pako';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function checkKVFreshness() {
  console.log("Checking Cloudflare KV data freshness...");
  
  try {
    const compressed = await getFromCloudflareKV('RANKING_LATEST');
    
    if (!compressed) {
      console.error("❌ No data found in Cloudflare KV");
      process.exit(1);
    }
    
    // Decompress and parse
    const decompressed = ungzip(new Uint8Array(compressed));
    const decoder = new TextDecoder();
    const jsonStr = decoder.decode(decompressed);
    const snapshot = JSON.parse(jsonStr);
    
    if (!snapshot.timestamp) {
      console.error("❌ No timestamp in snapshot data");
      process.exit(1);
    }
    
    const dataAge = Date.now() - new Date(snapshot.timestamp).getTime();
    const maxAge = 20 * 60 * 1000; // 20 minutes
    
    if (dataAge > maxAge) {
      console.error(`❌ KV data is stale: ${Math.floor(dataAge / 60000)} minutes old`);
      console.error(`Last update: ${snapshot.timestamp}`);
      process.exit(1);
    }
    
    console.log("✅ Cloudflare KV data is fresh");
    console.log(`   Last update: ${snapshot.timestamp} (${Math.floor(dataAge / 60000)} minutes ago)`);
    console.log(`   Version: ${snapshot.version}`);
    console.log(`   Genres: ${Object.keys(snapshot.genres || {}).length}`);
    
    // Check data completeness
    const expectedGenres = 23;
    const actualGenres = Object.keys(snapshot.genres || {}).length;
    
    if (actualGenres < expectedGenres) {
      console.warn(`⚠️  Warning: Only ${actualGenres} genres found (expected ${expectedGenres})`);
    }
    
  } catch (error) {
    console.error("❌ Failed to check KV freshness:", error);
    process.exit(1);
  }
}

checkKVFreshness();