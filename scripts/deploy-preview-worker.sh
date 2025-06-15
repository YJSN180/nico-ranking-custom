#!/bin/bash

# Preview Worker専用デプロイスクリプト

# 環境変数を読み込み
source .env.local

# Preview URLを設定
PREVIEW_URL="https://nico-ranking-custom-git-feat-auto-ng-list-yjsns-projects.vercel.app"

echo "Deploying preview worker..."
echo "Target URL: $PREVIEW_URL"

# Preview環境としてデプロイ
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" npx wrangler deploy --env preview --var NEXT_APP_URL:"$PREVIEW_URL" --var USE_PREVIEW:true

echo "✅ Preview worker deployed successfully!"
echo "Check https://preview.nico-rank.com to access the preview site"