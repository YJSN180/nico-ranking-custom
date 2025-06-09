import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function checkConvexHealth() {
  console.log("Checking Convex cron job health...");
  
  try {
    // Check if data exists and is recent
    const latestRanking = await client.query(api.ranking.getLatestRanking, {
      genre: "all",
      period: "24h"
    });
    
    if (!latestRanking) {
      console.error("❌ No ranking data found in Convex");
      process.exit(1);
    }
    
    const dataAge = Date.now() - new Date(latestRanking.timestamp).getTime();
    const maxAge = 20 * 60 * 1000; // 20 minutes (cron runs every 10 minutes)
    
    if (dataAge > maxAge) {
      console.error(`❌ Data is stale: ${Math.floor(dataAge / 60000)} minutes old`);
      console.error(`Last update: ${latestRanking.timestamp}`);
      process.exit(1);
    }
    
    console.log("✅ Convex cron job is healthy");
    console.log(`   Last update: ${latestRanking.timestamp} (${Math.floor(dataAge / 60000)} minutes ago)`);
    console.log(`   Items: ${latestRanking.items.length}`);
    console.log(`   Popular tags: ${latestRanking.popularTags.length}`);
    
  } catch (error) {
    console.error("❌ Failed to check Convex health:", error);
    process.exit(1);
  }
}

checkConvexHealth();