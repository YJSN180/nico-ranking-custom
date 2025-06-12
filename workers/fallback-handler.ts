/**
 * Fallback Handler
 * 
 * Workers Cronの処理が失敗した場合のフォールバック戦略
 * GitHub ActionsとWorkers Cronのハイブリッド運用をサポート
 */

interface FallbackConfig {
  maxRetries: number
  retryDelay: number
  githubToken?: string
  webhookUrl?: string
}

export class FallbackHandler {
  private config: FallbackConfig
  private env: any
  
  constructor(env: any, config: FallbackConfig) {
    this.env = env
    this.config = config
  }
  
  /**
   * エラーハンドリングとフォールバック処理
   */
  async handleError(error: Error, context: any): Promise<void> {
    console.error('Processing error:', error, context)
    
    // エラー情報を記録
    await this.recordError(error, context)
    
    // リトライ可能かチェック
    if (this.shouldRetry(context)) {
      await this.scheduleRetry(context)
      return
    }
    
    // フォールバック処理を実行
    await this.executeFallback(error, context)
  }
  
  /**
   * エラー情報をKVに記録
   */
  private async recordError(error: Error, context: any): Promise<void> {
    const errorKey = `error:${Date.now()}`
    const errorData = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
      retryCount: context.retryCount || 0
    }
    
    await this.env.RANKING_DATA.put(errorKey, JSON.stringify(errorData), {
      expirationTtl: 86400 // 24時間保持
    })
    
    // エラーカウンターを更新
    await this.updateErrorMetrics()
  }
  
  /**
   * リトライ可能かチェック
   */
  private shouldRetry(context: any): boolean {
    const retryCount = context.retryCount || 0
    
    // ネットワークエラーやタイムアウトはリトライ
    if (context.error?.type === 'network' || context.error?.type === 'timeout') {
      return retryCount < this.config.maxRetries
    }
    
    // レート制限エラーもリトライ（遅延を増やして）
    if (context.error?.status === 429) {
      return retryCount < 2
    }
    
    return false
  }
  
  /**
   * リトライをスケジュール
   */
  private async scheduleRetry(context: any): Promise<void> {
    const retryCount = (context.retryCount || 0) + 1
    const delay = this.config.retryDelay * Math.pow(2, retryCount - 1) // 指数バックオフ
    
    await this.env.RANKING_QUEUE.send({
      ...context.task,
      retryCount,
      scheduledAt: new Date(Date.now() + delay * 1000).toISOString()
    }, { delaySeconds: delay })
    
    console.log(`Retry scheduled: attempt ${retryCount}, delay ${delay}s`)
  }
  
  /**
   * フォールバック処理を実行
   */
  private async executeFallback(error: Error, context: any): Promise<void> {
    // 1. GitHub Actionsへの通知
    if (this.config.githubToken) {
      await this.notifyGitHubActions(error, context)
    }
    
    // 2. Webhookへの通知
    if (this.config.webhookUrl) {
      await this.notifyWebhook(error, context)
    }
    
    // 3. 部分的なデータ更新を試みる
    await this.attemptPartialUpdate(context)
    
    // 4. キャッシュの延長
    await this.extendCacheTTL(context)
  }
  
  /**
   * GitHub Actionsへ通知
   */
  private async notifyGitHubActions(error: Error, context: any): Promise<void> {
    if (!this.config.githubToken) return
    
    try {
      const response = await fetch(
        'https://api.github.com/repos/YJSN180/nico-ranking-custom/dispatches',
        {
          method: 'POST',
          headers: {
            'Authorization': `token ${this.config.githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            event_type: 'worker_cron_failed',
            client_payload: {
              error: error.message,
              context: {
                task: context.task,
                timestamp: new Date().toISOString()
              }
            }
          })
        }
      )
      
      if (response.ok) {
        console.log('GitHub Actions notified for fallback processing')
      }
    } catch (e) {
      console.error('Failed to notify GitHub Actions:', e)
    }
  }
  
  /**
   * Webhookへ通知
   */
  private async notifyWebhook(error: Error, context: any): Promise<void> {
    if (!this.config.webhookUrl) return
    
    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'worker_cron_failed',
          error: error.message,
          context,
          timestamp: new Date().toISOString()
        })
      })
    } catch (e) {
      console.error('Failed to notify webhook:', e)
    }
  }
  
  /**
   * 部分的なデータ更新を試みる
   */
  private async attemptPartialUpdate(context: any): Promise<void> {
    if (!context.task || context.task.type !== 'fetch_basic') return
    
    try {
      // 最も重要なジャンルのみ更新を試みる
      const criticalGenres = ['all', 'game']
      if (!criticalGenres.includes(context.task.genre)) return
      
      // 簡易版のデータ取得を試みる
      const url = `https://www.nicovideo.jp/ranking/genre/${context.task.genre}?term=24h`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        },
        signal: AbortSignal.timeout(5000) // 5秒タイムアウト
      })
      
      if (response.ok) {
        const html = await response.text()
        // 最小限のデータ抽出（上位10件のみ）
        const items = this.extractMinimalRankingData(html)
        
        if (items.length > 0) {
          await this.env.RANKING_DATA.put(
            `ranking-${context.task.genre}-24h-partial`,
            JSON.stringify({
              items: items.slice(0, 10),
              partial: true,
              updatedAt: new Date().toISOString()
            }),
            { expirationTtl: 1800 } // 30分
          )
        }
      }
    } catch (e) {
      console.error('Partial update failed:', e)
    }
  }
  
  /**
   * 最小限のランキングデータを抽出
   */
  private extractMinimalRankingData(html: string): any[] {
    const items: any[] = []
    
    // 簡易的なパターンマッチング
    const itemPattern = /<div class="RankingMainVideo"[^>]*>[\s\S]*?<\/div>/g
    const matches = html.match(itemPattern) || []
    
    for (const match of matches.slice(0, 10)) {
      const idMatch = match.match(/data-video-id="([^"]+)"/)
      const titleMatch = match.match(/title="([^"]+)"/)
      
      if (idMatch && titleMatch) {
        items.push({
          id: idMatch[1],
          title: titleMatch[1],
          rank: items.length + 1
        })
      }
    }
    
    return items
  }
  
  /**
   * キャッシュのTTLを延長
   */
  private async extendCacheTTL(context: any): Promise<void> {
    if (!context.task) return
    
    const patterns = [
      `ranking-${context.task.genre}-${context.task.period}`,
      `ranking-${context.task.genre}-*`,
      'popular-tags-*'
    ]
    
    for (const pattern of patterns) {
      const { keys } = await this.env.RANKING_DATA.list({ prefix: pattern.replace('*', '') })
      
      for (const key of keys) {
        const data = await this.env.RANKING_DATA.get(key.name)
        if (data) {
          // TTLを1時間延長
          await this.env.RANKING_DATA.put(key.name, data, {
            expirationTtl: 3600,
            metadata: { extended: true }
          })
        }
      }
    }
  }
  
  /**
   * エラーメトリクスを更新
   */
  private async updateErrorMetrics(): Promise<void> {
    const metricsKey = 'metrics:errors'
    const metrics = await this.env.RANKING_DATA.get(metricsKey, { type: 'json' }) || {
      count: 0,
      lastError: null,
      errors: []
    }
    
    metrics.count++
    metrics.lastError = new Date().toISOString()
    metrics.errors.push({
      timestamp: new Date().toISOString(),
      type: 'processing_error'
    })
    
    // 直近100件のエラーのみ保持
    if (metrics.errors.length > 100) {
      metrics.errors = metrics.errors.slice(-100)
    }
    
    await this.env.RANKING_DATA.put(metricsKey, JSON.stringify(metrics), {
      expirationTtl: 86400 * 7 // 7日間
    })
  }
}

/**
 * ヘルスチェックとモニタリング
 */
export class HealthMonitor {
  private env: any
  
  constructor(env: any) {
    this.env = env
  }
  
  /**
   * システムヘルスチェック
   */
  async checkHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy'
    details: any
  }> {
    const checks = await Promise.all([
      this.checkDataFreshness(),
      this.checkErrorRate(),
      this.checkProcessingStatus()
    ])
    
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length
    const degradedCount = checks.filter(c => c.status === 'degraded').length
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (unhealthyCount > 0) status = 'unhealthy'
    else if (degradedCount > 0) status = 'degraded'
    
    return {
      status,
      details: {
        checks,
        timestamp: new Date().toISOString()
      }
    }
  }
  
  /**
   * データの鮮度をチェック
   */
  private async checkDataFreshness(): Promise<any> {
    const key = 'ranking-all-24h'
    const data = await this.env.RANKING_DATA.get(key, { type: 'json' })
    
    if (!data || !data.updatedAt) {
      return { name: 'data_freshness', status: 'unhealthy', message: 'No data found' }
    }
    
    const age = Date.now() - new Date(data.updatedAt).getTime()
    const ageMinutes = age / 1000 / 60
    
    if (ageMinutes > 60) {
      return { name: 'data_freshness', status: 'unhealthy', message: `Data is ${ageMinutes.toFixed(0)} minutes old` }
    } else if (ageMinutes > 30) {
      return { name: 'data_freshness', status: 'degraded', message: `Data is ${ageMinutes.toFixed(0)} minutes old` }
    }
    
    return { name: 'data_freshness', status: 'healthy', message: `Data is ${ageMinutes.toFixed(0)} minutes old` }
  }
  
  /**
   * エラー率をチェック
   */
  private async checkErrorRate(): Promise<any> {
    const metrics = await this.env.RANKING_DATA.get('metrics:errors', { type: 'json' })
    
    if (!metrics) {
      return { name: 'error_rate', status: 'healthy', message: 'No errors recorded' }
    }
    
    const recentErrors = metrics.errors.filter((e: any) => {
      const age = Date.now() - new Date(e.timestamp).getTime()
      return age < 3600000 // 1時間以内
    })
    
    const errorRate = recentErrors.length
    
    if (errorRate > 10) {
      return { name: 'error_rate', status: 'unhealthy', message: `${errorRate} errors in last hour` }
    } else if (errorRate > 5) {
      return { name: 'error_rate', status: 'degraded', message: `${errorRate} errors in last hour` }
    }
    
    return { name: 'error_rate', status: 'healthy', message: `${errorRate} errors in last hour` }
  }
  
  /**
   * 処理状態をチェック
   */
  private async checkProcessingStatus(): Promise<any> {
    const phase = await this.env.RANKING_DATA.get('processing-phase', { type: 'json' })
    
    if (!phase) {
      return { name: 'processing_status', status: 'healthy', message: 'No active processing' }
    }
    
    const age = Date.now() - new Date(phase.startedAt).getTime()
    const ageMinutes = age / 1000 / 60
    
    if (ageMinutes > 30 && phase.isActive) {
      return { name: 'processing_status', status: 'unhealthy', message: 'Processing stuck' }
    }
    
    const progress = (phase.completedGenres.length / (phase.completedGenres.length + phase.failedGenres.length + 1)) * 100
    
    return { 
      name: 'processing_status', 
      status: 'healthy', 
      message: `Processing ${progress.toFixed(0)}% complete` 
    }
  }
}