# プロキシサーバー設定ガイド

## 1. 日本のVPSを契約

推奨サービス：
- さくらVPS（月額600円〜）
- ConoHa VPS（月額600円〜）
- Vultr東京リージョン（月額$6〜）

## 2. プロキシサーバーのセットアップ

### A. シンプルなNode.jsプロキシ

```bash
# VPSにSSHでログイン
ssh user@your-vps-ip

# Node.jsをインストール
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt-get install -y nodejs

# プロジェクトディレクトリを作成
mkdir niconico-proxy
cd niconico-proxy

# package.jsonを作成
npm init -y
npm install express axios cors dotenv
```

### B. プロキシサーバーコード

`server.js`:
```javascript
const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// APIキーで簡易認証
const API_KEY = process.env.API_KEY || 'your-secret-key';

app.post('/api/proxy', async (req, res) => {
  const { url, headers } = req.body;
  const apiKey = req.headers['x-api-key'];
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        ...headers,
        // 例のソレジャンル用の特別な処理
        'User-Agent': headers['User-Agent'] || 'Mozilla/5.0',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
      },
      // HTMLを文字列として取得
      responseType: 'text',
      // リダイレクトを手動で処理
      maxRedirects: 0,
      validateStatus: (status) => status < 400
    });
    
    res.json({
      status: response.status,
      body: response.data,
      headers: response.headers,
      finalUrl: response.request.res.responseUrl
    });
  } catch (error) {
    if (error.response) {
      res.json({
        status: error.response.status,
        body: error.response.data,
        headers: error.response.headers,
        error: true
      });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});
```

### C. PM2で永続化

```bash
npm install -g pm2
pm2 start server.js
pm2 startup
pm2 save
```

### D. Nginxでリバースプロキシ（オプション）

```nginx
server {
    listen 443 ssl http2;
    server_name proxy.yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 3. 環境変数の設定

Vercelプロジェクトに以下を設定：

```bash
PROXY_URL=https://proxy.yourdomain.com/api/proxy
PROXY_API_KEY=your-secret-key
```

## 4. クライアント側の実装更新

`lib/proxy-scraper.ts`を更新して例のソレジャンル対応：

```typescript
export async function scrapeRankingViaProxy(
  genre: string,
  term: '24h' | 'hour',
  tag?: string
): Promise<{
  items: Partial<RankingItem>[]
  popularTags?: string[]
}> {
  const url = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
  if (tag) {
    url += `&tag=${encodeURIComponent(tag)}`
  }

  // 例のソレジャンルの場合は特別な処理
  const isReiSore = genre === 'd2um7mc4';
  
  const proxyResponse = await fetchViaProxy({
    url,
    headers: {
      'User-Agent': isReiSore 
        ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        : 'Googlebot/2.1',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja',
      'Cookie': isReiSore 
        ? 'user_session=your_session; sensitive_material_status=accept'
        : 'sensitive_material_status=accept',
    },
  });

  // レスポンスを解析...
}
```

## 5. セキュリティ考慮事項

1. **APIキー管理**
   - 環境変数で管理
   - 定期的に更新

2. **レート制限**
   - プロキシサーバーにレート制限を実装
   - ニコニコへの過度なアクセスを防ぐ

3. **IPホワイトリスト**
   - Vercelの固定IPからのみ受け付ける（Enterprise版）
   - または追加の認証レイヤー

## 6. コスト

- VPS: 月額600円〜2000円
- トラフィック: 通常は無料枠内
- 合計: 月額1000円程度

## 7. 代替案

商用プロキシサービスを使う場合：
- 設定が簡単
- 月額$50〜$500（使用量による）
- APIキーだけで使える