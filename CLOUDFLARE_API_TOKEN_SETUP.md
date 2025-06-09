# Cloudflare Pages API トークン設定ガイド

## 必要な権限

Cloudflare PagesプロジェクトをAPIで作成・管理するには、以下の権限を持つAPIトークンが必要です：

### 1. 新しいAPIトークンの作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)にログイン
2. 「Create Token」をクリック
3. 「Custom token」を選択して「Get started」

### 2. トークン権限の設定

以下の権限を設定してください：

#### Account権限
- **Account:Cloudflare Pages:Edit** - Pagesプロジェクトの作成・編集に必要
- **Account:Workers KV Storage:Edit** - KV操作に必要（既存のトークンがある場合）

#### Zone権限（オプション）
- カスタムドメインを使用する場合は、該当ゾーンへのアクセスも必要

### 3. Account Resources
- 「Include」→「Specific accounts」→ あなたのアカウント（5984977746a3dfcd71415bed5c324eb1）を選択

### 4. その他の設定
- **TTL**: 必要に応じて有効期限を設定（推奨：1年）
- **IP Address Filtering**: セキュリティのため、必要に応じて設定

### 5. トークンの作成と保存
1. 「Continue to summary」→「Create Token」
2. 表示されたトークンを安全に保存（一度しか表示されません）

## 権限の確認方法

作成したトークンが正しい権限を持っているか確認：

```bash
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer YOUR_API_TOKEN" \
     -H "Content-Type:application/json"
```

成功すると以下のようなレスポンスが返ります：
```json
{
  "success": true,
  "result": {
    "id": "token-id",
    "status": "active"
  }
}
```

## トークンの使用

1. `.env.local`に新しいトークンを設定：
```
CF_API_TOKEN_PAGES=your-new-token-here
```

2. Cloudflare Pagesの環境変数にも同じトークンを設定

## セキュリティ注意事項

- APIトークンは決してGitHubにコミットしない
- 環境変数として安全に管理する
- 定期的にトークンをローテーションする
- 不要になったトークンは削除する

## 必要な権限まとめ

| リソース | 権限 | 説明 |
|---------|------|------|
| Account:Cloudflare Pages | Edit | Pagesプロジェクトの作成・管理 |
| Account:Workers KV Storage | Edit | KVストレージへのアクセス |
| Zone (オプション) | Edit | カスタムドメインの設定 |