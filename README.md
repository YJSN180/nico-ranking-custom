# Nico Ranking Re:turn

ニコニコ動画のランキングを表示するWebアプリケーション。

## Features

- 複数ジャンルのランキング表示（総合、ゲーム、エンタメ、その他など）
- 24時間・毎時ランキングの切り替え
- 人気タグでのフィルタリング
- リアルタイム統計更新（3分ごと）
- NGリスト機能
- ダークモード対応
- モバイル対応レスポンシブデザイン

## Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **Data Storage**: Cloudflare KV
- **DDoS Protection**: Cloudflare Workers
- **Deployment**: Vercel
- **Testing**: Vitest, Playwright

## Environment Variables

必要な環境変数：

```bash
# Cloudflare KV
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_KV_NAMESPACE_ID=your_namespace_id
CLOUDFLARE_KV_API_TOKEN=your_api_token  # 絶対にコミットしないこと！

# Security
CRON_SECRET=your_cron_secret
WORKER_AUTH_KEY=your_worker_auth_key

# Optional
NICO_COOKIES=sensitive_material_status=accept
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

## License

MIT