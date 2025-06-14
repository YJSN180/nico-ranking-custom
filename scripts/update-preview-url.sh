#!/bin/bash

# Preview URL更新スクリプト

# 環境変数を読み込み
source .env.local

# Preview URLを設定
PREVIEW_URL="https://nico-ranking-custom-git-feat-auto-ng-list-yjsns-projects.vercel.app"

echo "Updating PREVIEW_URL to: $PREVIEW_URL"

# PREVIEW_URLシークレットを更新
echo "$PREVIEW_URL" | CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" npx wrangler secret put PREVIEW_URL

# USE_PREVIEWをtrueに設定してデプロイ
echo "Deploying with USE_PREVIEW=true..."
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" npx wrangler deploy --var USE_PREVIEW:true

echo "✅ Preview URL configuration updated successfully!"
echo "Check https://preview.nico-rank.com/debug to verify"