#\!/bin/bash

# APIトークンのテスト
API_TOKEN="$CLOUDFLARE_KV_API_TOKEN"

echo "Testing Cloudflare API authentication..."
curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json"  < /dev/null |  grep -o '"success":[^,]*'
