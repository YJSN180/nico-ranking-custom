/**
 * 型安全な環境変数管理システム
 * セキュリティ重視: 機密情報のハードコード防止、型チェック、必須変数検証
 */

// 環境変数の型定義
interface EnvironmentConfig {
  // Cloudflare設定
  cloudflare: {
    accountId: string
    apiToken: string
    kvNamespaceId: string
  }
  
  // 認証設定
  auth: {
    workerKey: string
    adminUsername: string
    adminPassword: string
    cronSecret: string
  }
  
  // アプリケーション設定
  app: {
    apiGatewayUrl: string
    environment: 'development' | 'preview' | 'production'
    isProduction: boolean
  }
  
  // 外部サービス設定（オプショナル）
  external?: {
    nicoCookies?: string
    vercelProtectionBypass?: string
  }
}

// 必須環境変数のリスト
const REQUIRED_ENV_VARS = [
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN', 
  'CLOUDFLARE_KV_NAMESPACE_ID',
  'WORKER_AUTH_KEY',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'CRON_SECRET'
] as const

// 環境変数検証関数
function validateEnvironmentVariable(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  
  // セキュリティチェック: プレースホルダー値の検出
  const placeholders = ['your_', 'example_', 'replace_', 'change_', 'set_']
  if (placeholders.some(placeholder => value.toLowerCase().includes(placeholder))) {
    throw new Error(`Environment variable ${key} contains placeholder value. Please set actual value.`)
  }
  
  return value.trim()
}

// 安全なデフォルト値（機密情報は含まない）
function getSecureDefault(key: string): string {
  const secureDefaults: Record<string, string> = {
    'NEXT_PUBLIC_API_GATEWAY_URL': 'http://localhost:3000',
    'NODE_ENV': 'development',
    'VERCEL_ENV': 'development'
  }
  
  return secureDefaults[key] || ''
}

// 環境変数設定の読み込み
function loadEnvironmentConfig(): EnvironmentConfig {
  try {
    // 必須変数の検証
    for (const varName of REQUIRED_ENV_VARS) {
      const value = process.env[varName]
      if (!value) {
        throw new Error(`Required environment variable missing: ${varName}`)
      }
      validateEnvironmentVariable(varName, value)
    }
    
    // 環境の判定
    const vercelEnv = process.env.VERCEL_ENV || 'development'
    const nodeEnv = process.env.NODE_ENV || 'development'
    const environment = vercelEnv as 'development' | 'preview' | 'production'
    const isProduction = environment === 'production'
    
    // API Gateway URLの決定
    let apiGatewayUrl: string
    if (isProduction) {
      apiGatewayUrl = 'https://nico-rank.com'
    } else if (environment === 'preview') {
      apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'https://nico-ranking-custom-yjsns-projects.vercel.app'
    } else {
      apiGatewayUrl = process.env.NEXT_PUBLIC_API_GATEWAY_URL || 'http://localhost:3000'
    }
    
    const config: EnvironmentConfig = {
      cloudflare: {
        accountId: validateEnvironmentVariable('CLOUDFLARE_ACCOUNT_ID', process.env.CLOUDFLARE_ACCOUNT_ID),
        apiToken: validateEnvironmentVariable('CLOUDFLARE_API_TOKEN', process.env.CLOUDFLARE_API_TOKEN),
        kvNamespaceId: validateEnvironmentVariable('CLOUDFLARE_KV_NAMESPACE_ID', process.env.CLOUDFLARE_KV_NAMESPACE_ID)
      },
      
      auth: {
        workerKey: validateEnvironmentVariable('WORKER_AUTH_KEY', process.env.WORKER_AUTH_KEY),
        adminUsername: validateEnvironmentVariable('ADMIN_USERNAME', process.env.ADMIN_USERNAME),
        adminPassword: validateEnvironmentVariable('ADMIN_PASSWORD', process.env.ADMIN_PASSWORD),
        cronSecret: validateEnvironmentVariable('CRON_SECRET', process.env.CRON_SECRET)
      },
      
      app: {
        apiGatewayUrl,
        environment,
        isProduction
      },
      
      external: {
        nicoCookies: process.env.NICO_COOKIES,
        vercelProtectionBypass: process.env.VERCEL_PROTECTION_BYPASS_SECRET
      }
    }
    
    // 開発環境でのデバッグ情報（機密情報は除く）
    if (!isProduction && process.env.DEBUG_CONFIG === 'true') {
      console.log('Environment configuration loaded:', {
        environment: config.app.environment,
        apiGatewayUrl: config.app.apiGatewayUrl,
        cloudflareAccountId: config.cloudflare.accountId.slice(0, 8) + '...',
        kvNamespaceId: config.cloudflare.kvNamespaceId.slice(0, 8) + '...'
      })
    }
    
    return config
    
  } catch (error) {
    console.error('Environment configuration error:', error)
    throw new Error(`Failed to load environment configuration: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// グローバル設定インスタンス（シングルトン）
let configInstance: EnvironmentConfig | null = null

export function getConfig(): EnvironmentConfig {
  if (!configInstance) {
    configInstance = loadEnvironmentConfig()
  }
  return configInstance
}

// 設定リセット（テスト用）
export function resetConfig(): void {
  configInstance = null
}

// 特定設定への安全なアクセサー
export const config = {
  get cloudflare() {
    return getConfig().cloudflare
  },
  
  get auth() {
    return getConfig().auth
  },
  
  get app() {
    return getConfig().app
  },
  
  get external() {
    return getConfig().external
  }
}

// 型エクスポート
export type { EnvironmentConfig }