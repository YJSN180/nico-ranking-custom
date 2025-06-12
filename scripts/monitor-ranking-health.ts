#!/usr/bin/env npx tsx
/**
 * Ranking System Health Monitor
 * 
 * Monitors:
 * - Data freshness (last update time)
 * - KV storage health and availability
 * - API response times and success rates
 * - Geographic accessibility
 * - Storage usage and quotas
 */

import 'dotenv/config'
import { writeFileSync } from 'fs'

interface HealthStatus {
  overall: 'healthy' | 'degraded' | 'critical'
  timestamp: string
  checks: {
    dataFreshness: HealthCheck
    kvStorage: HealthCheck
    apiResponsiveness: HealthCheck
    geoAccessibility: HealthCheck
    storageQuota: HealthCheck
  }
  metrics: {
    lastUpdateAge: number // minutes
    kvResponseTime: number // ms
    storageUsagePercent: number
    totalGenres: number
    totalItems: number
  }
  alerts: string[]
}

interface HealthCheck {
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: any
  responseTime?: number
}

class HealthMonitor {
  private status: HealthStatus = {
    overall: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      dataFreshness: { status: 'pass', message: 'Not checked' },
      kvStorage: { status: 'pass', message: 'Not checked' },
      apiResponsiveness: { status: 'pass', message: 'Not checked' },
      geoAccessibility: { status: 'pass', message: 'Not checked' },
      storageQuota: { status: 'pass', message: 'Not checked' }
    },
    metrics: {
      lastUpdateAge: 0,
      kvResponseTime: 0,
      storageUsagePercent: 0,
      totalGenres: 0,
      totalItems: 0
    },
    alerts: []
  }

  async checkDataFreshness(): Promise<void> {
    try {
      const startTime = Date.now()
      const kvData = await this.getKVData('RANKING_LATEST')
      const responseTime = Date.now() - startTime

      if (!kvData) {
        this.status.checks.dataFreshness = {
          status: 'fail',
          message: 'No ranking data found in KV storage',
          responseTime
        }
        this.status.alerts.push('🚨 No ranking data available')
        return
      }

      const updatedAt = new Date(kvData.metadata?.updatedAt || 0)
      const ageMinutes = (Date.now() - updatedAt.getTime()) / (1000 * 60)
      this.status.metrics.lastUpdateAge = ageMinutes

      // Count genres and items
      const genres = Object.keys(kvData.genres || {})
      this.status.metrics.totalGenres = genres.length
      this.status.metrics.totalItems = Object.values(kvData.genres || {})
        .reduce((total: number, genre: any) => {
          const items24h = genre['24h']?.items?.length || 0
          const itemsHour = genre.hour?.items?.length || 0
          return total + items24h + itemsHour
        }, 0)

      if (ageMinutes > 60) {
        this.status.checks.dataFreshness = {
          status: 'fail',
          message: `Data is ${Math.round(ageMinutes)} minutes old (>60 min threshold)`,
          responseTime,
          details: { updatedAt: updatedAt.toISOString(), ageMinutes }
        }
        this.status.alerts.push(`⚠️ Data is stale (${Math.round(ageMinutes)} minutes old)`)
      } else if (ageMinutes > 35) {
        this.status.checks.dataFreshness = {
          status: 'warn',
          message: `Data is ${Math.round(ageMinutes)} minutes old (>35 min threshold)`,
          responseTime,
          details: { updatedAt: updatedAt.toISOString(), ageMinutes }
        }
        this.status.alerts.push(`⚠️ Data freshness warning (${Math.round(ageMinutes)} minutes old)`)
      } else {
        this.status.checks.dataFreshness = {
          status: 'pass',
          message: `Data is fresh (${Math.round(ageMinutes)} minutes old)`,
          responseTime,
          details: { updatedAt: updatedAt.toISOString(), ageMinutes }
        }
      }

    } catch (error) {
      this.status.checks.dataFreshness = {
        status: 'fail',
        message: `Failed to check data freshness: ${(error as Error).message}`
      }
      this.status.alerts.push('🚨 Unable to access ranking data')
    }
  }

  async checkKVStorage(): Promise<void> {
    try {
      const startTime = Date.now()
      
      // Test write operation
      await this.putKVData('HEALTH_CHECK', {
        timestamp: new Date().toISOString(),
        test: 'health-monitor'
      })
      
      // Test read operation
      const testData = await this.getKVData('HEALTH_CHECK')
      const responseTime = Date.now() - startTime
      this.status.metrics.kvResponseTime = responseTime

      if (!testData) {
        this.status.checks.kvStorage = {
          status: 'fail',
          message: 'KV read operation failed',
          responseTime
        }
        this.status.alerts.push('🚨 KV storage read failure')
        return
      }

      if (responseTime > 5000) {
        this.status.checks.kvStorage = {
          status: 'warn',
          message: `KV operations slow (${responseTime}ms)`,
          responseTime
        }
        this.status.alerts.push(`⚠️ KV storage responding slowly (${responseTime}ms)`)
      } else {
        this.status.checks.kvStorage = {
          status: 'pass',
          message: `KV storage healthy (${responseTime}ms)`,
          responseTime
        }
      }

    } catch (error) {
      this.status.checks.kvStorage = {
        status: 'fail',
        message: `KV storage error: ${(error as Error).message}`
      }
      this.status.alerts.push('🚨 KV storage unavailable')
    }
  }

  async checkApiResponsiveness(): Promise<void> {
    try {
      const startTime = Date.now()
      
      // Test a simple ranking page fetch
      const response = await fetch('https://www.nicovideo.jp/ranking/genre/e9uj2uks?term=24h', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      })
      
      const responseTime = Date.now() - startTime

      if (!response.ok) {
        this.status.checks.apiResponsiveness = {
          status: 'fail',
          message: `Nico Nico API returned ${response.status}`,
          responseTime,
          details: { status: response.status, statusText: response.statusText }
        }
        this.status.alerts.push(`🚨 Nico Nico API error (${response.status})`)
        return
      }

      if (responseTime > 10000) {
        this.status.checks.apiResponsiveness = {
          status: 'warn',
          message: `Nico Nico API slow (${responseTime}ms)`,
          responseTime
        }
        this.status.alerts.push(`⚠️ Nico Nico API responding slowly (${responseTime}ms)`)
      } else {
        this.status.checks.apiResponsiveness = {
          status: 'pass',
          message: `Nico Nico API responsive (${responseTime}ms)`,
          responseTime
        }
      }

    } catch (error) {
      this.status.checks.apiResponsiveness = {
        status: 'fail',
        message: `API check failed: ${(error as Error).message}`
      }
      this.status.alerts.push('🚨 Cannot reach Nico Nico API')
    }
  }

  async checkGeoAccessibility(): Promise<void> {
    try {
      const userAgents = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ]

      const results = await Promise.allSettled(
        userAgents.map(async (ua, index) => {
          const response = await fetch('https://www.nicovideo.jp/ranking', {
            headers: { 'User-Agent': ua }
          })
          return { index, status: response.status, ua }
        })
      )

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.status === 200).length
      const total = results.length

      if (successful === 0) {
        this.status.checks.geoAccessibility = {
          status: 'fail',
          message: 'All geo-access attempts failed',
          details: results
        }
        this.status.alerts.push('🚨 Geo-blocking detected - all user agents blocked')
      } else if (successful < total) {
        this.status.checks.geoAccessibility = {
          status: 'warn',
          message: `${successful}/${total} user agents working`,
          details: results
        }
        this.status.alerts.push(`⚠️ Partial geo-blocking detected (${successful}/${total} working)`)
      } else {
        this.status.checks.geoAccessibility = {
          status: 'pass',
          message: 'All user agents accessible',
          details: results
        }
      }

    } catch (error) {
      this.status.checks.geoAccessibility = {
        status: 'fail',
        message: `Geo-accessibility check failed: ${(error as Error).message}`
      }
      this.status.alerts.push('🚨 Unable to check geo-accessibility')
    }
  }

  async checkStorageQuota(): Promise<void> {
    try {
      // Estimate storage usage (simplified)
      const kvData = await this.getKVData('RANKING_LATEST')
      if (kvData) {
        const dataSize = JSON.stringify(kvData).length
        const estimatedSizeKB = dataSize / 1024
        const quotaKB = 25 * 1024 // 25MB limit for KV value
        const usagePercent = (estimatedSizeKB / quotaKB) * 100
        
        this.status.metrics.storageUsagePercent = usagePercent

        if (usagePercent > 90) {
          this.status.checks.storageQuota = {
            status: 'fail',
            message: `Storage usage critical (${usagePercent.toFixed(1)}%)`,
            details: { estimatedSizeKB, quotaKB, usagePercent }
          }
          this.status.alerts.push(`🚨 Storage quota critical (${usagePercent.toFixed(1)}%)`)
        } else if (usagePercent > 75) {
          this.status.checks.storageQuota = {
            status: 'warn',
            message: `Storage usage high (${usagePercent.toFixed(1)}%)`,
            details: { estimatedSizeKB, quotaKB, usagePercent }
          }
          this.status.alerts.push(`⚠️ Storage usage high (${usagePercent.toFixed(1)}%)`)
        } else {
          this.status.checks.storageQuota = {
            status: 'pass',
            message: `Storage usage healthy (${usagePercent.toFixed(1)}%)`,
            details: { estimatedSizeKB, quotaKB, usagePercent }
          }
        }
      } else {
        this.status.checks.storageQuota = {
          status: 'warn',
          message: 'Unable to determine storage usage'
        }
      }

    } catch (error) {
      this.status.checks.storageQuota = {
        status: 'fail',
        message: `Storage quota check failed: ${(error as Error).message}`
      }
    }
  }

  private async getKVData(key: string): Promise<any> {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
      }
    })

    if (!response.ok) {
      if (response.status === 404) return null
      throw new Error(`KV read failed: ${response.status}`)
    }

    const data = await response.arrayBuffer()
    const uint8Array = new Uint8Array(data)
    
    try {
      // Try to decompress if it's gzipped
      const pako = await import('pako')
      const jsonString = pako.ungzip(uint8Array, { to: 'string' })
      return JSON.parse(jsonString)
    } catch {
      // If not compressed, parse as text
      const text = new TextDecoder().decode(uint8Array)
      return JSON.parse(text)
    }
  }

  private async putKVData(key: string, data: any): Promise<void> {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      throw new Error('Cloudflare KV credentials not configured')
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${key}`

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })

    if (!response.ok) {
      throw new Error(`KV write failed: ${response.status}`)
    }
  }

  private calculateOverallStatus(): void {
    const checks = Object.values(this.status.checks)
    const failCount = checks.filter(c => c.status === 'fail').length
    const warnCount = checks.filter(c => c.status === 'warn').length

    if (failCount > 0) {
      this.status.overall = 'critical'
    } else if (warnCount > 1) {
      this.status.overall = 'degraded'
    } else {
      this.status.overall = 'healthy'
    }
  }

  async sendAlerts(): Promise<void> {
    if (this.status.alerts.length === 0 && this.status.overall === 'healthy') {
      return
    }

    const summary = `🔍 Ranking System Health: ${this.status.overall.toUpperCase()}\n\n` +
      `📊 Metrics:\n` +
      `• Data age: ${Math.round(this.status.metrics.lastUpdateAge)} minutes\n` +
      `• KV response: ${this.status.metrics.kvResponseTime}ms\n` +
      `• Storage usage: ${this.status.metrics.storageUsagePercent.toFixed(1)}%\n` +
      `• Genres: ${this.status.metrics.totalGenres}\n` +
      `• Items: ${this.status.metrics.totalItems}\n\n` +
      (this.status.alerts.length > 0 ? `🚨 Alerts:\n${this.status.alerts.join('\n')}\n\n` : '') +
      `🔗 View details: ${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`

    // Send to Discord if webhook configured
    if (process.env.DISCORD_WEBHOOK_URL) {
      try {
        await fetch(process.env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: summary,
            username: 'Nico Ranking Monitor'
          })
        })
      } catch (error) {
        console.error('Failed to send Discord alert:', error)
      }
    }

    // Send to Slack if webhook configured
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: summary,
            username: 'Nico Ranking Monitor'
          })
        })
      } catch (error) {
        console.error('Failed to send Slack alert:', error)
      }
    }
  }

  async runAllChecks(): Promise<HealthStatus> {
    console.log('🔍 Running health checks...')
    
    await Promise.all([
      this.checkDataFreshness(),
      this.checkKVStorage(),
      this.checkApiResponsiveness(),
      this.checkGeoAccessibility(),
      this.checkStorageQuota()
    ])

    this.calculateOverallStatus()
    
    console.log(`📊 Health status: ${this.status.overall}`)
    if (this.status.alerts.length > 0) {
      console.log('🚨 Alerts:', this.status.alerts)
    }

    await this.sendAlerts()
    
    return this.status
  }
}

async function main() {
  try {
    const monitor = new HealthMonitor()
    const status = await monitor.runAllChecks()
    
    // Export status for GitHub Actions
    writeFileSync('health-status.json', JSON.stringify(status, null, 2))
    
    // Exit with error code if critical
    if (status.overall === 'critical') {
      console.error('❌ System is in critical state')
      process.exit(1)
    }
    
    console.log('✅ Health check completed')
    
  } catch (error) {
    console.error('❌ Health check failed:', error)
    writeFileSync(`error-${Date.now()}.log`, JSON.stringify({
      error: (error as Error).message,
      timestamp: new Date().toISOString()
    }, null, 2))
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}