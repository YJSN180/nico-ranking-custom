#!/bin/bash

# Vercel環境変数設定スクリプト
# 注意: 事前に `vercel login` でログインしてください

echo "Setting Cloudflare environment variables in Vercel..."

# プロジェクトを選択
echo "Selecting project: nico-ranking-custom"

# 環境変数を設定
vercel env add CLOUDFLARE_ACCOUNT_ID production preview development <<< "5984977746a3dfcd71415bed5c324eb1"
vercel env add CLOUDFLARE_KV_NAMESPACE_ID production preview development <<< "80f4535c379b4e8cb89ce6dbdb7d2dc9"
vercel env add CLOUDFLARE_KV_API_TOKEN production preview development <<< "ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj"
vercel env add RATE_LIMIT_NAMESPACE_ID production preview development <<< "c49751cf8c27464aac68cf030b9e0713"

echo "Environment variables have been set successfully!"
echo "Please redeploy your application to apply the changes."