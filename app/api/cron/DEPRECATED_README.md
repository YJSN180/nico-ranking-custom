# DEPRECATED - Vercel Cron

このディレクトリのCronエンドポイントは**非推奨**です。

現在はGitHub Actionsを使用してランキングデータを更新しています。

- **GitHub Actions**: `.github/workflows/update-ranking.yml` (毎時0分に実行)
- **更新スクリプト**: `scripts/update-ranking-kv.ts` → `lib/update-ranking.ts`

## 重複実行を防ぐための対策

1. `/api/cron/fetch` - Vercel Cronのスケジュール設定をコメントアウト済み
2. Vercelダッシュボードでcronジョブが設定されている場合は手動で削除してください

## エンドポイントを残している理由

- 手動テスト用
- 緊急時のバックアップ
- 後方互換性の維持