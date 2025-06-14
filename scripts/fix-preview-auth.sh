#!/bin/bash

echo "=== Preview Environment Authentication Fix ==="
echo ""

# Load environment variables
if [ -f .env.local ]; then
    source .env.local
else
    echo "Error: .env.local file not found"
    exit 1
fi

# Check required variables
if [ -z "$CLOUDFLARE_KV_API_TOKEN" ]; then
    echo "Error: CLOUDFLARE_KV_API_TOKEN not set in .env.local"
    exit 1
fi

if [ -z "$WORKER_AUTH_KEY" ]; then
    echo "Error: WORKER_AUTH_KEY not set in .env.local"
    exit 1
fi

echo "Current Preview Worker Status:"
echo "=============================="
curl -s https://preview.nico-rank.com/debug 2>/dev/null | python3 -m json.tool || echo "Failed to fetch debug info"
echo ""

echo "The preview environment needs authentication secrets to work properly."
echo ""
echo "To fix the preview environment, run these commands:"
echo "================================================="
echo ""
echo "# 1. Set WORKER_AUTH_KEY for preview worker"
echo "echo '$WORKER_AUTH_KEY' | wrangler secret put WORKER_AUTH_KEY --env preview"
echo ""
echo "# 2. If you have VERCEL_PROTECTION_BYPASS_SECRET, set it too:"
echo "# wrangler secret put VERCEL_PROTECTION_BYPASS_SECRET --env preview"
echo ""
echo "# 3. Redeploy the preview worker"
echo "CLOUDFLARE_API_TOKEN='$CLOUDFLARE_KV_API_TOKEN' wrangler deploy --env preview"
echo ""
echo "After running these commands, the preview environment should work correctly."
echo ""
echo "Note: The Vercel preview deployment itself shows 401 because it requires"
echo "authentication headers that only the Cloudflare Worker provides."