#!/bin/bash

# E2E用のサーバー起動スクリプト
export NODE_ENV=development
export E2E_TEST=true

# 環境変数をセット
export CLOUDFLARE_API_TOKEN=${CLOUDFLARE_API_TOKEN:-"dummy-token"}
export CLOUDFLARE_ACCOUNT_ID=${CLOUDFLARE_ACCOUNT_ID:-"dummy-account"}
export KV_RANKING_ID=${KV_RANKING_ID:-"dummy-ranking"}
export KV_METADATA_ID=${KV_METADATA_ID:-"dummy-metadata"}

# Next.jsサーバーを起動
npm run dev