#!/bin/bash
source .env.local
echo "🚀 Deploying Green Worker..."
echo "Account ID: $CLOUDFLARE_ACCOUNT_ID"

# R2とKV bindingを含むwrangler.tomlを使用してデプロイ
wrangler deploy workers/api-gateway-green-20250726.ts \
  --name nico-ranking-api-gateway-green \
  --compatibility-date 2025-06-24 \
  -c wrangler.toml

echo "✅ Deploy complete!"
