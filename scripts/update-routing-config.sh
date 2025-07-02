#!/bin/bash
# Update KV routing configuration for version-based routing

set -euo pipefail

# Check if CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] || [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID must be set"
  exit 1
fi

# KV namespace ID for MAINTENANCE_FLAGS
KV_NAMESPACE_ID="19c56f381658417397c0b19320167a26"

# Define routing configuration
ROUTING_CONFIG='{
  "default": "v1-stable",
  "canary_percentage": 0,
  "rules": [],
  "feature_flags": {
    "html_decode": "v1-stable"
  }
}'

echo "Updating routing configuration in KV..."
echo "Configuration: $ROUTING_CONFIG"

# Update KV using Cloudflare API
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/routing_config" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$ROUTING_CONFIG"

echo ""
echo "✅ Routing configuration updated successfully"

# Also update active_worker for backward compatibility
echo ""
echo "Updating active_worker for backward compatibility..."
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/active_worker" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data "green"

echo ""
echo "✅ Active worker set to 'green' for backward compatibility"
echo ""
echo "Current routing configuration:"
echo "- Default: v1-stable (Green Worker with HTML decode)"
echo "- Canary: 0% (no canary traffic)"
echo "- Feature flags: html_decode=v1-stable"