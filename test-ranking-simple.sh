#!/bin/bash

# Replace this with your actual Vercel deployment URL
BASE_URL="https://your-app.vercel.app"

echo "Testing Ranking Patterns on Vercel (Simple Version)"
echo "==================================================="

# Test 1: Hourly ranking for general category (all)
echo -e "\n1. Testing hourly ranking for general category (all):"
echo "URL: ${BASE_URL}/api/ranking?period=24h&genre=all"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all" | head -c 500
echo -e "\n"

# Test 2: Non-general genre (entertainment)
echo -e "\n2. Testing non-general genre (entertainment):"
echo "URL: ${BASE_URL}/api/ranking?period=24h&genre=entertainment"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=entertainment" | head -c 500
echo -e "\n"

# Test 3: Tag-based ranking for a genre
echo -e "\n3. Testing tag-based ranking (all genre with 'ゲーム' tag):"
echo "URL: ${BASE_URL}/api/ranking?period=24h&genre=all&tag=ゲーム"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=all&tag=%E3%82%B2%E3%83%BC%E3%83%A0" | head -c 500
echo -e "\n"

# Test 4: Special "rei-sore" genre (r18)
echo -e "\n4. Testing special 'rei-sore' genre (r18):"
echo "URL: ${BASE_URL}/api/ranking?period=24h&genre=r18"
curl -s "${BASE_URL}/api/ranking?period=24h&genre=r18" | head -c 500
echo -e "\n"

# Test 5: Check response headers
echo -e "\n5. Checking response headers for general genre:"
curl -sI "${BASE_URL}/api/ranking?period=24h&genre=all" | grep -E "(Cache-Control|X-Data-Source|Content-Type|X-Error)"

echo -e "\n\nDone!"