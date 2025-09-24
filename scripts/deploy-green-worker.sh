#!/bin/bash
# Deploy Green Worker with popular tags

set -a
source .env.local
set +a

cd workers

echo "🚀 Deploying Green Worker with popular tags support..."
wrangler deploy api-gateway-green-with-popular-tags.ts \
  --name nico-ranking-api-gateway-green \
  --compatibility-date 2025-06-24

echo "✅ Deployment complete!"
