import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // 実験的機能を有効化
  experimental: {
    // Node.js runtimeを使用（APIルートで必要）
    runtime: "nodejs"
  },
  
  // キャッシュ設定
  cache: {
    // 既存のR2バケットを利用
    provider: "cloudflare-r2",
    r2: {
      bucketName: "nico-ranking"
    }
  },
  
  // 既存のCloudflare KV/R2バインディングを継続利用
  bindings: {
    kv: {
      RANKING_DATA: "RANKING_DATA"
    },
    r2: {
      R2_BUCKET: "R2_BUCKET"
    }
  }
});