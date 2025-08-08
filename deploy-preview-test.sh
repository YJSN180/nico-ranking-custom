#!/bin/bash

# Preview Environment Deployment and Test Script
# 2025-08-08

set -e

echo "========================================="
echo "Preview Environment Deployment & Testing"
echo "========================================="
echo ""

# Step 1: Deploy Green Worker to preview
echo "📦 Step 1: Deploying Green Worker..."
echo "Command: wrangler deploy -c workers/wrangler-green.toml --name nico-ranking-api-gateway-green-preview"
wrangler deploy -c workers/wrangler-green.toml --name nico-ranking-api-gateway-green-preview

echo ""
echo "⏳ Waiting for deployment to propagate..."
sleep 5

# Step 2: Get preview URL
PREVIEW_URL="https://nico-ranking-api-gateway-preview.5984977746a3dfcd71415bed5c324eb1.workers.dev"
echo "🌐 Preview URL: $PREVIEW_URL"
echo ""

# Step 3: Test debug endpoint
echo "🔍 Step 3: Testing debug endpoint..."
echo "curl $PREVIEW_URL/api/debug"
curl -s "$PREVIEW_URL/api/debug" | jq '.worker, .version, .features' || echo "Debug endpoint failed"
echo ""

# Step 4: Test normal ranking (should work)
echo "✅ Step 4: Testing normal ranking (genre=all)..."
NORMAL_RESPONSE=$(curl -s -I "$PREVIEW_URL/api/ranking?genre=all")
echo "$NORMAL_RESPONSE" | grep -E "HTTP|Cache-Control|X-Data-Source"
echo ""

# Step 5: Test tag ranking with existing tag
echo "🏷️ Step 5: Testing existing tag ranking..."
# Common tags that likely exist
for tag in "ゲーム" "アニメ" "音楽" "VOCALOID"; do
    echo "Testing tag: $tag"
    TAG_RESPONSE=$(curl -s "$PREVIEW_URL/api/ranking?genre=all&tag=$tag")
    ITEM_COUNT=$(echo "$TAG_RESPONSE" | jq '.items | length' 2>/dev/null || echo "0")
    if [ "$ITEM_COUNT" != "0" ]; then
        echo "✅ Tag '$tag' found: $ITEM_COUNT items"
        break
    else
        echo "❌ Tag '$tag' not found or empty"
    fi
done
echo ""

# Step 6: Test non-existent tag (should be cached now)
echo "🚫 Step 6: Testing non-existent tag caching..."
NONEXIST_TAG="this_tag_definitely_does_not_exist_12345"
echo "First request for non-existent tag: $NONEXIST_TAG"
RESPONSE1=$(curl -s -I "$PREVIEW_URL/api/ranking?genre=all&tag=$NONEXIST_TAG")
CACHE_CONTROL=$(echo "$RESPONSE1" | grep -i "cache-control:" || echo "No cache header")
echo "Cache-Control: $CACHE_CONTROL"

if echo "$CACHE_CONTROL" | grep -q "max-age=300"; then
    echo "✅ Non-existent tag responses are now cached!"
else
    echo "⚠️ Cache headers may not be properly set"
fi
echo ""

# Step 7: Check R2 data structure
echo "📊 Step 7: Checking R2 data availability..."
echo "Testing metadata endpoint..."
METADATA=$(curl -s "$PREVIEW_URL/api/metadata")
if echo "$METADATA" | jq . >/dev/null 2>&1; then
    echo "✅ Metadata endpoint working"
    echo "$METADATA" | jq '{version, lastUpdated}' 2>/dev/null || echo "$METADATA"
else
    echo "⚠️ Metadata endpoint may have issues"
fi
echo ""

# Step 8: Rate limiting test
echo "🚦 Step 8: Testing rate limiting..."
echo "Sending 5 rapid requests..."
for i in {1..5}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PREVIEW_URL/api/ranking?genre=all&test=$i")
    echo -n "$STATUS "
    sleep 0.2
done
echo ""
echo ""

# Step 9: Summary
echo "========================================="
echo "📝 Summary & Next Steps"
echo "========================================="
echo ""
echo "✅ Deployment completed to preview environment"
echo ""
echo "Key URLs:"
echo "- Preview: $PREVIEW_URL"
echo "- Main site: https://nico-rank.com"
echo ""
echo "To verify R2 tag data:"
echo "1. Check if common tags return data (ゲーム, アニメ, etc.)"
echo "2. Check CloudFlare dashboard → R2 → nico-ranking bucket"
echo "3. Look for: rankings/{genre}/{period}/tags/*.json files"
echo ""
echo "Monitor in CloudFlare dashboard:"
echo "- Workers & Pages → nico-ranking-api-gateway-green-preview"
echo "- Analytics → Cache Analysis"
echo "- Security → Events (for rate limiting)"
echo ""
echo "If everything works in preview:"
echo "1. Update KV: active_worker = 'green'"
echo "2. Or deploy directly: wrangler deploy -c workers/wrangler-green.toml"