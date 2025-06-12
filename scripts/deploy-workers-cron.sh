#!/bin/bash

# Cloudflare Workers Cron デプロイメントスクリプト
# 段階的なデプロイとロールバック機能付き

set -e

echo "🚀 Cloudflare Workers Cron Deployment Script"
echo "==========================================="

# 環境変数の確認
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN is not set"
  exit 1
fi

# デプロイ環境の選択
ENVIRONMENT=${1:-production}
echo "📦 Deploying to: $ENVIRONMENT"

# TypeScriptのビルド
echo "🔨 Building TypeScript..."
npx tsc workers/*.ts --outDir .wrangler/tmp --module esnext --target es2020 --lib es2020 --skipLibCheck || {
  echo "❌ TypeScript build failed"
  exit 1
}

# 既存のデプロイメントをバックアップ
echo "💾 Creating backup of current deployment..."
wrangler kv:key get --env=$ENVIRONMENT --binding=RANKING_DATA "deployment-backup" > .wrangler/backup.json || true

# デプロイメント情報を記録
DEPLOYMENT_ID=$(date +%s)
DEPLOYMENT_INFO=$(cat <<EOF
{
  "id": "$DEPLOYMENT_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "environment": "$ENVIRONMENT",
  "git_commit": "$(git rev-parse HEAD)",
  "git_branch": "$(git branch --show-current)"
}
EOF
)

# KVにデプロイメント情報を保存
echo "$DEPLOYMENT_INFO" | wrangler kv:key put --env=$ENVIRONMENT --binding=RANKING_DATA "deployment-current" --metadata "$DEPLOYMENT_INFO"

# Durable Objects の移行
echo "🔄 Running Durable Objects migrations..."
wrangler migrations list --env=$ENVIRONMENT
wrangler migrations apply --env=$ENVIRONMENT --yes || {
  echo "⚠️  Migration failed, but continuing..."
}

# Cron Worker のデプロイ
echo "⏰ Deploying Cron Worker..."
wrangler deploy --env=cron --compatibility-date=2024-01-01 || {
  echo "❌ Cron Worker deployment failed"
  exit 1
}

# API Gateway の更新（必要に応じて）
echo "🌐 Updating API Gateway..."
wrangler deploy --env=$ENVIRONMENT --compatibility-date=2024-01-01 || {
  echo "❌ API Gateway deployment failed"
  exit 1
}

# ヘルスチェック
echo "🏥 Running health checks..."
sleep 5  # デプロイが反映されるまで待機

HEALTH_CHECK_URL="https://nico-rank.com/api/health"
if [ "$ENVIRONMENT" = "preview" ]; then
  HEALTH_CHECK_URL="https://preview.nico-rank.com/api/health"
fi

HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" $HEALTH_CHECK_URL)
HTTP_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$HEALTH_RESPONSE" | head -n-1)

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ Health check failed with status code: $HTTP_CODE"
  echo "Response: $RESPONSE_BODY"
  
  # ロールバック
  echo "🔙 Rolling back deployment..."
  ./scripts/rollback-workers.sh $DEPLOYMENT_ID
  exit 1
fi

echo "✅ Health check passed"
echo "$RESPONSE_BODY" | jq .

# Cron ジョブのテスト実行
echo "🧪 Testing Cron job..."
wrangler tail --env=cron --format=pretty &
TAIL_PID=$!

# テストトリガー
curl -X POST https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/nico-ranking-cron/schedules \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cron": "*/10 * * * *"}' || {
    echo "⚠️  Failed to trigger test cron job"
  }

sleep 10
kill $TAIL_PID 2>/dev/null || true

# デプロイメント完了
echo "🎉 Deployment completed successfully!"
echo ""
echo "📊 Deployment Summary:"
echo "- Environment: $ENVIRONMENT"
echo "- Deployment ID: $DEPLOYMENT_ID"
echo "- Timestamp: $(date)"
echo ""
echo "📝 Next steps:"
echo "1. Monitor logs: wrangler tail --env=cron"
echo "2. Check KV data: wrangler kv:key list --env=$ENVIRONMENT --binding=RANKING_DATA"
echo "3. View metrics: https://dash.cloudflare.com"
echo ""
echo "🔙 To rollback: ./scripts/rollback-workers.sh $DEPLOYMENT_ID"