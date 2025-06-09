# Cloudflare Pages セットアップガイド

## 1. Cloudflare Pagesでプロジェクトを作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にログイン
2. 左側メニューから「Workers & Pages」を選択
3. 「Create application」→「Pages」→「Connect to Git」をクリック

## 2. GitHubリポジトリを連携

1. GitHubアカウントを認証
2. リポジトリ「YJSN180/nico-ranking-custom」を選択
3. 「Begin setup」をクリック

## 3. ビルド設定

以下の設定を入力：

- **Project name**: `nico-ranking`
- **Production branch**: `main`
- **Framework preset**: `Next.js`
- **Build command**: `npm run build`
- **Build output directory**: `.next`
- **Root directory**: `/`
- **Node version**: `20.x`

## 4. 環境変数の設定

「Environment variables」セクションで以下を追加：

```
NEXT_PUBLIC_CONVEX_URL = https://judicious-lemming-629.convex.cloud
CF_ACCOUNT_ID = 5984977746a3dfcd71415bed5c324eb1
CF_NAMESPACE_ID = 80f4535c379b4e8cb89ce6dbdb7d2dc9
CF_API_TOKEN = EGklUpfD3okGVJ5zhrx1k3mHRJ0YdRrjLGIusCLg
NODE_ENV = production
```

## 5. デプロイ

1. 「Save and Deploy」をクリック
2. 初回デプロイが開始されます（約3-5分）
3. デプロイ完了後、自動的にURLが発行されます

## 6. カスタムドメイン（オプション）

1. プロジェクトの「Custom domains」タブを開く
2. 「Set up a custom domain」をクリック
3. ドメインを入力して設定

## 7. デプロイ後の確認

### Convex Dashboard
- https://dashboard.convex.dev/d/judicious-lemming-629
- 「Functions」→「ranking:updateAllRankings」で実行状況を確認
- 「Cron Jobs」で10分ごとの実行を確認

### Cloudflare KV
- Cloudflare Dashboard → Workers & Pages → KV
- `NICO_RANKING`名前空間を開く
- `RANKING_LATEST`キーが存在し、更新されていることを確認

### アプリケーション
- Cloudflare PagesのURLにアクセス
- ランキングデータが表示されることを確認
- ジャンル切り替え、期間切り替えが動作することを確認

## トラブルシューティング

### ビルドエラーの場合
- ビルドログを確認
- 環境変数が正しく設定されているか確認

### データが表示されない場合
1. Convex Dashboardでcronジョブの実行ログを確認
2. Cloudflare KVでデータが存在するか確認
3. ブラウザの開発者ツールでAPIレスポンスを確認

### パフォーマンスの問題
- Cloudflare PagesのAnalyticsタブで確認
- Edge Runtimeのログを確認