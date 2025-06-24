/**
 * Notification Service for sending alerts to various channels
 * Supports Slack webhooks and can be extended for other services
 */

export interface NotificationPayload {
  title: string
  message: string
  status: 'success' | 'error' | 'warning' | 'info'
  metadata?: Record<string, unknown>
}

export interface SlackAttachment {
  color: 'good' | 'warning' | 'danger' | string
  title: string
  text?: string
  fields?: Array<{
    title: string
    value: string
    short?: boolean
  }>
  footer?: string
  ts?: number
}

export interface SlackPayload {
  channel?: string
  username?: string
  icon_emoji?: string
  text?: string
  attachments?: SlackAttachment[]
}

export class NotificationService {
  private static readonly SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL
  
  /**
   * Send notification to Slack channel
   */
  static async sendSlackNotification(payload: SlackPayload): Promise<boolean> {
    if (!this.SLACK_WEBHOOK_URL) {
      // eslint-disable-next-line no-console
      console.warn('[NotificationService] SLACK_WEBHOOK_URL not configured')
      return false
    }

    try {
      const response = await fetch(this.SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.error('[NotificationService] Slack notification failed:', response.status, response.statusText)
        return false
      }

      // eslint-disable-next-line no-console
      console.log('[NotificationService] Slack notification sent successfully')
      return true
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[NotificationService] Failed to send Slack notification:', error)
      return false
    }
  }

  /**
   * Send test result notification to Slack
   */
  static async sendTestResultNotification(
    testName: string,
    passed: number,
    failed: number,
    total: number,
    duration?: number,
    failedTests?: string[]
  ): Promise<boolean> {
    const isSuccess = failed === 0
    const status = isSuccess ? 'success' : 'failure'
    
    const payload: SlackPayload = {
      channel: '#nico-ranking-alerts',
      username: 'Test Reporter',
      icon_emoji: isSuccess ? ':white_check_mark:' : ':x:',
      attachments: [
        {
          color: isSuccess ? 'good' : 'danger',
          title: `${isSuccess ? '✅' : '❌'} ${testName} Results`,
          fields: [
            {
              title: 'Status',
              value: isSuccess ? 'All tests passed' : 'Some tests failed',
              short: true,
            },
            {
              title: 'Summary',
              value: `${passed}/${total} passed${failed > 0 ? `, ${failed} failed` : ''}`,
              short: true,
            },
            ...(duration ? [{
              title: 'Duration',
              value: `${Math.round(duration / 1000)}s`,
              short: true,
            }] : []),
            ...(failedTests && failedTests.length > 0 ? [{
              title: 'Failed Tests',
              value: failedTests.slice(0, 5).join('\n') + (failedTests.length > 5 ? `\n... and ${failedTests.length - 5} more` : ''),
              short: false,
            }] : []),
          ],
          footer: 'Automated Test System',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    return this.sendSlackNotification(payload)
  }

  /**
   * Send E2E test performance alert
   */
  static async sendPerformanceAlert(
    url: string,
    metric: string,
    value: number,
    threshold: number,
    severity: 'warning' | 'critical' = 'warning'
  ): Promise<boolean> {
    const payload: SlackPayload = {
      channel: '#nico-ranking-alerts',
      username: 'Performance Monitor',
      icon_emoji: severity === 'critical' ? ':rotating_light:' : ':warning:',
      attachments: [
        {
          color: severity === 'critical' ? 'danger' : 'warning',
          title: `🚨 Performance Alert: ${metric}`,
          fields: [
            {
              title: 'URL',
              value: url,
              short: false,
            },
            {
              title: 'Metric',
              value: metric,
              short: true,
            },
            {
              title: 'Value',
              value: `${value}ms`,
              short: true,
            },
            {
              title: 'Threshold',
              value: `${threshold}ms`,
              short: true,
            },
            {
              title: 'Severity',
              value: severity.toUpperCase(),
              short: true,
            },
          ],
          footer: 'Performance Monitoring System',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    return this.sendSlackNotification(payload)
  }

  /**
   * Send deployment notification
   */
  static async sendDeploymentNotification(
    environment: string,
    status: 'started' | 'success' | 'failed',
    version?: string,
    url?: string
  ): Promise<boolean> {
    const isSuccess = status === 'success'
    const isStarted = status === 'started'
    
    const payload: SlackPayload = {
      channel: '#nico-ranking-deployments',
      username: 'Deploy Bot',
      icon_emoji: isStarted ? ':rocket:' : (isSuccess ? ':white_check_mark:' : ':x:'),
      attachments: [
        {
          color: isStarted ? '#0066cc' : (isSuccess ? 'good' : 'danger'),
          title: `${isStarted ? '🚀' : (isSuccess ? '✅' : '❌')} Deployment ${status} - ${environment}`,
          fields: [
            {
              title: 'Environment',
              value: environment,
              short: true,
            },
            {
              title: 'Status',
              value: status.charAt(0).toUpperCase() + status.slice(1),
              short: true,
            },
            ...(version ? [{
              title: 'Version',
              value: version,
              short: true,
            }] : []),
            ...(url ? [{
              title: 'URL',
              value: url,
              short: false,
            }] : []),
          ],
          footer: 'Deployment System',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    }

    return this.sendSlackNotification(payload)
  }
}