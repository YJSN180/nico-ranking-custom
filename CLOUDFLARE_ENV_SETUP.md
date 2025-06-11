# Cloudflare 環境変数設定ガイド

このドキュメントでは、Cloudflare KVと連携するために必要な環境変数の設定方法を説明します。

## 必要な環境変数

以下の環境変数をVercelダッシュボードで設定する必要があります：

### Cloudflare KV設定

```bash
# Cloudflareアカウント情報
CLOUDFLARE_ACCOUNT_ID=5984977746a3dfcd71415bed5c324eb1

# メインのKVネームスペース（ランキングデータ保存用）
CLOUDFLARE_KV_NAMESPACE_ID=80f4535c379b4e8cb89ce6dbdb7d2dc9

# レート制限用のKVネームスペース
RATE_LIMIT_NAMESPACE_ID=c49751cf8c27464aac68cf030b9e0713

# Cloudflare API トークン
CLOUDFLARE_KV_API_TOKEN=ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj
```

## Vercelでの設定手順

1. **Vercelダッシュボードにアクセス**
   - https://vercel.com にログイン
   - プロジェクト「nico-ranking-custom」を選択

2. **Settings → Environment Variables に移動**

3. **各環境変数を追加**
   - Key: 上記の環境変数名
   - Value: 対応する値
   - Environment: Production, Preview, Development すべてにチェック

4. **保存後、再デプロイ**
   - 環境変数の変更を反映させるため、最新のコミットを再デプロイ

## GitHub Secretsの設定

GitHub Actionsでも同じ環境変数が必要です：

1. **リポジトリのSettings → Secrets and variables → Actions**

2. **New repository secret** で以下を追加：
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_KV_NAMESPACE_ID`
   - `CLOUDFLARE_KV_API_TOKEN`
   - `RATE_LIMIT_NAMESPACE_ID`

## 確認方法

設定が正しく行われているか確認：

```bash
# ローカルで確認（.env.localファイルを作成後）
npm run dev

# APIエンドポイントで確認
curl https://your-app.vercel.app/api/status
```

## セキュリティ上の注意

- **APIトークンは絶対に公開しない**
- **環境変数は暗号化されて保存される**
- **必要最小限の権限のみを付与したトークンを使用**

## トラブルシューティング

### エラー: "KV namespace not found"
→ `CLOUDFLARE_KV_NAMESPACE_ID` が正しく設定されているか確認

### エラー: "Authentication failed"
→ `CLOUDFLARE_KV_API_TOKEN` が有効か確認

### エラー: "Rate limit namespace not found"
→ `RATE_LIMIT_NAMESPACE_ID` が正しく設定されているか確認