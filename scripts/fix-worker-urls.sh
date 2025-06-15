#!/bin/bash

echo "=== Cloudflare Worker URL Fix Script ==="
echo "This script will update the Cloudflare Worker environment variables to fix the infinite redirect issue."
echo ""

# Load environment variables
if [ -f .env.local ]; then
    source .env.local
else
    echo "Error: .env.local file not found"
    exit 1
fi

# Check required environment variables
if [ -z "$CLOUDFLARE_KV_API_TOKEN" ]; then
    echo "Error: CLOUDFLARE_KV_API_TOKEN not set in .env.local"
    exit 1
fi

echo "Current Worker Configuration:"
echo "============================="
curl -s https://nico-rank.com/debug | python3 -m json.tool
echo ""

echo "The issue: NEXT_APP_URL is pointing to an old deployment URL"
echo "It should be: https://nico-ranking-custom-yjsns-projects.vercel.app"
echo ""

echo "To fix this, you need to:"
echo "1. Update the Cloudflare Worker environment variable NEXT_APP_URL"
echo "2. Redeploy the worker"
echo ""
echo "Commands to run:"
echo "================"
echo ""
echo "# Set the correct URL for production worker"
echo "wrangler secret put NEXT_APP_URL --env production"
echo "# When prompted, enter: https://nico-ranking-custom-yjsns-projects.vercel.app"
echo ""
echo "# For the preview environment, ensure WORKER_AUTH_KEY is set"
echo "wrangler secret put WORKER_AUTH_KEY --env preview"
echo "# When prompted, enter the same value as in your .env.local WORKER_AUTH_KEY"
echo ""
echo "# Then redeploy both workers"
echo "wrangler deploy"
echo "wrangler deploy --env preview"
echo ""
echo "Alternative: Update via Cloudflare Dashboard"
echo "==========================================="
echo "1. Go to Cloudflare Dashboard > Workers & Pages"
echo "2. Find 'nico-ranking-api-gateway' worker"
echo "3. Go to Settings > Variables"
echo "4. Update NEXT_APP_URL to: https://nico-ranking-custom-yjsns-projects.vercel.app"
echo "5. Save and deploy"
echo ""
echo "For preview worker:"
echo "1. Find 'nico-ranking-api-gateway-preview' worker"
echo "2. Add WORKER_AUTH_KEY secret with the same value as production"
echo "3. Save and deploy"