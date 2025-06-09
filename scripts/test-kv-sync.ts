import { putToCloudflareKV, getFromCloudflareKV } from '../lib/cloudflare-kv';
import { gzip, ungzip } from 'pako';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function testKVSync() {
  console.log("Testing Cloudflare KV sync...\n");
  
  try {
    // Test 1: Write test data
    console.log("1. Writing test data to KV...");
    const testData = {
      timestamp: new Date().toISOString(),
      test: true,
      message: "Test sync from script"
    };
    
    const compressed = gzip(JSON.stringify(testData));
    await putToCloudflareKV('TEST_SYNC', compressed);
    console.log("✅ Write successful");
    
    // Test 2: Read back
    console.log("\n2. Reading test data from KV...");
    const retrieved = await getFromCloudflareKV('TEST_SYNC');
    const decompressed = ungzip(new Uint8Array(retrieved));
    const decoder = new TextDecoder();
    const result = JSON.parse(decoder.decode(decompressed));
    
    console.log("✅ Read successful:");
    console.log("   Timestamp:", result.timestamp);
    console.log("   Message:", result.message);
    
    // Test 3: Check main ranking data
    console.log("\n3. Checking main ranking data...");
    try {
      const mainData = await getFromCloudflareKV('RANKING_LATEST');
      if (mainData) {
        const mainDecompressed = ungzip(new Uint8Array(mainData));
        const mainResult = JSON.parse(decoder.decode(mainDecompressed));
        console.log("✅ Main ranking data exists:");
        console.log("   Last update:", mainResult.timestamp);
        console.log("   Version:", mainResult.version);
        
        const age = Date.now() - new Date(mainResult.timestamp).getTime();
        console.log("   Age:", Math.floor(age / 60000), "minutes");
      } else {
        console.log("❌ No main ranking data found");
      }
    } catch (error) {
      console.log("❌ Error reading main ranking data:", error);
    }
    
  } catch (error) {
    console.error("❌ KV sync test failed:", error);
    process.exit(1);
  }
}

testKVSync();