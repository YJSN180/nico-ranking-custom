#\!/bin/bash

# Cloudflare API設定
ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"
API_TOKEN="$CLOUDFLARE_KV_API_TOKEN"
SCRIPT_NAME="nico-ranking-api-gateway"

# バンドル
cd workers
npx esbuild api-gateway-r2.ts --bundle --format=esm --outfile=worker.js --platform=node --target=es2020

# メタデータJSON作成
cat > metadata.json << 'METADATA'
{
  "main_module": "worker.js",
  "bindings": [
    {
      "name": "RANKING_DATA",
      "type": "kv_namespace",
      "namespace_id": "80f4535c379b4e8cb89ce6dbdb7d2dc9"
    },
    {
      "name": "R2_BUCKET",
      "type": "r2_bucket",
      "bucket_name": "nico-ranking"
    }
  ],
  "compatibility_date": "2024-06-13",
  "vars": {
    "VERCEL_DEPLOYMENT_URL": "https://nico-ranking-custom-yjsns-projects.vercel.app"
  }
}
METADATA

# マルチパートフォームでアップロード
echo "Deploying Worker..."
curl -X PUT "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "worker.js=@worker.js;type=application/javascript+module" \
  -F "wasm_modules="

# クリーンアップ
rm worker.js metadata.json
cd ..
