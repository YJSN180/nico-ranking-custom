import { NextRequest } from 'next/server';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込む
dotenv.config({ path: join(__dirname, '..', '.env.local') });

// APIルートを直接インポート
import { GET as getRanking } from '../app/api/ranking/route';
import { GET as getSnapshot } from '../app/api/snapshot/route';

async function testAPIs() {
  console.log("Testing API endpoints...\n");
  
  // 1. /api/snapshot をテスト
  console.log("1. Testing /api/snapshot");
  try {
    const snapshotReq = new NextRequest('http://localhost:3000/api/snapshot');
    const snapshotRes = await getSnapshot(snapshotReq);
    
    if (snapshotRes.status === 200) {
      const data = await snapshotRes.json();
      console.log("✓ Snapshot API working");
      console.log("  - Timestamp:", data.timestamp);
      console.log("  - Version:", data.version);
      console.log("  - Genres:", Object.keys(data.genres || {}).length);
    } else {
      console.log("✗ Snapshot API failed:", snapshotRes.status);
      const error = await snapshotRes.json();
      console.log("  Error:", error);
    }
  } catch (error) {
    console.log("✗ Snapshot API error:", error);
  }
  
  console.log("\n2. Testing /api/ranking");
  // 2. /api/ranking をテスト
  try {
    const rankingReq = new NextRequest('http://localhost:3000/api/ranking?genre=all&period=24h');
    const rankingRes = await getRanking(rankingReq);
    
    if (rankingRes.status === 200) {
      const data = await rankingRes.json();
      console.log("✓ Ranking API working");
      console.log("  - Items:", data.items?.length || 0);
      console.log("  - Popular tags:", data.popularTags?.length || 0);
      console.log("  - Has more:", data.hasMore);
      
      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        console.log("  - First item:", {
          rank: item.rank,
          title: item.title.substring(0, 30) + "...",
          views: item.views
        });
      }
    } else {
      console.log("✗ Ranking API failed:", rankingRes.status);
      const error = await rankingRes.json();
      console.log("  Error:", error);
    }
  } catch (error) {
    console.log("✗ Ranking API error:", error);
  }
  
  console.log("\n3. Testing /api/ranking with tag filter");
  // 3. タグフィルタリングをテスト
  try {
    const tagReq = new NextRequest('http://localhost:3000/api/ranking?genre=game&period=24h&tag=ゲーム');
    const tagRes = await getRanking(tagReq);
    
    if (tagRes.status === 200) {
      const data = await tagRes.json();
      console.log("✓ Tag filtering working");
      console.log("  - Items:", data.items?.length || 0);
      console.log("  - Total items:", data.totalItems);
    } else {
      console.log("✗ Tag filtering failed:", tagRes.status);
    }
  } catch (error) {
    console.log("✗ Tag filtering error:", error);
  }
}

testAPIs();