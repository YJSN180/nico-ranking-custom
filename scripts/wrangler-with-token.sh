#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_VARS_FILE="${CLOUDFLARE_DEV_VARS_FILE:-$REPO_ROOT/.dev.vars}"

if [ -f "$DEV_VARS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$DEV_VARS_FILE"
  set +a
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set." >&2
  echo "Set it in $DEV_VARS_FILE or export it before running Wrangler." >&2
  exit 1
fi

cd "$REPO_ROOT"
WRANGLER_BIN="$REPO_ROOT/node_modules/.bin/wrangler"

if [ ! -x "$WRANGLER_BIN" ]; then
  echo "Error: local Wrangler binary not found. Run npm install first." >&2
  exit 1
fi

exec "$WRANGLER_BIN" "$@"
