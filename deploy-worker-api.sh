#\!/bin/bash

# Cloudflare API設定
ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
API_TOKEN="$CLOUDFLARE_API_TOKEN"
SCRIPT_NAME="nico-ranking-api-gateway"

# バンドルされたJSファイルを準備
cd workers
npx esbuild api-gateway-r2.ts --bundle --format=esm --outfile=bundled-worker.js --platform=node --target=es2020

# Workerをアップロード
echo "Deploying Worker to Cloudflare..."
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/javascript" \
  --data-binary "@bundled-worker.js"

# クリーンアップ
rm bundled-worker.js
