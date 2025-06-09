# Cloudflare Pages デプロイメントチェックリスト

## 🚀 デプロイ前の確認

- [x] すべてのテストがパス (`npm run check:all`)
- [x] Convexの環境変数が設定済み
- [x] GitHubにコミット・プッシュ済み

## 📋 Cloudflare Pagesでのセットアップ

### 1. プロジェクト作成
- [ ] [Cloudflare Dashboard](https://dash.cloudflare.com/)にログイン
- [ ] Workers & Pages → Create application → Pages → Connect to Git
- [ ] GitHubリポジトリ `YJSN180/nico-ranking-custom` を選択

### 2. ビルド設定
```
Project name: nico-ranking
Production branch: feat/migrate-to-convex-cloudflare (マージ後は main に変更)
Framework preset: Next.js
Build command: npm run build
Build output directory: .next
Root directory: /
Node version: 20.x
```

### 3. 環境変数
```
NEXT_PUBLIC_CONVEX_URL = https://judicious-lemming-629.convex.cloud
CF_ACCOUNT_ID = 5984977746a3dfcd71415bed5c324eb1
CF_NAMESPACE_ID = 80f4535c379b4e8cb89ce6dbdb7d2dc9
CF_API_TOKEN = EGklUpfD3okGVJ5zhrx1k3mHRJ0YdRrjLGIusCLg
NODE_ENV = production
```

### 4. デプロイ実行
- [ ] "Save and Deploy" をクリック
- [ ] デプロイ完了を待つ（約3-5分）
- [ ] 発行されたURLをメモ: _____________________

## ✅ デプロイ後の確認

### 1. 基本動作確認
```bash
# デプロイされたURLで確認
PRODUCTION_URL=https://nico-ranking.pages.dev npm run verify:deployment
```

### 2. データ更新確認
```bash
# Convexとクラウドフレアの同期確認
npm run deploy:check
```

### 3. モニタリング確認
- [ ] [Convex Dashboard](https://dashboard.convex.dev/d/judicious-lemming-629)でcronジョブを確認
- [ ] Cloudflare KVで `RANKING_LATEST` キーの更新を確認
- [ ] GitHub Actionsでモニタリングジョブが動作していることを確認

## 🔧 トラブルシューティング

### ビルドエラーの場合
1. Cloudflare Pagesのビルドログを確認
2. 環境変数が正しく設定されているか確認
3. Node.jsバージョンが20.xに設定されているか確認

### データが表示されない場合
1. `npm run check:convex` でConvexの状態を確認
2. `npm run check:kv` でKVデータの鮮度を確認
3. ブラウザの開発者ツールでエラーを確認

### パフォーマンスの問題
1. Cloudflare PagesのAnalyticsタブを確認
2. Edge Runtimeのログを確認
3. KVの読み取り遅延を確認

## 📝 最終確認項目

- [ ] ホームページが正しく表示される
- [ ] ジャンル切り替えが動作する
- [ ] 期間切り替え（24時間/1時間）が動作する
- [ ] タグフィルタリングが動作する
- [ ] ページネーションが動作する
- [ ] 10分ごとにデータが更新される
- [ ] APIレスポンスが1秒以内

## 🎉 デプロイ完了後

1. PRを作成してmainブランチにマージ
2. Production branchを `main` に変更
3. 本番環境のモニタリングを継続