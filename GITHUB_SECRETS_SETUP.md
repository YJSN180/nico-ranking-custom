# GitHub Secrets設定ガイド

GitHub Actionsで自動更新を有効化するために、以下のシークレットを設定してください。

## 設定手順

1. GitHubリポジトリページを開く
2. **Settings** タブをクリック
3. 左メニューの **Secrets and variables** → **Actions** を選択
4. **New repository secret** ボタンをクリック
5. 以下の各シークレットを追加

## 必要なシークレット

### Cloudflare KV関連

| Name | Value |
|------|-------|
| `CLOUDFLARE_ACCOUNT_ID` | `5984977746a3dfcd71415bed5c324eb1` |
| `CLOUDFLARE_KV_NAMESPACE_ID` | `80f4535c379b4e8cb89ce6dbdb7d2dc9` |
| `CLOUDFLARE_KV_API_TOKEN` | `ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj` |

### Vercel KV関連（NGリスト取得用）

| Name | Value |
|------|-------|
| `KV_REST_API_URL` | `https://gentle-camel-16074.upstash.io` |
| `KV_REST_API_TOKEN` | `AT7KAAIjcDE0NzM1NDBhYTEyMWY0ODM3OWQ0NmNlZTcyMmE4NWZmN3AxMA` |

### 認証関連

| Name | Value |
|------|-------|
| `CRON_SECRET` | `your_cron_secret` |

## 確認方法

1. すべてのシークレットを追加後、Actionsタブを開く
2. **Update Nico Ranking Data** ワークフローを選択
3. **Run workflow** → **Run workflow** をクリック
4. 実行が成功することを確認

## セキュリティに関する注意

- これらのシークレットは機密情報です
- リポジトリがパブリックの場合でも、シークレットは非公開です
- フォークされたリポジトリにはシークレットはコピーされません

## トラブルシューティング

### ワークフローが失敗する場合

1. シークレット名が正確に一致しているか確認
2. 値に余分なスペースが含まれていないか確認
3. Actions → 失敗したワークフロー → ログを確認

### 権限エラーが出る場合

Cloudflare APIトークンの権限を確認：
- Account:Workers KV Storage:Read
- Account:Workers KV Storage:Write