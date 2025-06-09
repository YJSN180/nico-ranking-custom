# Cloudflare Pages Build Fix

## 問題
Cloudflare Pagesでのビルド時に以下のエラーが発生:
```
Error: `vercel build` must not recursively invoke itself. Check the Build Command in the Project Settings or the `build` script in `package.json`
```

## 原因
1. Cloudflare Pagesのビルドコマンドが `npm install && npm run build` に設定されている
2. package.jsonの`build`スクリプトが `npx @cloudflare/next-on-pages` を実行
3. `@cloudflare/next-on-pages`が内部で`npx vercel build`を実行し、再帰的な呼び出しが発生

## 解決策

### 1. package.jsonの修正
```json
{
  "scripts": {
    "build": "next build",
    "build:cloudflare-pages": "next build && npx @cloudflare/next-on-pages --experimental-minify"
  }
}
```

### 2. Cloudflare Pagesのビルド設定
Cloudflare Pagesダッシュボードで以下のいずれかに変更:

**オプション1**: 直接コマンドを指定
```bash
npm install && npm run build:cloudflare-pages
```

**オプション2**: Next.jsビルド後にCloudflare変換
```bash
npm install && npm run build && npx @cloudflare/next-on-pages
```

## 推奨設定
- **Build command**: `npm install && npm run build:cloudflare-pages`
- **Build output directory**: `.vercel/output/static`
- **Root directory**: (leave blank)

## 注意点
- `--experimental-minify`フラグは非推奨だが、互換性のため残している
- `nodejs_compat`フラグがwrangler.tomlで有効になっていることを確認