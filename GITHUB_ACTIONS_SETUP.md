# GitHub Actions セットアップガイド

## 概要
ConvexからGitHub Actions + Cloudflare KVへの移行により、無料でランキングデータの自動更新を実現します。

## 必要なシークレットの設定

GitHub リポジトリの Settings → Secrets and variables → Actions から以下のシークレットを追加してください：

### 1. Cloudflare KV関連
- `CLOUDFLARE_ACCOUNT_ID`: `5984977746a3dfcd71415bed5c324eb1`
- `CLOUDFLARE_KV_NAMESPACE_ID`: `80f4535c379b4e8cb89ce6dbdb7d2dc9`
- `CLOUDFLARE_KV_API_TOKEN`: `ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj`

### 2. Vercel KV関連（NGリスト取得用）
- `KV_REST_API_URL`: `https://gentle-camel-16074.upstash.io`
- `KV_REST_API_TOKEN`: `AT7KAAIjcDE0NzM1NDBhYTEyMWY0ODM3OWQ0NmNlZTcyMmE4NWZmN3AxMA`

## ワークフローの動作

1. **実行間隔**: 10分ごと（cronで設定）
2. **処理内容**:
   - Vercel KVからNGリストを取得
   - 23ジャンル × 2期間 × 500件 + 人気タグのデータを取得
   - NGフィルタリングを適用して500件を確保
   - Cloudflare KVに圧縮して保存

## 手動実行方法

GitHub ActionsのActionsタブから手動実行も可能：
1. リポジトリのActionsタブを開く
2. "Update Nico Ranking Data"を選択
3. "Run workflow"ボタンをクリック

## ログの確認

実行ログはGitHub Actionsから確認できます：
- 成功/失敗の状態
- 処理時間
- 更新されたジャンル数
- 総アイテム数

## トラブルシューティング

### エラーが発生した場合
1. Actions → 失敗したワークフローをクリック
2. 詳細なエラーログを確認
3. シークレットが正しく設定されているか確認

### よくある問題
- **403エラー**: Cloudflare APIトークンの権限不足
- **タイムアウト**: 30分の制限時間を超過（通常は発生しない）
- **NGリスト取得エラー**: Vercel KVの認証情報を確認

## Convexの削除

移行が完了したら、以下を削除できます：
1. `convex/`ディレクトリ
2. `convex.json`
3. package.jsonから`convex`依存関係
4. Convexプロジェクトの削除（ダッシュボードから）

## コスト削減効果

- **Before**: Convex有料プラン必要（月額$25〜）
- **After**: 完全無料
  - GitHub Actions: パブリックリポジトリは無料
  - Cloudflare KV: 無料枠で十分（1GB storage, 1000 writes/day）