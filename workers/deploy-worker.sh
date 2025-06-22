#!/bin/bash

# デプロイ手順を表示
echo "======================================"
echo "Cloudflare Worker デプロイ準備完了"
echo "======================================"
echo ""
echo "Worker名: nico-ranking-api-gateway"
echo "Account ID: 5984977746a3dfcd71415bed5c324eb1"
echo "Script: api-gateway-r2.js"
echo ""
echo "デプロイするには、以下のコマンドを実行してください："
echo ""
echo "1. APIトークンを設定:"
echo "   export CLOUDFLARE_API_TOKEN=\"your_api_token_here\""
echo ""
echo "2. デプロイを実行:"
echo "   cd /home/hdyk/workspace/nico-ranking-new/workers"
echo "   wrangler deploy"
echo ""
echo "または、Cloudflareダッシュボードから手動でデプロイしてください。"
echo "詳細は deploy-instructions.md を参照してください。"
echo ""

# wrangler.toml の内容を確認
echo "wrangler.toml の内容:"
echo "---------------------"
cat wrangler.toml