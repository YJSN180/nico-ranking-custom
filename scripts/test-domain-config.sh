#!/bin/bash

# Domain Configuration Test Script
# Tests the Cloudflare Workers + Vercel integration

echo "🧪 Testing domain configuration..."

# Test 1: Workers debug endpoint
echo "1. Testing Workers debug endpoint..."
DEBUG_RESPONSE=$(curl -s "https://nico-rank.com/debug" 2>/dev/null)

if [ -z "$DEBUG_RESPONSE" ]; then
    echo "❌ Failed to reach debug endpoint"
    exit 1
fi

echo "✅ Debug endpoint accessible"

# Check if authentication is configured
HAS_AUTH=$(echo "$DEBUG_RESPONSE" | grep -o '"hasWorkerAuthKey":[^,]*' | cut -d':' -f2)

if [ "$HAS_AUTH" = "true" ]; then
    echo "✅ Worker authentication key configured"
else
    echo "⚠️ Worker authentication key NOT configured"
    echo "Run: npm run setup:domain-auth"
fi

# Test 2: Main domain response
echo "2. Testing main domain..."
MAIN_RESPONSE=$(curl -s -I "https://nico-rank.com/" 2>/dev/null | head -1)

if echo "$MAIN_RESPONSE" | grep -q "200 OK"; then
    echo "✅ Main domain returns 200 OK"
elif echo "$MAIN_RESPONSE" | grep -q "522"; then
    echo "❌ Still getting 522 error - authentication not working"
    echo "Check Vercel environment variables"
elif echo "$MAIN_RESPONSE" | grep -q "307\|301\|302"; then
    echo "⚠️ Getting redirect - possible configuration issue"
else
    echo "❓ Unexpected response: $MAIN_RESPONSE"
fi

# Test 3: Direct Vercel access (should redirect)
echo "3. Testing direct Vercel access..."
VERCEL_RESPONSE=$(curl -s -I "https://nico-ranking-custom-yjsns-projects.vercel.app/" 2>/dev/null | head -1)

if echo "$VERCEL_RESPONSE" | grep -q "307"; then
    echo "✅ Direct Vercel access properly redirects to custom domain"
else
    echo "❓ Unexpected Vercel response: $VERCEL_RESPONSE"
fi

echo ""
echo "🔍 Full debug info:"
echo "$DEBUG_RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$DEBUG_RESPONSE"

echo ""
echo "📊 Test Summary:"
echo "- Workers: $([ "$HAS_AUTH" = "true" ] && echo "✅ Configured" || echo "❌ Needs setup")"
echo "- Domain: $(echo "$MAIN_RESPONSE" | grep -q "200 OK" && echo "✅ Working" || echo "❌ Issues")"
echo "- Redirect: $(echo "$VERCEL_RESPONSE" | grep -q "307" && echo "✅ Working" || echo "❓ Check")"