#!/usr/bin/env bash
# Read-only public ranking health probe. Node 20+ and curl are required.
set -euo pipefail

health_check() {
  local name="$1" base_url="$2" body
  body=$(mktemp)
  # Clean up on HTTP/network failure as well as malformed or empty JSON.
  if ! curl --fail --silent --show-error --location \
      --connect-timeout 10 --max-time 30 \
      "${base_url%/}/api/ranking?genre=all&period=24h" -o "$body"; then
    rm -f "$body"
    echo "FAILED: $name ranking HTTP/network check" >&2
    return 1
  fi
  local result=0
  node --input-type=commonjs - "$body" <<'JS' || result=$?
const fs = require('node:fs')
try {
  const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  if (!Array.isArray(payload.items) || payload.items.length === 0 ||
      payload.items.some(item => !item || typeof item.id !== 'string' || !item.id ||
        typeof item.title !== 'string' || !item.title.trim())) {
    throw new Error('ranking items must contain video IDs and titles')
  }
  console.log(`OK: ranking contains ${payload.items.length} videos`)
} catch {
  console.error('FAILED: ranking response is invalid, empty, or missing video IDs/titles')
  process.exitCode = 1
}
JS
  rm -f "$body"
  return "$result"
}

# Override is for an explicit preview or loopback fixture; no credentials needed.
case "${1:-}" in
  prod) health_check "Production" "${HEALTH_CHECK_BASE_URL:-https://nico-rank.com}" ;;
  blue|green)
    # Worker endpoints are deployment-specific; do not guess a workers.dev hostname.
    if [ -z "${HEALTH_CHECK_BASE_URL:-}" ]; then
      echo "Set HEALTH_CHECK_BASE_URL to the verified $1 Worker URL" >&2
      exit 2
    fi
    health_check "$1 Worker" "$HEALTH_CHECK_BASE_URL"
    ;;
  all)
    # Explicit URLs avoid probing stale/guessed Worker deployments.
    : "${HEALTH_CHECK_BLUE_URL:?Set the verified Blue Worker URL}"
    : "${HEALTH_CHECK_GREEN_URL:?Set the verified Green Worker URL}"
    health_check "Blue Worker" "$HEALTH_CHECK_BLUE_URL"
    health_check "Green Worker" "$HEALTH_CHECK_GREEN_URL"
    health_check "Production" "${HEALTH_CHECK_BASE_URL:-https://nico-rank.com}"
    ;;
  *)
    echo "Usage: $0 prod|blue|green|all (optional HEALTH_CHECK_BASE_URL)" >&2
    exit 2
    ;;
esac
