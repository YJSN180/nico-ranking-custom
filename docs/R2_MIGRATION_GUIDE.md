# R2 Migration Guide

## 概要

Cloudflare KVの書き込み制限（1000回/日）を回避するため、段階的にR2へ移行します。

## フェーズ1: 即座に実装（KV最適化）

### 1.1 更新頻度の変更

```bash
# GitHub Actionsの更新頻度を30分から1時間に変更
# すでに実装済み: .github/workflows/update-ranking-parallel.yml
```

### 1.2 最適化されたWorkerのデプロイ

```bash
# Phase 1 Workerをデプロイ
source .env.local && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy workers/api-gateway-optimized.ts
```

### 1.3 パフォーマンステスト

```bash
# 現在のパフォーマンスを測定
npm run build
tsx scripts/performance-test.ts https://nico-rank.com

# 結果を記録して比較用に保存
```

## フェーズ2: 1週間以内（人気ジャンルをR2へ）

### 2.1 R2バケットの作成

```bash
# Cloudflareダッシュボードで実行:
# 1. R2へ移動
# 2. "Create bucket"をクリック
# 3. 名前: "nico-ranking"
# 4. リージョン: APAC（アジア太平洋）を選択
```

### 2.2 R2 API認証情報の作成

```bash
# Cloudflareダッシュボードで:
# 1. R2 > Overview > Manage R2 API tokens
# 2. "Create API token"
# 3. Permissions: "Object Read & Write"
# 4. TTL: 無期限
# 5. 作成後、Access Key IDとSecret Access Keyを保存
```

### 2.3 環境変数の設定

```bash
# .env.localに追加
R2_ACCESS_KEY_ID=your_access_key_id
R2_SECRET_ACCESS_KEY=your_secret_access_key

# GitHub Secretsにも追加
gh secret set R2_ACCESS_KEY_ID
gh secret set R2_SECRET_ACCESS_KEY
```

### 2.4 既存データの移行

```bash
# Phase 2移行スクリプトを実行
source .env.local && tsx scripts/write-to-r2.ts
```

### 2.5 GitHub Actionsの更新

```bash
# aggregate-ranking-results-direct.tsをaggregate-ranking-r2.tsに置き換え
# .github/workflows/update-ranking-parallel.ymlを編集
```

### 2.6 Phase 2 Workerのデプロイ

```bash
# R2バインディングを含むWorkerをデプロイ
source .env.local && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy -c wrangler-phase2.toml
```

### 2.7 動作確認

```bash
# パフォーマンステスト
tsx scripts/performance-test.ts https://nico-rank.com

# 人気ジャンルがR2から配信されていることを確認
curl -I https://nico-rank.com/api/ranking?genre=all | grep X-Data-Source
# Expected: X-Data-Source: r2-direct
```

## フェーズ3: 2週間以内（完全R2移行）

### 3.1 全データの移行

```bash
# Phase 3移行スクリプトを実行
source .env.local && tsx scripts/write-to-r2.ts
```

### 3.2 Phase 3 Workerのデプロイ

```bash
# 完全R2版Workerをデプロイ
source .env.local && CLOUDFLARE_API_TOKEN="$CLOUDFLARE_KV_API_TOKEN" wrangler deploy -c wrangler-phase3.toml
```

### 3.3 KVクリーンアップ

```bash
# 古いKVデータを削除（オプション）
# RANKING_GROUP_1, RANKING_GROUP_2, RANKING_GROUP_3を削除
# RANKING_METADATAは保持
```

## パフォーマンス目標

### Phase 1 (現在)
- レスポンスタイム: 100-300ms（キャッシュヒット時）
- KV書き込み: 72回/日（制限内）

### Phase 2
- レスポンスタイム: 50-150ms（R2直接アクセス）
- 人気ジャンル: R2から高速配信
- その他: KVから配信

### Phase 3
- レスポンスタイム: 30-100ms（全データR2）
- KV書き込み: 1回/時（メタデータのみ）
- スケーラビリティ: 無制限

## トラブルシューティング

### R2接続エラー
```bash
# R2認証情報を確認
wrangler r2 bucket list

# バケットの存在を確認
wrangler r2 bucket info nico-ranking-data
```

### パフォーマンス劣化
```bash
# キャッシュステータスを確認
curl -v https://nico-rank.com/api/ranking?genre=all | grep -E "X-Cache|X-Data-Source"

# Worker logsを確認
wrangler tail
```

### ロールバック手順
```bash
# 前のフェーズに戻す
wrangler deploy -c wrangler-phase1.toml  # Phase 1に戻す
wrangler deploy -c wrangler-phase2.toml  # Phase 2に戻す
```

## 監視項目

1. **KV書き込み数**: Cloudflareダッシュボード > Workers > KV
2. **R2使用量**: Cloudflareダッシュボード > R2 > Metrics
3. **レスポンスタイム**: scripts/performance-test.ts
4. **エラー率**: Worker Analytics

## セキュリティ考慮事項

- R2認証情報は環境変数でのみ管理
- R2バケットはプライベート設定を維持
- Workerからのみアクセス可能に設定