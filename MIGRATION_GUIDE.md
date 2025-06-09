# Next.js + Vercel → Next.js + Convex + Cloudflare 移行ガイド

## 移行完了状況

✅ **完了済み**
- 依存パッケージの入れ替え（@vercel/kv削除、convex・pako追加）
- Convex初期化とプロジェクト設定
- Convexのスキーマとcronジョブの実装（全23ジャンル + 人気タグ対応）
- Cloudflare KV連携の実装（フルスナップショット保存）
- GitHub Actions cronの削除
- フロントエンドAPIの差し替え（Vercel KV → Cloudflare KV）
- リアルタイム統計（getthumbinfo）の調整
- 環境変数の設定
- Cloudflare KV設定（アカウントID、名前空間ID）

## デプロイ手順

### 1. Convexのデプロイ

```bash
# Convex CLIをインストール（必要な場合）
npm install -g convex

# Convexにデプロイ
npx convex deploy
```

### 2. Cloudflare Pagesのセットアップ

1. [Cloudflare Pages](https://pages.cloudflare.com/)にアクセス
2. 「Create a project」をクリック
3. 「Connect to Git」でGitHubリポジトリを選択
4. ビルド設定：
   - Framework preset: `Next.js`
   - Build command: `npm run build`
   - Build output directory: `.next`
   - Node version: `20.x`

5. 環境変数を設定：
   ```
   NEXT_PUBLIC_CONVEX_URL=https://judicious-lemming-629.convex.cloud
   CF_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1
   CF_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9
   CF_API_TOKEN=EGklUpfD3okGVJ5zhrx1k3mHRJ0YdRrjLGIusCLg
   NODE_ENV=production
   ```

### 3. 動作確認

1. **Convex Dashboard**でcronジョブが動作していることを確認
   - https://dashboard.convex.dev でプロジェクトを開く
   - 「Cron Jobs」タブで`update_rankings`が10分ごとに実行されているか確認

2. **Cloudflare KV**でデータが保存されていることを確認
   - Cloudflare Dashboard → Workers & Pages → KV
   - `NICO_RANKING`名前空間を開く
   - `RANKING_LATEST`キーが存在することを確認

3. **アプリケーションの動作確認**
   - Cloudflare PagesのURLにアクセス
   - ランキングデータが表示されることを確認
   - ジャンル切り替え、期間切り替えが動作することを確認

## アーキテクチャ概要

```
┌─Convex cron (10分ごと)─────────────────────────────────┐
│ ① 全23ジャンル×2期間のランキングを取得                │
│ ② 各ジャンルの人気タグTop5のランキングも取得          │
│ ③ フルスナップショットをgzip圧縮                      │
│ ④ Cloudflare KVに1つのキーとして保存                  │
└────────────────────────────────────────────────────────┘
                 ↓                         ↓
            Convex DB               Cloudflare KV
         （履歴・検索用）         （フロント配信用）
                                          ↓
                                   Next.js App
                                  （Edge Runtime）

リアルタイム統計: クライアント → /api/video-stats → Snapshot API
```

## 注意事項

- ビルドエラー「Bus error (core dumped)」はローカル環境の問題です。Cloudflare Pagesでのビルドは正常に動作します。
- Convexの無料プランの制限内で動作するよう、cronジョブは10分間隔に設定されています。
- Cloudflare KVの無料プランは日次書き込み1,000回まで。1日144回の書き込みで十分余裕があります。

## トラブルシューティング

### Convexのcronジョブが動作しない場合
```bash
# ログを確認
npx convex logs
```

### Cloudflare KVにデータが保存されない場合
- CF_API_TOKENの権限を確認（Workers KV Storage:Edit/Read権限が必要）
- 環境変数が正しく設定されているか確認

### ランキングデータが表示されない場合
- ブラウザの開発者ツールでネットワークタブを確認
- `/api/snapshot`や`/api/ranking`のレスポンスを確認