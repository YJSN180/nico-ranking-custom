import { putToCloudflareKV } from '../lib/cloudflare-kv';
import { gzip } from 'pako';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// .env.localを読み込む
dotenv.config({ path: join(__dirname, '..', '.env.local') });

async function createTestData() {
  console.log("Creating test data for Cloudflare KV...");
  
  try {
    // テスト用のミニマルなデータを作成
    const testSnapshot = {
      timestamp: new Date().toISOString(),
      version: "1.0",
      genres: {
        all: {
          "24h": {
            items: [
              {
                rank: 1,
                id: "sm123456",
                title: "テスト動画1",
                thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/123456/123456",
                views: 10000,
                comments: 100,
                mylists: 50,
                likes: 200,
                tags: ["テスト", "動画"],
                authorId: "1234567",
                authorName: "テストユーザー",
                registeredAt: "2025-01-01T00:00:00Z"
              },
              {
                rank: 2,
                id: "sm234567",
                title: "テスト動画2",
                thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/234567/234567",
                views: 8000,
                comments: 80,
                mylists: 40,
                likes: 160,
                tags: ["テスト", "サンプル"],
                authorId: "2345678",
                authorName: "サンプルユーザー",
                registeredAt: "2025-01-02T00:00:00Z"
              }
            ],
            popularTags: ["テスト", "動画", "サンプル"]
          },
          "hour": {
            items: [],
            popularTags: []
          }
        }
      }
    };
    
    // gzip圧縮
    const compressed = gzip(JSON.stringify(testSnapshot));
    
    // Cloudflare KVに保存
    await putToCloudflareKV("RANKING_LATEST", compressed);
    
    console.log("✓ Test data created successfully");
    console.log("  - Size:", compressed.byteLength, "bytes");
    console.log("  - Key: RANKING_LATEST");
    
  } catch (error) {
    console.error("Error creating test data:", error);
  }
}

createTestData();