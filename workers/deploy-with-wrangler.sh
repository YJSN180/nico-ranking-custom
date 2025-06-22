#\!/bin/bash

# 環境変数を設定
export CLOUDFLARE_ACCOUNT_ID="5984977746a3dfcd71415bed5c324eb1"
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN"

# wrangler.tomlを作成
cat > wrangler.toml << 'CONFIG'
name = "nico-ranking-api-gateway"
main = "api-gateway-r2.ts"
compatibility_date = "2024-06-13"

[[kv_namespaces]]
binding = "RANKING_DATA"
id = "80f4535c379b4e8cb89ce6dbdb7d2dc9"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "nico-ranking"

[vars]
VERCEL_DEPLOYMENT_URL = "https://nico-ranking-custom-yjsns-projects.vercel.app"
CONFIG

# デプロイ実行
echo "Deploying with wrangler..."
CI=1 npx wrangler deploy --no-bundle=false

# クリーンアップ
rm -f wrangler.toml
