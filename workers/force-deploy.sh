#\!/bin/bash

# デバッグ情報
echo "=== Environment Check ==="
echo "API Token exists: $([ -n "$CLOUDFLARE_API_TOKEN" ] && echo "YES" || echo "NO")"
echo "Token first 10 chars: ${CLOUDFLARE_API_TOKEN:0:10}..."

# wranglerデプロイ（環境変数を明示的に渡す）
echo -e "\n=== Deploying with wrangler ==="
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" npx wrangler@3.114.9 deploy api-gateway-r2.ts \
  --name nico-ranking-api-gateway \
  --compatibility-date 2024-06-13 \
  --var VERCEL_DEPLOYMENT_URL:https://nico-ranking-custom-yjsns-projects.vercel.app
