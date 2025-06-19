#!/bin/bash

# KV Optimization Deployment Plan
# This script performs a staged deployment of the fully optimized KV mode

set -e

echo "🚀 KV Optimization Deployment Plan"
echo "=================================="
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

# Stage 2: Test the optimized worker locally
echo
echo "🧪 Stage 2: Running tests"
echo "------------------------"
npx vitest run __tests__/integration/kv-optimization-full.test.ts

echo "✅ Tests passed"

# Stage 3: Performance baseline (current hybrid mode)
echo
echo "📊 Stage 3: Performance baseline (hybrid mode)"
echo "---------------------------------------------"
echo "Testing current response time..."
START_TIME=$(date +%s%N)
curl -s -o /dev/null -w "Response time: %{time_total}s\n" https://nico-rank.com/api/edge/ranking?genre=all&period=24h
END_TIME=$(date +%s%N)
BASELINE_TIME=$((($END_TIME - $START_TIME) / 1000000))
echo "Baseline response time: ${BASELINE_TIME}ms"

# Stage 4: Deploy optimized worker
echo
echo "🚀 Stage 4: Deploying optimized worker"
echo "-------------------------------------"
echo "Deploy command: wrangler deploy -c wrangler-optimized.toml"
echo
read -p "Proceed with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy -c wrangler-optimized.toml

# Stage 5: Verify deployment
echo
echo "✅ Stage 5: Verifying deployment"
echo "--------------------------------"
sleep 5  # Wait for deployment to propagate

# Check debug endpoint
RESPONSE=$(curl -s https://nico-rank.com/debug)
MODE=$(echo "$RESPONSE" | grep -o '"mode":"[^"]*"' | cut -d'"' -f4)

if [ "$MODE" = "KV_OPTIMIZED" ]; then
    echo "✅ Successfully deployed in KV_OPTIMIZED mode"
else
    echo "❌ Unexpected mode: $MODE"
    echo "Full response: $RESPONSE"
fi

# Stage 6: Performance test
echo
echo "⚡ Stage 6: Performance test (optimized mode)"
echo "--------------------------------------------"
for i in {1..5}; do
    echo -n "Test $i: "
    curl -s -o /dev/null -w "%{time_total}s\n" https://nico-rank.com/api/edge/ranking?genre=all&period=24h
    sleep 1
done

# Stage 7: Monitor for errors
echo
echo "🔍 Stage 7: Monitoring (press Ctrl+C to stop)"
echo "--------------------------------------------"
echo "Monitoring for errors..."

while true; do
    RESPONSE=$(curl -s -w "\nStatus: %{http_code} Time: %{time_total}s" https://nico-rank.com/api/edge/ranking?genre=all&period=24h | tail -1)
    echo "$(date): $RESPONSE"
    
    if [[ "$RESPONSE" == *"Status: 5"* ]]; then
        echo "⚠️  Error detected!"
    fi
    
    sleep 10
done