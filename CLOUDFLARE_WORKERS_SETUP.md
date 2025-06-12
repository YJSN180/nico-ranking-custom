# Cloudflare Workers セットアップガイド

このドキュメントでは、DDoS保護のためのCloudflare Workersのセットアップ方法を説明します。

## 前提条件

- Cloudflareアカウント
- 適切な権限を持つAPIトークン
- Node.js 20以上

## セットアップ手順

### 1. Wrangler CLIのインストール

```bash
npm install -D wrangler
```

### 2. Cloudflareへのログイン

```bash
npx wrangler login
```

ブラウザが開き、Cloudflareアカウントへのログインを求められます。

### 3. APIトークンの設定（CI/CD用）

環境変数として設定：

```bash
export CLOUDFLARE_API_TOKEN=your_api_token_here
```

### 4. Workers設定の確認

`wrangler.toml`ファイルの内容を確認：

```toml
name = "nico-ranking-api-gateway"
main = "workers/api-gateway.ts"
compatibility_date = "2024-01-01"
workers_dev = true

[vars]
NEXT_APP_URL = "https://nico-ranking-custom-yjsns-projects.vercel.app"

account_id = "<your-cloudflare-account-id>"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "c49751cf8c27464aac68cf030b9e0713"

[[kv_namespaces]]
binding = "RANKING_DATA"
id = "<your-kv-namespace-id>"
```

### 5. Workersのデプロイ

```bash
npm run deploy:worker
```

### 6. デプロイの確認

```bash
# ログの確認
npm run tail:worker

# Workers URLの確認
https://nico-ranking-api-gateway.<your-subdomain>.workers.dev
```

## 機能

### DDoS保護
- IPベースのレート制限
- バースト保護（10秒間に10リクエストまで）
- ボット検出と制限（1分間に5リクエスト）

### セキュリティヘッダー
- X-Content-Type-Options
- X-Frame-Options
- X-XSS-Protection
- Content-Security-Policy
- Referrer-Policy
- Permissions-Policy

### キャッシング
- 静的アセットの長期キャッシュ（1年）
- APIレスポンスのキャッシュ（30秒）
- Stale-while-revalidate戦略

### CORS設定
- Vercelアプリからのアクセスのみ許可
- 適切なプリフライトリクエスト処理

## トラブルシューティング

### デプロイエラー

1. **認証エラー**
   ```
   Authentication error [code: 10000]
   ```
   → APIトークンの権限を確認

2. **KVネームスペースエラー**
   ```
   KV namespace not found
   ```
   → wrangler.tomlのKV IDを確認

3. **ビルドエラー**
   ```
   Build failed
   ```
   → TypeScriptの構文エラーを確認

### デバッグ方法

1. **リアルタイムログ**
   ```bash
   npx wrangler tail
   ```

2. **ローカル開発**
   ```bash
   npm run dev:worker
   ```

3. **KVデータの確認**
   ```bash
   npx wrangler kv:key list --namespace-id=your_namespace_id
   ```

## 本番環境への適用

1. **カスタムドメインの設定**
   - Cloudflareダッシュボード → Workers → ルート
   - カスタムドメインを追加

2. **環境変数の更新**
   ```toml
   [vars]
   NEXT_APP_URL = "https://your-production-domain.com"
   ```

3. **ルートの設定**
   ```toml
   [[routes]]
   pattern = "api.your-domain.com/*"
   zone_name = "your-domain.com"
   ```

## メンテナンス

### レート制限の調整

`workers/api-gateway.ts`で設定を変更：

```typescript
const RATE_LIMIT_CONFIG = {
  general: { requests: 60, window: 60 },    // 調整可能
  burst: { requests: 10, window: 10 },      // 調整可能
  ranking: { requests: 20, window: 60 },    // 調整可能
  bot: { requests: 5, window: 60 }          // 調整可能
}
```

### モニタリング

- Cloudflareダッシュボード → Workers → 分析
- リクエスト数、エラー率、レスポンス時間を確認

## セキュリティ上の注意

1. **APIトークンの管理**
   - 必要最小限の権限のみ付与
   - 定期的にローテーション
   - 環境変数として管理

2. **アクセス制御**
   - NEXT_APP_URLを正確に設定
   - 不要なルートは公開しない

3. **ログの管理**
   - 個人情報を含まない
   - 適切な保持期間を設定