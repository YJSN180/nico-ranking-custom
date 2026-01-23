/**
 * 環境変数のスキーマ検証
 * Zodを使用した型安全な環境変数バリデーション
 */

import { z } from 'zod';

/**
 * サーバーサイド環境変数のスキーマ
 */
const serverEnvSchema = z.object({
  // Cloudflare設定
  CLOUDFLARE_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
  CLOUDFLARE_KV_NAMESPACE_ID: z.string().min(1).optional(),
  KV_RANKING_ID: z.string().min(1).optional(),

  // R2設定
  R2_ACCESS_KEY_ID: z.string().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  // 認証設定
  WORKER_AUTH_KEY: z.string().min(1).optional(),
  ADMIN_USERNAME: z.string().min(1).optional(),
  ADMIN_PASSWORD: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),

  // アプリケーション設定
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),

  // 外部サービス設定
  NICO_COOKIES: z.string().optional(),
  VERCEL_PROTECTION_BYPASS_SECRET: z.string().optional(),
});

/**
 * クライアントサイド環境変数のスキーマ
 * NEXT_PUBLIC_ プレフィックス付きの変数
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_API_GATEWAY_URL: z.string().url().optional(),
});

/**
 * サーバーサイド環境変数の型
 */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * クライアントサイド環境変数の型
 */
export type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * サーバーサイド環境変数を検証・取得
 *
 * @throws {z.ZodError} 検証に失敗した場合
 */
export function getServerEnv(): ServerEnv {
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Server environment validation failed:', result.error.format());
    throw new Error(`Server environment validation failed: ${result.error.message}`);
  }

  return result.data;
}

/**
 * クライアントサイド環境変数を検証・取得
 *
 * @throws {z.ZodError} 検証に失敗した場合
 */
export function getClientEnv(): ClientEnv {
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_API_GATEWAY_URL: process.env.NEXT_PUBLIC_API_GATEWAY_URL,
  });

  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Client environment validation failed:', result.error.format());
    throw new Error(`Client environment validation failed: ${result.error.message}`);
  }

  return result.data;
}

/**
 * 環境変数のサマリーをログ出力（機密情報はマスク）
 * デバッグ用途
 */
export function logEnvSummary(): void {
  const env = getServerEnv();

  const masked = (value: string | undefined): string => {
    if (!value) return '(not set)';
    if (value.length <= 8) return '***';
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  };

  // eslint-disable-next-line no-console
  console.log('Environment Summary:', {
    NODE_ENV: env.NODE_ENV,
    VERCEL_ENV: env.VERCEL_ENV ?? '(not set)',
    CLOUDFLARE_ACCOUNT_ID: masked(env.CLOUDFLARE_ACCOUNT_ID),
    CLOUDFLARE_API_TOKEN: masked(env.CLOUDFLARE_API_TOKEN),
    KV_RANKING_ID: masked(env.KV_RANKING_ID),
    WORKER_AUTH_KEY: masked(env.WORKER_AUTH_KEY),
  });
}

// スキーマをエクスポート（テスト用途）
export { serverEnvSchema, clientEnvSchema };
