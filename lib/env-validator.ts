/**
 * Environment variable validation
 */

export interface RequiredEnvVars {
  // CloudFlare
  CLOUDFLARE_ACCOUNT_ID: string
  CLOUDFLARE_KV_NAMESPACE_ID: string
  CLOUDFLARE_KV_API_TOKEN: string
  
  // Authentication
  CRON_SECRET: string
  WORKER_AUTH_KEY: string
  ADMIN_USERNAME: string
  ADMIN_PASSWORD: string
  
  // Optional
  PREVIEW_PROTECTION_KEY?: string
  DEBUG_TOKEN?: string
}

export class EnvValidator {
  private static validated = false
  private static errors: string[] = []

  /**
   * Validate all required environment variables
   */
  static validate(): void {
    if (this.validated) return
    
    this.errors = []
    
    // Required variables
    const required = [
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_KV_NAMESPACE_ID', 
      'CLOUDFLARE_KV_API_TOKEN',
      'CRON_SECRET',
      'WORKER_AUTH_KEY',
      'ADMIN_USERNAME',
      'ADMIN_PASSWORD'
    ]
    
    for (const varName of required) {
      if (!process.env[varName]) {
        this.errors.push(`Missing required environment variable: ${varName}`)
      }
    }
    
    // Validate formats
    if (process.env.CLOUDFLARE_ACCOUNT_ID && 
        !/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID)) {
      this.errors.push('CLOUDFLARE_ACCOUNT_ID must be a 32-character hex string')
    }
    
    if (process.env.CLOUDFLARE_KV_NAMESPACE_ID && 
        !/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_KV_NAMESPACE_ID)) {
      this.errors.push('CLOUDFLARE_KV_NAMESPACE_ID must be a 32-character hex string')
    }
    
    // Security checks
    if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length < 12) {
      this.errors.push('ADMIN_PASSWORD must be at least 12 characters long')
    }
    
    if (process.env.CRON_SECRET && process.env.CRON_SECRET.length < 32) {
      this.errors.push('CRON_SECRET must be at least 32 characters long')
    }
    
    if (process.env.WORKER_AUTH_KEY && process.env.WORKER_AUTH_KEY.length < 32) {
      this.errors.push('WORKER_AUTH_KEY must be at least 32 characters long')
    }
    
    this.validated = true
    
    if (this.errors.length > 0) {
      throw new Error(`Environment validation failed:\n${this.errors.join('\n')}`)
    }
  }

  /**
   * Get validated environment variables
   */
  static getEnv(): RequiredEnvVars {
    this.validate()
    
    return {
      CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID!,
      CLOUDFLARE_KV_NAMESPACE_ID: process.env.CLOUDFLARE_KV_NAMESPACE_ID!,
      CLOUDFLARE_KV_API_TOKEN: process.env.CLOUDFLARE_KV_API_TOKEN!,
      CRON_SECRET: process.env.CRON_SECRET!,
      WORKER_AUTH_KEY: process.env.WORKER_AUTH_KEY!,
      ADMIN_USERNAME: process.env.ADMIN_USERNAME!,
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD!,
      PREVIEW_PROTECTION_KEY: process.env.PREVIEW_PROTECTION_KEY,
      DEBUG_TOKEN: process.env.DEBUG_TOKEN
    }
  }

  /**
   * Check if we're in production
   */
  static isProduction(): boolean {
    return process.env.NODE_ENV === 'production' || 
           process.env.VERCEL_ENV === 'production'
  }

  /**
   * Check if we're in development
   */
  static isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || 
           process.env.VERCEL_ENV === 'development'
  }
}