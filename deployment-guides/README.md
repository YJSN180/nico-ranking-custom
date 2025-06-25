# デプロイメントドキュメント

このディレクトリには、Cloudflare Workerのデプロイに関するドキュメントが含まれています。

## ドキュメント一覧

### 一般的なガイド
- [WORKER_DEPLOYMENT_GUIDE.md](./WORKER_DEPLOYMENT_GUIDE.md) - Cloudflare Workerの一般的なデプロイ手順

### 特定のデプロイメント記録
- [DYNAMIC_CACHE_DEPLOYMENT_20250625.md](./DYNAMIC_CACHE_DEPLOYMENT_20250625.md) - 動的キャッシュ機能の本番デプロイ手順（2025年6月25日）

## 新しいデプロイメントの記録方法

新しい大規模なデプロイメントを行う際は、以下の命名規則でドキュメントを作成してください：

```
[機能名]_DEPLOYMENT_[YYYYMMDD].md
```

例：
- `RATE_LIMITING_DEPLOYMENT_20250701.md`
- `API_V2_MIGRATION_DEPLOYMENT_20250715.md`

## テンプレート

新しいデプロイメント記録を作成する際は、既存のドキュメントを参考にしてください。
主な記載項目：
- 目的と変更内容
- 実施予定日時
- 事前準備
- デプロイ手順（フェーズ別）
- 動作確認項目
- ロールバック手順
- 監視項目
- 緊急連絡先