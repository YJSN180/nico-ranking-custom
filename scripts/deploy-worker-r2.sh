#!/bin/bash
set -euo pipefail

echo "🚀 Deploying R2-enabled Worker to Cloudflare..."

# Check if environment variables are set
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set"
  exit 1
fi

# Deploy the worker with R2 configuration
wrangler deploy \
  --name "nico-ranking-api-gateway" \
  --main "workers/api-gateway-r2.ts" \
  --compatibility-date "2024-06-13" \
  --var "VERCEL_DEPLOYMENT_URL:https://nico-ranking-custom-yjsns-projects.vercel.app" \
  --route "nico-rank.com/*" \
  --r2 "R2_BUCKET=nico-ranking" \
  --kv "RANKING_DATA=80f4535c379b4e8cb89ce6dbdb7d2dc9"

echo "✅ Worker deployed successfully!"