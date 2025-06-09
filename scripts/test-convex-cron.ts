import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込む
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

async function testCronJob() {
  console.log("Testing Convex cron job...");
  
  try {
    // cron jobは内部関数なので、直接実行はできません
    // 代わりに最新のランキングデータがあるかチェック
    const latestRanking = await client.query(api.ranking.getLatestRanking, {
      genre: "all",
      period: "24h"
    });
    
    if (latestRanking) {
      console.log("Latest ranking found:", {
        genre: "all",
        period: "24h",
        itemCount: latestRanking.items.length,
        timestamp: latestRanking.timestamp
      });
    } else {
      console.log("No ranking data found. Cron job needs to run first.");
      console.log("Please wait for the cron job to run (every 10 minutes) or trigger it manually from Convex Dashboard.");
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

testCronJob();