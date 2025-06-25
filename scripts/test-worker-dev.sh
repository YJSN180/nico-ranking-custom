#!/bin/bash

# Cloudflare Workers 開発環境テストスクリプト
# 使用方法: ./scripts/test-worker-dev.sh [WORKER_URL]

WORKER_URL=${1:-"https://nico-ranking-dynamic-cache-dev.your-subdomain.workers.dev"}

echo "🧪 Cloudflare Workers 開発環境テスト"
echo "Target: $WORKER_URL"
echo "======================================="

# 1. 基本的な接続確認
echo "1. 基本接続確認..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$WORKER_URL/")
if [ "$STATUS" -eq 200 ] || [ "$STATUS" -eq 302 ]; then
    echo "✅ Worker is responding (Status: $STATUS)"
else
    echo "❌ Worker not responding (Status: $STATUS)"
    exit 1
fi

# 2. API エンドポイント確認
echo -e "\n2. API エンドポイント確認..."
API_RESPONSE=$(curl -s "$WORKER_URL/api/ranking?genre=all&period=24h")
if echo "$API_RESPONSE" | jq . > /dev/null 2>&1; then
    ITEM_COUNT=$(echo "$API_RESPONSE" | jq '.items | length')
    echo "✅ API endpoint working (Items: $ITEM_COUNT)"
else
    echo "❌ API endpoint failed"
    echo "Response: $API_RESPONSE"
fi

# 3. Cache-Control ヘッダー確認
echo -e "\n3. Cache-Control 確認..."
CACHE_CONTROL=$(curl -sI "$WORKER_URL/api/ranking?genre=all" | grep -i "cache-control" | cut -d' ' -f2-)
if [[ "$CACHE_CONTROL" == *"max-age"* ]]; then
    echo "✅ Dynamic TTL working: $CACHE_CONTROL"
else
    echo "❌ Cache-Control header missing or invalid"
fi

# 4. ETag 確認
echo -e "\n4. ETag 確認..."
ETAG=$(curl -sI "$WORKER_URL/api/ranking?genre=all" | grep -i "etag" | cut -d' ' -f2- | tr -d '\r\n')
if [ ! -z "$ETAG" ]; then
    echo "✅ ETag present: $ETAG"
    
    # 5. 条件付きリクエスト確認
    echo -e "\n5. 条件付きリクエスト確認..."
    CONDITIONAL_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $ETAG" "$WORKER_URL/api/ranking?genre=all")
    if [ "$CONDITIONAL_STATUS" -eq 304 ]; then
        echo "✅ Conditional request working (304 Not Modified)"
    else
        echo "❌ Conditional request failed (Status: $CONDITIONAL_STATUS)"
    fi
else
    echo "❌ ETag header missing"
fi

# 6. データソース確認
echo -e "\n6. データソース確認..."
DATA_SOURCE=$(curl -sI "$WORKER_URL/api/ranking?genre=all" | grep -i "x-data-source" | cut -d' ' -f2- | tr -d '\r\n')
if [ ! -z "$DATA_SOURCE" ]; then
    echo "✅ Data source: $DATA_SOURCE"
else
    echo "⚠️  Data source header missing"
fi

# 7. レスポンス時間測定
echo -e "\n7. レスポンス時間測定..."
for i in {1..3}; do
    TIME=$(curl -s -w "%{time_total}" -o /dev/null "$WORKER_URL/api/ranking?genre=all")
    echo "Request $i: ${TIME}s"
done

# 8. 圧縮確認
echo -e "\n8. 圧縮対応確認..."
COMPRESSION=$(curl -sI -H "Accept-Encoding: gzip" "$WORKER_URL/api/ranking?genre=all" | grep -i "content-encoding")
if [[ "$COMPRESSION" == *"gzip"* ]]; then
    echo "✅ Compression working: $COMPRESSION"
else
    echo "ℹ️  No compression (may be normal for small responses)"
fi

echo -e "\n🎉 テスト完了!"