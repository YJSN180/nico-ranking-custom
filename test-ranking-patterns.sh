#!/bin/bash

# Replace this with your actual Vercel deployment URL
BASE_URL="https://your-app.vercel.app"

echo "Testing Ranking Patterns on Vercel"
echo "=================================="

# Test 1: Hourly ranking for general category (all)
echo -e "\n1. Testing hourly ranking for general category (all):"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all" | jq '.items | length' 2>/dev/null || echo "Failed to parse JSON"
echo "Response preview:"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all" | jq '.items[0:2]' 2>/dev/null || curl -s "${BASE_URL}/api/ranking?period=24h&genre=all"

# Test 2: Non-general genre (entertainment)
echo -e "\n\n2. Testing non-general genre (entertainment):"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=entertainment" | jq '.items | length' 2>/dev/null || echo "Failed to parse JSON"
echo "Response preview:"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=entertainment" | jq '.items[0:2]' 2>/dev/null || curl -s "${BASE_URL}/api/ranking?period=24h&genre=entertainment"

# Test 3: Tag-based ranking for a genre
echo -e "\n\n3. Testing tag-based ranking (all genre with 'ゲーム' tag):"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all&tag=%E3%82%B2%E3%83%BC%E3%83%A0" | jq '. | if type == "array" then length else .items | length end' 2>/dev/null || echo "Failed to parse JSON"
echo "Response preview:"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all&tag=%E3%82%B2%E3%83%BC%E3%83%A0" | jq 'if type == "array" then .[0:2] else .items[0:2] end' 2>/dev/null || curl -s "${BASE_URL}/api/ranking?period=24h&genre=all&tag=%E3%82%B2%E3%83%BC%E3%83%A0"

# Test 4: Special "rei-sore" genre (r18)
echo -e "\n\n4. Testing special 'rei-sore' genre (r18):"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=r18" | jq '.items | length' 2>/dev/null || echo "Failed to parse JSON"
echo "Response preview:"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=r18" | jq '.items[0:2]' 2>/dev/null || curl -s "${BASE_URL}/api/ranking?period=24h&genre=r18"

# Test 5: Check popular tags for general genre
echo -e "\n\n5. Checking popular tags for general genre:"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all" | jq '.popularTags[0:5]' 2>/dev/null || echo "No popular tags found"

# Test 6: Check response headers
echo -e "\n\n6. Checking response headers for caching:"
curl -sI "${BASE_URL}/api/ranking?period=24h&genre=all" | grep -E "(Cache-Control|X-Data-Source|Content-Type)"

echo -e "\n\nDone!"