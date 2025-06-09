// Cloudflare Pages環境変数の型定義
interface Env {
  RANKING_KV: KVNamespace;
  NEXT_PUBLIC_CONVEX_URL: string;
  CF_ACCOUNT_ID: string;
  CF_NAMESPACE_ID: string;
  CF_API_TOKEN: string;
  NODE_ENV: string;
}

// Cloudflare Pages Functions型定義
type PagesFunction<E = unknown, P extends string = any, D extends Record<string, unknown> = Record<string, unknown>> = (context: {
  request: Request;
  env: E;
  params: Record<P, string>;
  waitUntil: (promise: Promise<any>) => void;
  passThroughOnException: () => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  data: D;
}) => Response | Promise<Response>;