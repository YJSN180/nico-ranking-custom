# ⚠️ 重要：セキュリティ設定が必要です

## 現在の問題

1. **Vercel URLへの直接アクセスが可能**
   - https://nico-ranking-custom-yjsns-projects.vercel.app
   - 誰でもCloudflare保護を回避してアクセス可能

2. **カスタムドメインが未設定**
   - nico-rank.com のDNS設定が未完了

## 必要な設定

### 1. Vercel環境変数の設定

Vercelダッシュボードで以下を追加：
```
WORKER_AUTH_KEY=nico-rank-secure-2025
```

### 2. Cloudflare DNS設定

1. https://dash.cloudflare.com にログイン
2. nico-rank.com を選択
3. DNS → Add record
   - Type: CNAME
   - Name: @ (ルートドメイン用)
   - Target: nico-ranking-api-gateway.yjsn180180.workers.dev
   - Proxy status: Proxied (オレンジ色の雲をON)

4. www用も追加
   - Type: CNAME
   - Name: www
   - Target: nico-ranking-api-gateway.yjsn180180.workers.dev
   - Proxy status: Proxied

### 3. 設定後の確認

- [ ] https://nico-rank.com が表示される
- [ ] https://www.nico-rank.com が表示される
- [ ] Vercel URLへの直接アクセスがリダイレクトされる

## セキュリティの仕組み

```
ユーザー → nico-rank.com → Cloudflare DNS
         ↓
    Cloudflare Workers (DDoS保護)
         ↓
    認証ヘッダー付きでVercelへ
         ↓
    Vercel (認証確認後にレスポンス)
```

この設定により、すべてのトラフィックがCloudflare経由となり、DDoS保護が有効になります。