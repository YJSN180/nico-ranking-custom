#!/bin/bash
# Health check script for Blue/Green Workers

set -e

# Function to perform comprehensive health check
health_check() {
  local ENV_NAME=$1
  local BASE_URL=$2
  
  echo "=== Health Check: $ENV_NAME ==="
  echo "URL: $BASE_URL"
  echo ""
  
  # Basic connectivity
  echo -n "1. Basic connectivity... "
  if curl -sf "$BASE_URL" > /dev/null; then
    echo "✅ OK"
  else
    echo "❌ FAILED"
    return 1
  fi
  
  # Health endpoint
  echo -n "2. Health endpoint... "
  HEALTH_RESPONSE=$(curl -sf "$BASE_URL/api/health" || echo "failed")
  if [ "$HEALTH_RESPONSE" != "failed" ]; then
    echo "✅ OK"
    
    # Parse health response
    if command -v jq &> /dev/null; then
      echo "   Health details:"
      echo "$HEALTH_RESPONSE" | jq -r '
        "   - Worker Version: " + .worker_version,
        "   - KV Accessible: " + (.kv_accessible|tostring),
        "   - R2 Accessible: " + (.r2_accessible|tostring),
        "   - Timestamp: " + .timestamp
      ' 2>/dev/null || echo "   (Could not parse health response)"
    fi
  else
    echo "❌ FAILED"
    return 1
  fi
  
  # Version header
  echo -n "3. Version header... "
  VERSION_HEADER=$(curl -sI "$BASE_URL/api/debug" | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r' || echo "missing")
  if [ "$VERSION_HEADER" != "missing" ] && [ ! -z "$VERSION_HEADER" ]; then
    echo "✅ OK ($VERSION_HEADER)"
  else
    echo "❌ MISSING"
  fi
  
  # Response time
  echo -n "4. Response time... "
  RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "$BASE_URL/api/health")
  if (( $(echo "$RESPONSE_TIME < 2.0" | bc -l) )); then
    echo "✅ OK (${RESPONSE_TIME}s)"
  else
    echo "⚠️  SLOW (${RESPONSE_TIME}s)"
  fi
  
  # API endpoints
  echo "5. API endpoints check:"
  
  # Ranking endpoint
  echo -n "   - /api/ranking... "
  RANKING_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/ranking?genre=all&term=hourly")
  if [ "$RANKING_STATUS" = "200" ]; then
    echo "✅ OK"
  else
    echo "❌ FAILED (HTTP $RANKING_STATUS)"
  fi
  
  # Genres endpoint
  echo -n "   - /api/genres... "
  GENRES_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/genres")
  if [ "$GENRES_STATUS" = "200" ]; then
    echo "✅ OK"
  else
    echo "❌ FAILED (HTTP $GENRES_STATUS)"
  fi
  
  # Tags endpoint
  echo -n "   - /api/tags... "
  TAGS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/tags")
  if [ "$TAGS_STATUS" = "200" ]; then
    echo "✅ OK"
  else
    echo "❌ FAILED (HTTP $TAGS_STATUS)"
  fi
  
  # Cache headers
  echo "6. Cache headers check:"
  CACHE_HEADERS=$(curl -sI "$BASE_URL/api/ranking?genre=all&term=hourly" | grep -E "(Cache-Control|ETag|X-Cache-Status)" || echo "none")
  if [ "$CACHE_HEADERS" != "none" ]; then
    echo "$CACHE_HEADERS" | sed 's/^/   /'
  else
    echo "   ⚠️  No cache headers found"
  fi
  
  echo ""
  echo "Health check completed for $ENV_NAME"
  echo "=================================="
  echo ""
}

# Main execution
if [ $# -eq 0 ]; then
  echo "Usage: $0 <environment>"
  echo "  environment: blue | green | prod | all"
  echo ""
  echo "Examples:"
  echo "  $0 blue    # Check Blue Worker"
  echo "  $0 green   # Check Green Worker"
  echo "  $0 prod    # Check Production"
  echo "  $0 all     # Check all environments"
  exit 1
fi

ENV=$1

case $ENV in
  "blue")
    health_check "Blue Worker" "https://nico-ranking-api-gateway-blue.workers.dev"
    ;;
  "green")
    health_check "Green Worker" "https://nico-ranking-api-gateway-green.workers.dev"
    ;;
  "prod")
    health_check "Production" "https://nico-rank.com"
    ;;
  "all")
    health_check "Blue Worker" "https://nico-ranking-api-gateway-blue.workers.dev"
    health_check "Green Worker" "https://nico-ranking-api-gateway-green.workers.dev"
    health_check "Production" "https://nico-rank.com"
    ;;
  *)
    echo "Error: Unknown environment '$ENV'"
    echo "Valid options: blue, green, prod, all"
    exit 1
    ;;
esac