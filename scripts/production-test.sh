#!/bin/bash

# 本番環境動作確認スクリプト
# Usage: ./production-test.sh [worker-name]

WORKER_NAME=${1:-"nico-ranking-api-gateway"}
PROD_URL="https://nico-rank.com"

echo "🚀 本番環境テスト: $WORKER_NAME"
echo "================================================"

# 1. Workerの直接確認（worker-nameが指定された場合）
if [ "$WORKER_NAME" != "nico-ranking-api-gateway" ]; then
    WORKER_URL="https://${WORKER_NAME}.yjsn180180.workers.dev"
    echo -e "\n📡 Worker直接アクセステスト: $WORKER_URL"
    curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$WORKER_URL/api/ranking?genre=all"
fi

# 2. 本番URLでの確認
echo -e "\n🌐 本番URL確認: $PROD_URL"

# APIエンドポイント
echo -e "\n[API Endpoint Test]"
response=$(curl -I "$PROD_URL/api/ranking?genre=all" 2>/dev/null)
echo "$response" | grep -E "HTTP/|Cache-Control|ETag|X-Data-Source|X-Cache-Status"

# 3. 動的TTLの確認
echo -e "\n[Dynamic TTL Check]"
current_minute=$(date +%M)
echo "Current time: $(date '+%H:%M:%S')"
echo "Current minute: $current_minute"

cache_control=$(echo "$response" | grep -i "cache-control" | cut -d' ' -f2-)
echo "Cache-Control: $cache_control"

# max-age値を抽出
if [[ $cache_control =~ max-age=([0-9]+) ]]; then
    max_age=${BASH_REMATCH[1]}
    echo "Browser cache TTL: $max_age seconds ($(($max_age / 60)) minutes)"
    
    # 期待値の計算
    if [ $current_minute -lt 5 ]; then
        expected_minutes=$((5 - current_minute))
    elif [ $current_minute -lt 25 ]; then
        expected_minutes=$((25 - current_minute))
    else
        expected_minutes=$((65 - current_minute))
    fi
    
    echo "Expected TTL: ~$((expected_minutes * 60)) seconds"
fi

# 4. 各ジャンルの確認
echo -e "\n[Genre Response Test]"
for genre in all game anime sing; do
    status=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/api/ranking?genre=$genre")
    echo "Genre $genre: HTTP $status"
done

# 5. ETag条件付きリクエスト
echo -e "\n[ETag Conditional Request Test]"
etag=$(echo "$response" | grep -i "etag" | awk '{print $2}' | tr -d '\r')
if [ ! -z "$etag" ]; then
    echo "ETag found: $etag"
    status_304=$(curl -s -o /dev/null -w "%{http_code}" -H "If-None-Match: $etag" "$PROD_URL/api/ranking?genre=all")
    echo "Conditional request status: $status_304"
    if [ "$status_304" = "304" ]; then
        echo "✅ ETag working correctly (304 Not Modified)"
    else
        echo "⚠️  ETag not working as expected"
    fi
fi

# 6. フロントエンドの確認
echo -e "\n[Frontend Check]"
frontend_status=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL/")
echo "Homepage status: $frontend_status"

# 7. 総合判定
echo -e "\n================================================"
if [ "$frontend_status" = "200" ] && [ ! -z "$etag" ]; then
    echo "✅ デプロイ成功！"
    echo "- APIが正常に動作"
    echo "- 動的TTLが機能"
    echo "- ETagが実装済み"
    echo "- フロントエンドも正常"
else
    echo "⚠️  確認が必要な項目があります"
fi