// Cloudflare Pages環境変数の型定義
interface Env {
  RANKING_KV: KVNamespace;
  NEXT_PUBLIC_CONVEX_URL: string;
  CF_ACCOUNT_ID: string;
  CF_NAMESPACE_ID: string;
  CF_API_TOKEN: string;
  NODE_ENV: string;
}