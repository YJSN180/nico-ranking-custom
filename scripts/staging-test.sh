#!/bin/bash

# ステージング環境テストスクリプト
# 動的キャッシュWorkerの動作確認

STAGING_URL="https://nico-ranking-dynamic-cache-dev.yjsn180180.workers.dev"
echo "🧪 ステージング環境テスト開始: $STAGING_URL"
echo "================================================"

# 1. 基本的な疎通確認
echo -e "\n1️⃣ 基本的な疎通確認"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$STAGING_URL/api/ranking?genre=all"

# 2. 動的TTLの確認
echo -e "\n2️⃣ 動的TTLヘッダーの確認"
curl -I "$STAGING_URL/api/ranking?genre=all" 2>/dev/null | grep -i "cache-control\|x-next-update\|x-seconds-until-update"

# 3. ETagの動作確認
echo -e "\n3️⃣ ETag取得"
ETAG=$(curl -I "$STAGING_URL/api/ranking?genre=all" 2>/dev/null | grep -i "etag" | cut -d' ' -f2 | tr -d '\r')
echo "ETag: $ETAG"

# 4. 条件付きリクエスト（304）の確認
if [ ! -z "$ETAG" ]; then
    echo -e "\n4️⃣ 条件付きリクエスト（304）テスト"
    curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" -H "If-None-Match: $ETAG" "$STAGING_URL/api/ranking?genre=all"
fi

# 5. 各ジャンルのテスト
echo -e "\n5️⃣ 各ジャンルのレスポンス確認"
for genre in all game anime sing draw; do
    echo -n "Genre $genre: "
    curl -s -o /dev/null -w "%{http_code} (Size: %{size_download} bytes, Time: %{time_total}s)\n" "$STAGING_URL/api/ranking?genre=$genre"
done

# 6. タグ付きランキングのテスト
echo -e "\n6️⃣ タグ付きランキングのテスト"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "$STAGING_URL/api/ranking?genre=game&tag=ゆっくり実況プレイ"

# 7. パフォーマンステスト
echo -e "\n7️⃣ パフォーマンステスト（5回連続アクセス）"
total_time=0
for i in {1..5}; do
    time=$(curl -s -o /dev/null -w "%{time_total}" "$STAGING_URL/api/ranking?genre=all")
    echo "Request $i: ${time}s"
    total_time=$(echo "$total_time + $time" | bc)
done
avg_time=$(echo "scale=3; $total_time / 5" | bc)
echo "平均レスポンス時間: ${avg_time}s"

echo -e "\n✅ ステージング環境テスト完了"