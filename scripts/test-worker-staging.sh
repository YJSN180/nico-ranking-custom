#!/bin/bash

# Cloudflare Workers ステージング環境テストスクリプト
# 使用方法: ./scripts/test-worker-staging.sh [WORKER_URL]

WORKER_URL=${1:-"https://nico-ranking-dynamic-cache-staging.your-subdomain.workers.dev"}

echo "🚀 Cloudflare Workers ステージング環境テスト"
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

# 2. 本番相当の負荷テスト
echo -e "\n2. 負荷テスト (10並列, 30秒)..."
for i in {1..10}; do
    (
        for j in {1..30}; do
            curl -s "$WORKER_URL/api/ranking?genre=all&period=24h" > /dev/null
            sleep 1
        done
    ) &
done
wait
echo "✅ 負荷テスト完了"

# 3. キャッシュ効率テスト
echo -e "\n3. キャッシュ効率テスト..."
CACHE_HIT_COUNT=0
TOTAL_REQUESTS=10

for i in $(seq 1 $TOTAL_REQUESTS); do
    CACHE_STATUS=$(curl -sI "$WORKER_URL/api/ranking?genre=all" | grep -i "x-cache-status" | cut -d' ' -f2- | tr -d '\r\n')
    if [[ "$CACHE_STATUS" == *"HIT"* ]]; then
        CACHE_HIT_COUNT=$((CACHE_HIT_COUNT + 1))
    fi
    sleep 1
done

CACHE_HIT_RATE=$(echo "scale=1; $CACHE_HIT_COUNT * 100 / $TOTAL_REQUESTS" | bc)
echo "キャッシュヒット率: ${CACHE_HIT_RATE}%"

if [ $(echo "$CACHE_HIT_RATE >= 70" | bc) -eq 1 ]; then
    echo "✅ キャッシュ効率良好"
else
    echo "⚠️  キャッシュ効率要改善"
fi

# 4. データ一貫性確認
echo -e "\n4. データ一貫性確認..."
RESPONSE1=$(curl -s "$WORKER_URL/api/ranking?genre=all&period=24h")
sleep 5
RESPONSE2=$(curl -s "$WORKER_URL/api/ranking?genre=all&period=24h")

if [ "$RESPONSE1" = "$RESPONSE2" ]; then
    echo "✅ データ一貫性OK"
else
    echo "⚠️  データに差異あり（TTL内での更新の可能性）"
fi

echo -e "\n🎉 ステージングテスト完了!"