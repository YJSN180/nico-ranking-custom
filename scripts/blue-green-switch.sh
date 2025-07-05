#!/bin/bash
# Blue to Green migration script with progressive traffic split

set -e

echo "=== Blue to Green Migration Script ==="
echo "Starting at: $(date)"
echo ""

# Configuration
MAINTENANCE_FLAGS_BINDING="MAINTENANCE_FLAGS"
PROD_URL="https://nico-rank.com"
BLUE_URL="https://nico-ranking-api-gateway-blue.workers.dev"
GREEN_URL="https://nico-ranking-api-gateway-green.workers.dev"

# Function to check health
check_health() {
  local url=$1
  local name=$2
  
  echo -n "Checking $name health... "
  if curl -sf "$url/api/health" > /dev/null; then
    echo "✅ OK"
    return 0
  else
    echo "❌ FAILED"
    return 1
  fi
}

# Function to monitor error rate
monitor_metrics() {
  local duration=$1
  echo "Monitoring for $duration seconds..."
  
  local end_time=$(($(date +%s) + duration))
  while [ $(date +%s) -lt $end_time ]; do
    echo -n "."
    sleep 5
  done
  echo ""
}

# Pre-flight checks
echo "=== Pre-flight Checks ==="
check_health "$BLUE_URL" "Blue Worker" || exit 1
check_health "$GREEN_URL" "Green Worker" || exit 1
check_health "$PROD_URL" "Production" || exit 1
echo ""

# Current state
echo "=== Current State ==="
CURRENT_ACTIVE=$(wrangler kv:key get --binding=$MAINTENANCE_FLAGS_BINDING "active_worker" || echo "blue")
echo "Active Worker: $CURRENT_ACTIVE"
CURRENT_TRAFFIC=$(wrangler kv:key get --binding=$MAINTENANCE_FLAGS_BINDING "traffic_split" || echo "none")
echo "Traffic Split: $CURRENT_TRAFFIC"
echo ""

# Migration stages
STAGES=(10 25 50 100)

echo "=== Migration Plan ==="
echo "This will migrate traffic from Blue to Green in the following stages:"
for stage in "${STAGES[@]}"; do
  echo "  - Stage: $stage% to Green"
done
echo ""

read -p "Continue with migration? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Migration cancelled."
  exit 0
fi

# Progressive migration
for stage in "${STAGES[@]}"; do
  echo ""
  echo "=== Stage: $stage% Traffic to Green ==="
  
  if [ $stage -eq 100 ]; then
    # Final stage - full cutover
    echo "Switching to 100% Green..."
    wrangler kv:key put --binding=$MAINTENANCE_FLAGS_BINDING "active_worker" "green"
    wrangler kv:key delete --binding=$MAINTENANCE_FLAGS_BINDING "traffic_split"
    echo "✅ Full cutover completed!"
  else
    # Partial traffic split
    REMAINING=$((100 - stage))
    echo "Setting traffic split: Blue=$REMAINING%, Green=$stage%"
    wrangler kv:key put --binding=$MAINTENANCE_FLAGS_BINDING "traffic_split" \
      "{\"blue\": $REMAINING, \"green\": $stage}"
  fi
  
  # Wait for propagation
  echo "Waiting for KV propagation (10 seconds)..."
  sleep 10
  
  # Verify routing
  echo -n "Verifying routing... "
  WORKER_VERSION=$(curl -sI "$PROD_URL/api/debug" | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r')
  echo "Active: $WORKER_VERSION"
  
  # Monitor metrics
  if [ $stage -lt 100 ]; then
    monitor_metrics 300  # 5 minutes
    
    # Health check
    echo "Post-stage health checks:"
    check_health "$PROD_URL" "Production"
    
    # Continue prompt
    echo ""
    read -p "Continue to next stage? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Migration paused at $stage%"
      echo "Run emergency-rollback.sh to revert if needed."
      exit 0
    fi
  fi
done

# Final verification
echo ""
echo "=== Migration Complete ==="
echo "Final verification:"
check_health "$PROD_URL" "Production"
FINAL_VERSION=$(curl -sI "$PROD_URL/api/debug" | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r')
echo "Active Worker Version: $FINAL_VERSION"
echo ""
echo "✅ Blue to Green migration completed successfully!"
echo "Completed at: $(date)"