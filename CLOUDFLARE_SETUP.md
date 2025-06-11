# Cloudflare セットアップガイド

このガイドでは、Nico Ranking Re:turnをCloudflareで保護し、DDoS攻撃から守るための設定手順を説明します。

## 前提条件

- Cloudflareアカウント（無料プランでOK）
- ドメイン名
- Vercelにデプロイ済みのアプリケーション

## 1. Cloudflareアカウントとドメイン設定

### 1.1 ドメインをCloudflareに追加

1. [Cloudflareダッシュボード](https://dash.cloudflare.com/)にログイン
2. 「サイトを追加」をクリック
3. ドメイン名を入力（例: `nico-ranking.com`）
4. 無料プランを選択
5. DNSレコードをスキャン

### 1.2 DNSレコードの設定

```
Type: CNAME
Name: @ (またはwww)
Target: cname.vercel-dns.com
Proxy status: Proxied (オレンジ色の雲をON)
TTL: Auto
```

### 1.3 ネームサーバーの変更

Cloudflareが提供するネームサーバーをドメインレジストラで設定：
- 例: `xxx.ns.cloudflare.com`
- 例: `yyy.ns.cloudflare.com`

## 2. Cloudflare KVの設定

### 2.1 KV Namespaceの作成

```bash
# Wranglerをインストール
npm install -g wrangler

# Cloudflareにログイン
wrangler login

# KV Namespaceを作成
wrangler kv:namespace create "RANKING_DATA"
wrangler kv:namespace create "RATE_LIMIT"
```

### 2.2 Namespace IDをメモ

作成時に表示されるIDを保存：
```
🌀 Creating namespace with title "nico-ranking-RANKING_DATA"
✨ Success!
Add the following to your configuration file:
kv_namespaces = [
  { binding = "RANKING_DATA", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
]
```

## 3. Cloudflare Workersのデプロイ

### 3.1 wrangler.tomlの更新

```toml
name = "nico-ranking-api-gateway"
main = "workers/api-gateway.ts"
compatibility_date = "2024-01-01"

[vars]
NEXT_APP_URL = "https://your-app.vercel.app"

[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "your_rate_limit_namespace_id"

[[kv_namespaces]]
binding = "RANKING_DATA"
id = "your_ranking_data_namespace_id"
```

### 3.2 Workerのデプロイ

```bash
# Workerをデプロイ
wrangler deploy

# デプロイ確認
wrangler tail
```

### 3.3 ルートの設定

Cloudflareダッシュボード → Workers & Pages → 該当Worker → Settings → Triggers：

```
Route: yourdomain.com/*
Zone: yourdomain.com
```

## 4. セキュリティ設定

### 4.1 DDoS保護

Security → DDoS:
- **Protection level**: High
- **Sensitivity**: High

### 4.2 WAF (Web Application Firewall)

Security → WAF → Managed rules:
- **Cloudflare Managed Ruleset**: ON
- **Cloudflare OWASP Core Ruleset**: ON

### 4.3 レート制限ルール

Security → WAF → Rate limiting rules → Create rule:

#### ルール1: API保護
```
If incoming requests match:
- URI Path contains "/api/"
Then:
- Block for 10 minutes
When rate exceeds:
- 20 requests per 1 minute
```

#### ルール2: 一般的な保護
```
If incoming requests match:
- All incoming requests
Then:
- Challenge
When rate exceeds:
- 100 requests per 1 minute
```

### 4.4 ボット対策

Security → Bots:
- **Bot Fight Mode**: ON
- **Challenge Passage**: 30 minutes
- **JavaScript Detections**: ON

## 5. パフォーマンス最適化

### 5.1 キャッシング

Caching → Configuration:
- **Caching Level**: Standard
- **Browser Cache TTL**: 4 hours
- **Always Online**: ON

### 5.2 自動最適化

Speed → Optimization:
- **Auto Minify**: JavaScript, CSS, HTML全てON
- **Brotli**: ON
- **Rocket Loader**: ON
- **HTTP/2**: ON
- **HTTP/3 (with QUIC)**: ON

### 5.3 画像最適化

Speed → Optimization → Images:
- **Polish**: Lossy
- **WebP**: ON

## 6. 環境変数の設定

### 6.1 Vercel側の設定

Vercelダッシュボード → Settings → Environment Variables:

```bash
# Cloudflare KV
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_KV_NAMESPACE_ID=your_ranking_data_namespace_id
CLOUDFLARE_KV_API_TOKEN=your_api_token

# 既存の設定はそのまま維持
KV_REST_API_URL=xxx
KV_REST_API_TOKEN=xxx
```

### 6.2 GitHub Secretsの設定

GitHub → Settings → Secrets and variables → Actions:

```bash
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_KV_NAMESPACE_ID=your_ranking_data_namespace_id
CLOUDFLARE_KV_API_TOKEN=your_api_token
```

## 7. 動作確認

### 7.1 Cloudflare Workers

```bash
# ログを確認
wrangler tail

# KVの中身を確認
wrangler kv:key list --namespace-id=your_namespace_id
```

### 7.2 セキュリティテスト

```bash
# レート制限テスト
for i in {1..30}; do curl -I https://yourdomain.com/api/ranking; done

# DDoSシミュレーション（軽度）
ab -n 1000 -c 100 https://yourdomain.com/
```

### 7.3 キャッシュ確認

Developer Tools → Network → Response Headers:
- `CF-Cache-Status: HIT` が表示されることを確認
- `CF-Ray` ヘッダーが存在することを確認

## 8. 監視とアラート

### 8.1 Cloudflare Analytics

Analytics → Traffic:
- リクエスト数
- 帯域使用量
- 脅威のブロック数

### 8.2 アラートの設定

Notifications → Create:
- **DDoS Attack**: L7 DDoS攻撃検出時
- **Rate Limit**: レート制限発動時
- **Origin Error**: オリジンサーバーエラー時

## トラブルシューティング

### 問題: 502 Bad Gateway

原因: WorkerからVercelへの接続エラー
解決策:
1. `NEXT_APP_URL`が正しいか確認
2. Vercelアプリが動作しているか確認

### 問題: レート制限が効かない

原因: Workerの設定ミス
解決策:
1. KV Namespaceが正しくバインドされているか確認
2. `wrangler tail`でエラーログを確認

### 問題: キャッシュが効かない

原因: レスポンスヘッダーの設定不足
解決策:
1. `Cache-Control`ヘッダーが正しく設定されているか確認
2. CloudflareのPage Rulesで追加設定

## まとめ

この設定により、以下が実現されます：

1. **DDoS保護**: 無料プランでも15Tbps以上の攻撃を防御
2. **レート制限**: エッジでの効率的なレート制限
3. **グローバルCDN**: 世界300以上の拠点から高速配信
4. **セキュリティ**: WAF、ボット対策による多層防御
5. **コスト削減**: Vercelへの直接アクセスを削減

定期的にCloudflare Analyticsを確認し、必要に応じて設定を調整してください。