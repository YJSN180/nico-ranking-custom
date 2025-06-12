#!/bin/bash

# Cloudflare KV セットアップスクリプト

export CLOUDFLARE_API_TOKEN="<your-cloudflare-api-token>"
export CLOUDFLARE_ACCOUNT_ID="<your-cloudflare-account-id>"

echo "Creating KV namespaces..."

# RANKING_DATA namespace作成
echo "Creating RANKING_DATA namespace..."
RANKING_DATA_RESPONSE=$(curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"title":"nico-ranking-RANKING_DATA"}')

RANKING_DATA_ID=$(echo $RANKING_DATA_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$' | head -1)
echo "RANKING_DATA namespace ID: $RANKING_DATA_ID"

# RATE_LIMIT namespace作成
echo "Creating RATE_LIMIT namespace..."
RATE_LIMIT_RESPONSE=$(curl -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"title":"nico-ranking-RATE_LIMIT"}')

RATE_LIMIT_ID=$(echo $RATE_LIMIT_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$' | head -1)
echo "RATE_LIMIT namespace ID: $RATE_LIMIT_ID"

# 結果を表示
echo ""
echo "=== Cloudflare KV Namespace IDs ==="
echo "CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID"
echo "CLOUDFLARE_KV_NAMESPACE_ID=$RANKING_DATA_ID"
echo "RATE_LIMIT_NAMESPACE_ID=$RATE_LIMIT_ID"
echo ""
echo "These values should be added to your environment variables."