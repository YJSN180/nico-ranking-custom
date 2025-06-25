#!/bin/bash

# Worker パフォーマンス監視スクリプト
# 使用方法: ./scripts/monitor-worker-performance.sh [WORKER_URL] [DURATION_SECONDS]

WORKER_URL=${1:-"https://nico-ranking-dynamic-cache-dev.your-subdomain.workers.dev"}
DURATION=${2:-60}
ENDPOINT="$WORKER_URL/api/ranking?genre=all&period=24h"

echo "📊 Worker パフォーマンス監視"
echo "URL: $ENDPOINT"
echo "Duration: ${DURATION}秒"
echo "======================================="

# 統計用変数
TOTAL_REQUESTS=0
SUCCESS_COUNT=0
ERROR_COUNT=0
TOTAL_TIME=0
MIN_TIME=999999
MAX_TIME=0

# ログファイル
LOG_FILE="worker-performance-$(date +%Y%m%d-%H%M%S).log"

echo "timestamp,status_code,response_time,cache_status,data_source" > $LOG_FILE

START_TIME=$(date +%s)
while [ $(($(date +%s) - START_TIME)) -lt $DURATION ]; do
    # リクエスト実行
    RESPONSE=$(curl -s -w "\n%{http_code}\n%{time_total}" "$ENDPOINT" -H "Cache-Control: no-cache")
    
    # レスポンス解析
    BODY=$(echo "$RESPONSE" | head -n -2)
    STATUS=$(echo "$RESPONSE" | tail -n 2 | head -n 1)
    TIME=$(echo "$RESPONSE" | tail -n 1)
    
    # ヘッダー情報取得
    HEADERS=$(curl -sI "$ENDPOINT")
    CACHE_STATUS=$(echo "$HEADERS" | grep -i "x-cache-status" | cut -d' ' -f2- | tr -d '\r\n')
    DATA_SOURCE=$(echo "$HEADERS" | grep -i "x-data-source" | cut -d' ' -f2- | tr -d '\r\n')
    
    # 統計更新
    TOTAL_REQUESTS=$((TOTAL_REQUESTS + 1))
    if [ "$STATUS" -eq 200 ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    else
        ERROR_COUNT=$((ERROR_COUNT + 1))
    fi
    
    # 時間統計
    TIME_MS=$(echo "$TIME * 1000" | bc)
    TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc)
    
    if (( $(echo "$TIME < $MIN_TIME" | bc -l) )); then
        MIN_TIME=$TIME
    fi
    if (( $(echo "$TIME > $MAX_TIME" | bc -l) )); then
        MAX_TIME=$TIME
    fi
    
    # ログ出力
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
    echo "$TIMESTAMP,$STATUS,$TIME_MS,$CACHE_STATUS,$DATA_SOURCE" >> $LOG_FILE
    
    # リアルタイム表示
    printf "\r[%d] Status: %d, Time: %.3fs, Cache: %s" \
        $TOTAL_REQUESTS $STATUS $TIME "${CACHE_STATUS:-N/A}"
    
    sleep 1
done

echo -e "\n\n📈 監視結果サマリー"
echo "======================================="
echo "総リクエスト数: $TOTAL_REQUESTS"
echo "成功: $SUCCESS_COUNT"
echo "エラー: $ERROR_COUNT"
echo "成功率: $(echo "scale=2; $SUCCESS_COUNT * 100 / $TOTAL_REQUESTS" | bc)%"

if [ $TOTAL_REQUESTS -gt 0 ]; then
    AVG_TIME=$(echo "scale=3; $TOTAL_TIME / $TOTAL_REQUESTS" | bc)
    echo "平均レスポンス時間: ${AVG_TIME}s"
    echo "最短レスポンス時間: ${MIN_TIME}s"
    echo "最長レスポンス時間: ${MAX_TIME}s"
fi

echo "詳細ログ: $LOG_FILE"

# キャッシュヒット率分析
if [ -f "$LOG_FILE" ]; then
    echo -e "\n📊 キャッシュ統計"
    echo "======================================="
    
    HIT_COUNT=$(grep -c ",HIT," "$LOG_FILE" || echo "0")
    MISS_COUNT=$(grep -c ",MISS," "$LOG_FILE" || echo "0")
    TOTAL_CACHE_REQUESTS=$((HIT_COUNT + MISS_COUNT))
    
    if [ $TOTAL_CACHE_REQUESTS -gt 0 ]; then
        HIT_RATE=$(echo "scale=2; $HIT_COUNT * 100 / $TOTAL_CACHE_REQUESTS" | bc)
        echo "キャッシュヒット率: ${HIT_RATE}%"
        echo "ヒット: $HIT_COUNT, ミス: $MISS_COUNT"
    fi
fi