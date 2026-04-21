#!/bin/bash
# Real-time monitoring script for Blue/Green deployment

# Configuration
BLUE_URL="https://nico-ranking-api-gateway-blue.workers.dev"
GREEN_URL="https://nico-ranking-api-gateway-green.workers.dev"
PROD_URL="https://nico-rank.com"
MAINTENANCE_FLAGS_BINDING="MAINTENANCE_FLAGS"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/wrangler-with-token.sh"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get colored status
get_status_color() {
  local status=$1
  if [ "$status" = "200" ]; then
    echo -e "${GREEN}✅ $status${NC}"
  elif [ "$status" = "503" ]; then
    echo -e "${YELLOW}⚠️  $status${NC}"
  else
    echo -e "${RED}❌ $status${NC}"
  fi
}

# Function to get version with color
get_version_color() {
  local version=$1
  if [[ "$version" == *"blue"* ]]; then
    echo -e "${BLUE}$version${NC}"
  elif [[ "$version" == *"green"* ]]; then
    echo -e "${GREEN}$version${NC}"
  else
    echo "$version"
  fi
}

# Main monitoring loop
while true; do
  clear
  echo "=== Blue/Green Deployment Monitor ==="
  echo "Time: $(date)"
  echo "Press Ctrl+C to exit"
  echo ""
  
  # Blue environment check
  BLUE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 $BLUE_URL/api/health 2>/dev/null || echo "timeout")
  BLUE_VERSION=$(curl -s -I --max-time 5 $BLUE_URL/api/debug 2>/dev/null | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r' || echo "unavailable")
  BLUE_RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 $BLUE_URL/api/health 2>/dev/null || echo "N/A")
  
  echo -e "Blue Worker:"
  echo -e "  Status: $(get_status_color $BLUE_STATUS)"
  echo -e "  Version: $(get_version_color $BLUE_VERSION)"
  echo -e "  Response Time: ${BLUE_RESPONSE_TIME}s"
  echo ""
  
  # Green environment check
  GREEN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 $GREEN_URL/api/health 2>/dev/null || echo "timeout")
  GREEN_VERSION=$(curl -s -I --max-time 5 $GREEN_URL/api/debug 2>/dev/null | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r' || echo "unavailable")
  GREEN_RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 $GREEN_URL/api/health 2>/dev/null || echo "N/A")
  
  echo -e "Green Worker:"
  echo -e "  Status: $(get_status_color $GREEN_STATUS)"
  echo -e "  Version: $(get_version_color $GREEN_VERSION)"
  echo -e "  Response Time: ${GREEN_RESPONSE_TIME}s"
  echo ""
  
  # Production environment check
  PROD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 $PROD_URL/api/health 2>/dev/null || echo "timeout")
  PROD_VERSION=$(curl -s -I --max-time 5 $PROD_URL/api/debug 2>/dev/null | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r' || echo "unavailable")
  PROD_RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" --max-time 5 $PROD_URL/api/health 2>/dev/null || echo "N/A")
  
  echo -e "${YELLOW}Production:${NC}"
  echo -e "  Status: $(get_status_color $PROD_STATUS)"
  echo -e "  Active Version: $(get_version_color $PROD_VERSION)"
  echo -e "  Response Time: ${PROD_RESPONSE_TIME}s"
  echo ""
  
  # KV State
  echo "KV Configuration:"
  ACTIVE_WORKER=$("$WRANGLER" kv:key get --binding=$MAINTENANCE_FLAGS_BINDING "active_worker" 2>/dev/null || echo "not set")
  echo -e "  Active Worker: $(get_version_color "$ACTIVE_WORKER")"
  
  TRAFFIC_SPLIT=$("$WRANGLER" kv:key get --binding=$MAINTENANCE_FLAGS_BINDING "traffic_split" 2>/dev/null || echo "none")
  if [ "$TRAFFIC_SPLIT" != "none" ] && [ ! -z "$TRAFFIC_SPLIT" ]; then
    echo -e "  Traffic Split: ${YELLOW}$TRAFFIC_SPLIT${NC}"
  else
    echo "  Traffic Split: none (100% to active worker)"
  fi
  
  MAINTENANCE_MODE=$("$WRANGLER" kv:key get --binding=$MAINTENANCE_FLAGS_BINDING "maintenance_mode" 2>/dev/null || echo "false")
  if [ "$MAINTENANCE_MODE" = "true" ]; then
    echo -e "  Maintenance Mode: ${RED}ENABLED${NC}"
  else
    echo -e "  Maintenance Mode: ${GREEN}disabled${NC}"
  fi
  
  echo ""
  echo "--- Refreshing in 5 seconds ---"
  sleep 5
done
