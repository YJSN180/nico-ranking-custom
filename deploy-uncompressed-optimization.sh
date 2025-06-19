#!/bin/bash

# Deploy uncompressed KV optimization
# This script deploys the optimized worker without compression

set -e

echo "🚀 Uncompressed KV Optimization Deployment"
echo "=========================================="
echo
echo "This deployment removes gzip compression to simplify the system"
echo "since the data size fits well within Cloudflare's free tier limits."
echo

# Stage 1: Pre-deployment checks
echo "📋 Stage 1: Pre-deployment checks"
echo "--------------------------------"

# Check environment variables
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local not found"
    exit 1
fi

source .env.local

if [ -z "$CLOUDFLARE_KV_API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_KV_API_TOKEN not set"
    exit 1
fi

echo "✅ Environment variables loaded"

# Stage 2: Test the optimized worker
echo
echo "🧪 Stage 2: Running tests"
echo "------------------------"
npm run test -- --run __tests__/integration/kv-optimization-full.test.ts

echo "✅ Tests passed"

# Stage 3: Check current data size
echo
echo "📊 Stage 3: Data size analysis"
echo "-----------------------------"
echo "Checking current KV data size..."
npx tsx scripts/check-kv-data.ts | grep -E "(size|MB|compressed)" || true

echo
echo "The uncompressed data will be approximately 3-4x larger than compressed,"
echo "but still well within the 1GB free tier limit."
echo

# Stage 4: Deploy warning
echo
echo "⚠️  Stage 4: Deployment considerations"
echo "--------------------------------------"
echo "IMPORTANT: This deployment will:"
echo "1. Change KV data storage from compressed to uncompressed JSON"
echo "2. The next cron job run will store data uncompressed"
echo "3. Current compressed data will still work until next update"
echo

read -p "Proceed with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

# Stage 5: Deploy optimized worker
echo
echo "🚀 Stage 5: Deploying optimized worker"
echo "-------------------------------------"
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy -c wrangler-optimized.toml

# Stage 6: Verify deployment
echo
echo "✅ Stage 6: Verifying deployment"
echo "--------------------------------"
sleep 5  # Wait for deployment to propagate

# Check debug endpoint
echo "Checking debug endpoint..."
RESPONSE=$(curl -s https://nico-rank.com/debug)
MODE=$(echo "$RESPONSE" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)

if [ "$MODE" = "KV_OPTIMIZED_UNCOMPRESSED" ]; then
    echo "✅ Successfully deployed in KV_OPTIMIZED_UNCOMPRESSED mode"
else
    echo "❌ Unexpected mode: $MODE"
    echo "Full response:"
    echo "$RESPONSE" | jq . || echo "$RESPONSE"
fi

# Stage 7: Test API endpoints
echo
echo "⚡ Stage 7: Testing API endpoints"
echo "---------------------------------"

echo
echo "Testing ranking API..."
curl -s -w "\nStatus: %{http_code} Time: %{time_total}s\n" \
    https://nico-rank.com/api/edge/ranking?genre=all&period=24h | \
    tail -2

echo
echo "Testing with cache bypass..."
curl -s -w "\nStatus: %{http_code} Time: %{time_total}s\n" \
    -H "X-Bypass-Cache: true" \
    https://nico-rank.com/api/edge/ranking?genre=all&period=24h | \
    tail -2

# Stage 8: Next steps
echo
echo "📝 Stage 8: Next steps"
echo "---------------------"
echo "1. Monitor the worker for any errors"
echo "2. The next cron job run will store uncompressed data"
echo "3. Performance should improve due to no decompression overhead"
echo "4. Storage usage will increase but remain within free tier"
echo
echo "To rollback if needed:"
echo "  wrangler deploy  # Deploy the hybrid gateway"
echo
echo "✅ Deployment complete!"