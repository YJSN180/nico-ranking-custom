#!/bin/bash
set -euo pipefail
# R2バケットのセットアップスクリプト

echo "🚀 R2バケットのセットアップを開始します..."

# 1. R2バケットの作成
echo "📦 R2バケットを作成中..."
if wrangler r2 bucket list | grep -qw "nico-ranking"; then
  echo "✓ バケットは既に存在します"
else
  wrangler r2 bucket create nico-ranking
fi

# 2. CORS設定（パブリックアクセス用）
echo "🔧 CORS設定を適用中..."
cat > cors-config.json << 'EOF'
[
  {
    "AllowedOrigins": ["https://nico-rank.com", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
EOF

wrangler r2 bucket cors put nico-ranking --rules @cors-config.json
rm cors-config.json

echo "✅ R2バケットのセットアップが完了しました"
echo ""
echo "📝 次のステップ:"
echo "1. Cloudflareダッシュボードで R2 > Overview > Manage R2 API tokens"
echo "2. 'Create API token' をクリック"
echo "3. Permissions: 'Object Read & Write'"
echo "4. TTL: 無期限"
echo "5. Access Key IDとSecret Access Keyを保存"
echo ""
echo "6. .env.localに追加:"
echo "   R2_ACCESS_KEY_ID=your_access_key_id"
echo "   R2_SECRET_ACCESS_KEY=your_secret_access_key"
echo ""
echo "7. GitHub Secretsに追加:"
echo "   gh secret set R2_ACCESS_KEY_ID"
echo "   gh secret set R2_SECRET_ACCESS_KEY"