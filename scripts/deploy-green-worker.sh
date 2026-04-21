#!/bin/bash
# Green Worker 20250705 デプロイスクリプト
# Smart Router用動的TTL対応Worker

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WRANGLER="$SCRIPT_DIR/wrangler-with-token.sh"

echo "🚀 Green Worker 20250705 デプロイ開始..."

# 設定確認
CONFIG_FILE="wrangler-green-20250705.toml"
if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ エラー: $CONFIG_FILE が見つかりません"
    exit 1
fi

echo "📁 設定ファイル: $CONFIG_FILE"
echo "🔧 Worker: nico-ranking-green-20250705"

# WORKER_AUTH_KEY Secretの確認
echo ""
echo "🔐 セキュリティチェック..."
read -p "WORKER_AUTH_KEYをCloudflare Secretsに設定済みですか? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "⚠️  WORKER_AUTH_KEYの設定が必要です："
    echo "wrangler secret put WORKER_AUTH_KEY -c $CONFIG_FILE"
    echo ""
    read -p "今すぐ設定しますか? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        "$WRANGLER" secret put WORKER_AUTH_KEY -c "$CONFIG_FILE"
    else
        echo "❌ セキュリティ設定が未完了のため、デプロイを中止します"
        exit 1
    fi
fi

# デプロイ実行
echo ""
echo "🚀 Green Workerをデプロイ中..."
"$WRANGLER" deploy -c "$CONFIG_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Green Worker デプロイ完了！"
    echo ""
    echo "🔍 動作確認:"
    echo "curl -I https://nico-ranking-green-20250705.example.workers.dev/api/debug"
    echo ""
    echo "🔄 Smart Router切り替え（テスト用）:"
    echo "wrangler kv:key put --binding=MAINTENANCE_FLAGS \"active_worker\" \"green\""
    echo ""
    echo "🔙 ロールバック（緊急時）:"
    echo "wrangler kv:key put --binding=MAINTENANCE_FLAGS \"active_worker\" \"blue\""
    echo ""
    echo "📊 詳細な手順: DEPLOY_GREEN_20250705.md を参照"
else
    echo "❌ デプロイに失敗しました"
    exit 1
fi
