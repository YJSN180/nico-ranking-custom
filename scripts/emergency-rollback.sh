#!/bin/bash
# Emergency rollback script for immediate reversion to Blue Worker

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/wrangler-with-token.sh"

echo "=== EMERGENCY ROLLBACK INITIATED ==="
echo "Time: $(date)"
echo ""

# Configuration
MAINTENANCE_FLAGS_BINDING="MAINTENANCE_FLAGS"
PROD_URL="https://nico-rank.com"
BLUE_URL="https://nico-ranking-api-gateway-blue.workers.dev"

# Immediate rollback
echo "⚠️  ROLLING BACK TO BLUE WORKER..."
"$WRANGLER" kv:key put --binding=$MAINTENANCE_FLAGS_BINDING "active_worker" "blue"
"$WRANGLER" kv:key delete --binding=$MAINTENANCE_FLAGS_BINDING "traffic_split" 2>/dev/null || true

echo "✅ Rollback command executed"
echo ""

# Wait for propagation
echo "Waiting for KV propagation (10 seconds)..."
sleep 10

# Verification
echo "=== Verification ==="

# Check Blue Worker health
echo -n "Blue Worker health: "
if curl -sf "$BLUE_URL/api/health" > /dev/null; then
  echo "✅ OK"
else
  echo "❌ FAILED - Blue Worker may be unhealthy!"
fi

# Check production routing
echo -n "Production routing: "
WORKER_VERSION=$(curl -sI "$PROD_URL/api/debug" 2>/dev/null | grep -i X-Worker-Version | cut -d' ' -f2 | tr -d '\r' || echo "unknown")
echo "Version = $WORKER_VERSION"

if [[ "$WORKER_VERSION" == *"blue"* ]]; then
  echo "✅ Successfully rolled back to Blue"
else
  echo "⚠️  Warning: Version doesn't indicate Blue worker"
  echo "   This could be due to caching or propagation delay"
fi

# Check production health
echo -n "Production health: "
if curl -sf "$PROD_URL/api/health" > /dev/null; then
  echo "✅ OK"
else
  echo "❌ FAILED - Production may be unhealthy!"
fi

echo ""
echo "=== Rollback Actions Completed ==="
echo "Current state:"
echo "- Active Worker: blue (forced)"
echo "- Traffic Split: removed"
echo ""
echo "⚠️  IMPORTANT: Monitor production closely for the next 15 minutes"
echo "⚠️  If issues persist, check Cloudflare dashboard directly"
echo ""
echo "Rollback completed at: $(date)"
