# Cloudflare Worker デプロイガイド

## 概要
本ドキュメントは、Cloudflare Workerの開発からデプロイまでの一般的な手順を説明します。

## 開発フロー

### 1. 開発環境での作業

#### ブランチ戦略
```bash
# 機能ブランチを作成
git checkout -b feature/[機能名]

# 例: 
git checkout -b feature/cache-optimization
```

#### ローカル開発
```bash
# 開発サーバー起動
npm run dev

# Workerのローカルテスト
wrangler dev workers/[worker-name].ts
```

### 2. ステージング環境での検証

#### ステージングWorkerのデプロイ
```bash
# 開発用Workerとしてデプロイ
wrangler deploy workers/[worker-name].ts \
  --name [worker-name]-dev

# 環境変数やシークレットの設定
wrangler secret put [SECRET_NAME] --name [worker-name]-dev
```

#### ステージングURLでの動作確認
```
https://[worker-name]-dev.[account-subdomain].workers.dev
```

### 3. 本番デプロイ戦略

#### A. 即時切り替え（小規模変更）
```bash
# 直接本番にデプロイ
wrangler deploy workers/[worker-name].ts \
  --name [production-worker-name]
```

#### B. Blue-Green デプロイ（推奨）
```bash
# 1. 新バージョンを別名でデプロイ
wrangler deploy workers/[worker-name].ts \
  --name [production-worker-name]-new

# 2. 動作確認後、本番に切り替え
wrangler deploy workers/[worker-name].ts \
  --name [production-worker-name]

# 3. 旧バージョンを削除
wrangler delete [production-worker-name]-new
```

#### C. メンテナンスウィンドウ方式（大規模変更）
```bash
# 1. メンテナンスWorkerに切り替え
wrangler deploy workers/maintenance-worker.ts \
  --name [production-worker-name]

# 2. 新バージョンをデプロイ
wrangler deploy workers/[worker-name].ts \
  --name [production-worker-name]
```

## 設定管理

### wrangler.toml の環境別設定
```toml
# 基本設定
name = "my-worker"
compatibility_date = "2024-09-23"

# 開発環境
[env.dev]
name = "my-worker-dev"
vars = { ENVIRONMENT = "development" }

# ステージング環境
[env.staging]
name = "my-worker-staging"
vars = { ENVIRONMENT = "staging" }

# 本番環境
[env.production]
name = "my-worker"
vars = { ENVIRONMENT = "production" }
```

### 環境別デプロイコマンド
```bash
# 開発環境
wrangler deploy --env dev

# ステージング環境
wrangler deploy --env staging

# 本番環境
wrangler deploy --env production
```

## バインディング設定

### KVネームスペース
```toml
[[kv_namespaces]]
binding = "KV_STORE"
id = "your-kv-namespace-id"
```

### R2バケット
```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-bucket-name"
```

### D1データベース
```toml
[[d1_databases]]
binding = "DB"
database_name = "your-database-name"
database_id = "your-database-id"
```

## 監視とロールバック

### ログ監視
```bash
# リアルタイムログ
wrangler tail [worker-name] --format json

# 特定の時間範囲
wrangler tail [worker-name] --since 2h --until 1h
```

### メトリクス確認
1. Cloudflareダッシュボード → Workers & Pages
2. 対象Workerを選択 → Analytics タブ
3. 確認項目：
   - リクエスト数
   - エラー率
   - レスポンスタイム
   - CPU使用時間

### ロールバック手順
```bash
# 1. 前バージョンのコードを取得
git checkout [previous-commit-hash]

# 2. 緊急デプロイ
wrangler deploy workers/[worker-name].ts \
  --name [production-worker-name]

# 3. または、バックアップから復元
wrangler deploy backups/[backup-file].js \
  --name [production-worker-name]
```

## ベストプラクティス

### 1. 命名規則
- 本番: `[service-name]-api-gateway`
- 開発: `[service-name]-api-gateway-dev`
- 日付付き: `[service-name]-api-gateway-20250625`

### 2. デプロイ前チェックリスト
- [ ] ユニットテスト実行
- [ ] 型チェック（TypeScript）
- [ ] Lintチェック
- [ ] ステージング環境での動作確認
- [ ] 環境変数・シークレットの確認
- [ ] バックアップの作成

### 3. セキュリティ考慮事項
- APIキーは必ず `wrangler secret` で管理
- CORS設定の確認
- レート制限の実装
- 入力値検証の徹底

### 4. パフォーマンス最適化
- Workers KVの適切な使用
- キャッシュ戦略の最適化
- 不要なサブリクエストの削減
- Response streamingの活用

## トラブルシューティング

### よくある問題

#### 1. デプロイエラー
```
Error: Authentication error
```
解決策：
```bash
export CLOUDFLARE_API_TOKEN="your-token"
```

#### 2. KV/R2アクセスエラー
```
Error: No such namespace
```
解決策：
- wrangler.tomlのバインディング設定確認
- namespace IDの確認

#### 3. ルーティングエラー
```
Error: Route pattern already exists
```
解決策：
- 既存のルート設定を確認
- 重複するパターンを削除

## 参考リンク
- [Cloudflare Workers ドキュメント](https://developers.cloudflare.com/workers/)
- [Wrangler CLI リファレンス](https://developers.cloudflare.com/workers/wrangler/)
- [Workers ベストプラクティス](https://developers.cloudflare.com/workers/platform/best-practices/)