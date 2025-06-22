#!/bin/bash

# バックアップを作成
echo "Creating backup of original index.js..."
cp src/index.js src/index-backup.js

# 修正版を適用
echo "Applying fixed version..."
cp src/index-fixed.js src/index.js

echo "Fixed version applied!"
echo ""
echo "To deploy the fixed Worker, run:"
echo "  export CLOUDFLARE_API_TOKEN='your-api-token'"
echo "  npm run deploy"
echo ""
echo "To restore the original version, run:"
echo "  cp src/index-backup.js src/index.js"