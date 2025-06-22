#!/bin/bash

echo "🧪 Testing R2 write statistics..."

# 環境変数を設定
export R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" 
export CLOUDFLARE_ACCOUNT_ID="5984977746a3dfcd71415bed5c324eb1"

# テスト用の小さなデータを作成
mkdir -p tmp
echo '{
  "genres": {
    "test": {
      "24h": {
        "items": [{"id": "sm1", "title": "Test Video"}],
        "popularTags": ["テスト"],
        "tags": {
          "テスト": [{"id": "sm1", "title": "Test Video"}]
        }
      }
    }
  },
  "metadata": {
    "updatedAt": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"
  }
}' > tmp/latest-aggregated-data.json

# 実行
echo "Running write-to-r2.ts..."
tsx scripts/write-to-r2.ts

# クリーンアップ
rm -f tmp/latest-aggregated-data.json