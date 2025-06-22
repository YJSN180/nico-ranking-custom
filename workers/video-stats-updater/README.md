# Video Stats Updater Worker

Cloudflare Workerで動画統計情報を2分間隔で更新するシステム。

## 機能

- R2からランキングデータを読み取り
- ニコニコSnapshot APIから動画統計を取得
- KVに統計情報を保存（キー: `VIDEO_STATS_LATEST`）
- 2分間隔でCron Triggerにより自動実行

## セットアップ

### 1. 依存関係のインストール

```bash
cd workers/video-stats-updater
npm install
```

### 2. シークレットの設定

Snapshot APIキーが必要な場合：

```bash
wrangler secret put SNAPSHOT_API_KEY
# プロンプトでAPIキーを入力
```

### 3. テストの実行

```bash
# すべてのテストを実行
npm test

# ウォッチモードでテスト
npm run test:watch

# カバレッジレポート付きでテスト
npm run test:coverage
```

### 4. ローカル開発

```bash
# ローカルでWorkerを起動（Cron Triggerはシミュレート）
npm run dev
```

### 5. デプロイ

```bash
# 本番環境へのデプロイ
npm run deploy

# ステージング環境へのデプロイ
wrangler deploy --env staging
```

## アーキテクチャ

詳細は[ARCHITECTURE.md](./ARCHITECTURE.md)を参照。

## トラブルシューティング

### ログの確認

```bash
# リアルタイムログ
wrangler tail

# Cloudflareダッシュボードでもログを確認可能
```

### KVデータの確認

```bash
# KVの値を確認
wrangler kv:key get --namespace-id=80f4535c379b4e8cb89ce6dbdb7d2dc9 VIDEO_STATS_LATEST
```

### 手動実行

Cron Triggerを待たずに手動で実行する場合：

```bash
# テスト用のスクリプトを作成して実行
node test-trigger.js
```

## 監視

- Cloudflareダッシュボードで実行回数とエラーを監視
- KVの書き込み回数を確認（無料枠: 1,000回/日）

## 移行チェックリスト

- [ ] Worker本体のデプロイ
- [ ] フロントエンドのKV読み取り確認
- [ ] 数時間の動作確認
- [ ] GitHub Actionsワークフローの無効化
- [ ] 不要なGitHub Actions関連ファイルの削除