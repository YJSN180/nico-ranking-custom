# 本番デプロイ手順書

## 🎯 目的
動的キャッシュ機能（5分/25分更新、動的TTL、ETag対応）を本番環境に反映する

## 📅 実施予定
- 日時: 2025年6月26日(水) 2:00-4:00 JST
- 所要時間: 最大2時間（通常30分程度）

## 🔄 デプロイフロー

### 事前準備（実施済み）
- [x] 開発Workerでの動作確認
- [x] ステージング環境での検証
- [x] メンテナンスWorkerの準備
- [x] ロールバック手順の確認

### Phase 1: メンテナンス開始（2:00）

```bash
# 1. 現在のWorkerをバックアップ
wrangler download nico-ranking-api-gateway \
  --output backups/$(date +%Y%m%d_%H%M%S)/

# 2. メンテナンスWorkerに切り替え
wrangler deploy workers/maintenance-worker.ts \
  --name nico-ranking-api-gateway

# 3. 動作確認
curl -I https://nico-rank.com/
# Expected: 503 Service Unavailable
```

### Phase 2: 新Workerデプロイ（2:10）

```bash
# 1. 本番用Workerをデプロイ（別名で）
wrangler deploy -c wrangler-prod.toml \
  --name nico-ranking-api-gateway-new

# 2. 直接URLで動作確認
./scripts/production-test.sh nico-ranking-api-gateway-new

# 3. 問題なければ本番に切り替え
wrangler deploy -c wrangler-prod.toml \
  --name nico-ranking-api-gateway
```

### Phase 3: 動作確認（2:30）

```bash
# 1. APIエンドポイントの確認
curl -I https://nico-rank.com/api/ranking?genre=all
# Check: Cache-Control, ETag, X-Data-Source

# 2. フロントエンドの確認
# ブラウザでhttps://nico-rank.com/にアクセス
# - ランキングが表示される
# - ジャンル切り替えが動作する
# - ページロードが高速

# 3. キャッシュ動作の確認
./scripts/cache-test.sh
```

### Phase 4: 完了またはロールバック（3:00）

#### ✅ 成功の場合
```bash
# 1. 古いWorkerの削除
wrangler delete nico-ranking-api-gateway-new

# 2. 完了連絡
echo "デプロイ完了: $(date)"
```

#### ❌ 問題がある場合（ロールバック）
```bash
# 1. バックアップから復元
cd backups/[最新のバックアップ]/
wrangler deploy index.js \
  --name nico-ranking-api-gateway \
  --compatibility-date 2024-09-23

# 2. 動作確認
curl -I https://nico-rank.com/api/ranking?genre=all
```

## 📊 監視項目

### リアルタイム監視
```bash
# Cloudflareダッシュボード
# Workers & Pages → nico-ranking-api-gateway → Analytics

# ログ監視
wrangler tail nico-ranking-api-gateway --format json
```

### チェックポイント
- [ ] HTTPステータス200が返る
- [ ] レスポンスタイム < 500ms
- [ ] Cache-Controlヘッダーが動的（300-1800秒）
- [ ] ETagが正しく生成される
- [ ] 304レスポンスが返る

## 🚨 緊急連絡先
- Cloudflareステータス: https://www.cloudflarestatus.com/
- 開発者連絡先: [あなたの連絡先]

## 📝 作業後の確認

### 翌日確認項目
1. R2への書き込み頻度（Cloudflareダッシュボード）
2. キャッシュヒット率
3. エラーログの有無
4. ユーザーからのフィードバック

### ドキュメント更新
- [ ] CHANGELOG.mdの更新
- [ ] README.mdの機能説明追加
- [ ] API仕様書の更新（該当する場合）