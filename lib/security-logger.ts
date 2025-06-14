/**
 * Structured security event logging system
 */

export interface SecurityEvent {
  timestamp: string
  event: SecurityEventType
  ip: string
  userAgent?: string
  path?: string
  method?: string
  statusCode?: number
  details?: Record<string, any>
}

export enum SecurityEventType {
  // Authentication events
  INVALID_WORKER_AUTH = 'INVALID_WORKER_AUTH',
  INVALID_ADMIN_CREDENTIALS = 'INVALID_ADMIN_CREDENTIALS',
  ADMIN_LOGIN_SUCCESS = 'ADMIN_LOGIN_SUCCESS',
  
  // Rate limiting events
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  RATE_LIMIT_WARNING = 'RATE_LIMIT_WARNING',
  
  // Security violations
  DEBUG_ENDPOINT_ACCESS = 'DEBUG_ENDPOINT_ACCESS',
  DANGEROUS_PATH_ACCESS = 'DANGEROUS_PATH_ACCESS',
  SUSPICIOUS_USER_AGENT = 'SUSPICIOUS_USER_AGENT',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  PATH_TRAVERSAL_ATTEMPT = 'PATH_TRAVERSAL_ATTEMPT',
  
  // DDoS indicators
  HIGH_FREQUENCY_ACCESS = 'HIGH_FREQUENCY_ACCESS',
  UNUSUAL_TRAFFIC_PATTERN = 'UNUSUAL_TRAFFIC_PATTERN',
  
  // General security
  SECURITY_HEADER_MISSING = 'SECURITY_HEADER_MISSING',
  UNAUTHORIZED_ACCESS = 'UNAUTHORIZED_ACCESS',
  BLOCKED_IP = 'BLOCKED_IP',
  BLOCKED_COUNTRY = 'BLOCKED_COUNTRY'
}

export class SecurityLogger {
  private static readonly LOG_PREFIX = '[SECURITY]'
  
  /**
   * Log a security event
   */
  static log(event: Omit<SecurityEvent, 'timestamp'>): void {
    if (process.env.NODE_ENV !== 'production') {
      // 開発環境では簡略化されたログ
      // eslint-disable-next-line no-console
      console.log(`${this.LOG_PREFIX} ${event.event}`, {
        ip: event.ip,
        path: event.path
      })
      return
    }

    const logEntry: SecurityEvent = {
      ...event,
      timestamp: new Date().toISOString()
    }

    // 本番環境では構造化ログ
    // eslint-disable-next-line no-console
    console.warn(this.LOG_PREFIX, JSON.stringify(logEntry))

    // Critical events should trigger alerts
    if (this.isCriticalEvent(event.event)) {
      this.triggerAlert(logEntry)
    }
  }

  /**
   * Check if an event is critical and needs immediate attention
   */
  private static isCriticalEvent(eventType: SecurityEventType): boolean {
    const criticalEvents = [
      SecurityEventType.SQL_INJECTION_ATTEMPT,
      SecurityEventType.XSS_ATTEMPT,
      SecurityEventType.PATH_TRAVERSAL_ATTEMPT,
      SecurityEventType.UNUSUAL_TRAFFIC_PATTERN,
      SecurityEventType.HIGH_FREQUENCY_ACCESS
    ]
    return criticalEvents.includes(eventType)
  }

  /**
   * Trigger an alert for critical events
   */
  private static triggerAlert(event: SecurityEvent): void {
    // In production, this would send to monitoring service
    // eslint-disable-next-line no-console
    console.error(`${this.LOG_PREFIX} CRITICAL ALERT:`, event)
  }

  /**
   * Log rate limit event with details
   */
  static logRateLimit(
    ip: string,
    path: string,
    userAgent?: string,
    limit?: number,
    windowMs?: number
  ): void {
    this.log({
      event: SecurityEventType.RATE_LIMIT_EXCEEDED,
      ip,
      path,
      userAgent,
      details: { limit, windowMs }
    })
  }

  /**
   * Log authentication failure
   */
  static logAuthFailure(
    type: 'admin' | 'worker',
    ip: string,
    path: string,
    userAgent?: string,
    username?: string
  ): void {
    this.log({
      event: type === 'admin' 
        ? SecurityEventType.INVALID_ADMIN_CREDENTIALS
        : SecurityEventType.INVALID_WORKER_AUTH,
      ip,
      path,
      userAgent,
      details: { username }
    })
  }

  /**
   * Log suspicious activity
   */
  static logSuspiciousActivity(
    ip: string,
    path: string,
    reason: string,
    userAgent?: string
  ): void {
    // Check for common attack patterns
    const event = this.detectAttackPattern(path, userAgent || '')
    
    this.log({
      event,
      ip,
      path,
      userAgent,
      details: { reason }
    })
  }

  /**
   * Detect common attack patterns
   */
  private static detectAttackPattern(path: string, userAgent: string): SecurityEventType {
    // SQL injection patterns
    if (/(\bunion\b|\bselect\b|\bdrop\b|\binsert\b|\bupdate\b|\bdelete\b)/i.test(path)) {
      return SecurityEventType.SQL_INJECTION_ATTEMPT
    }

    // XSS patterns
    if (/<script|javascript:|onerror=|onload=/i.test(path)) {
      return SecurityEventType.XSS_ATTEMPT
    }

    // Path traversal
    if (/\.\.\/|\.\.\\|%2e%2e/i.test(path)) {
      return SecurityEventType.PATH_TRAVERSAL_ATTEMPT
    }

    // Suspicious user agents
    if (/sqlmap|nikto|nmap|masscan|python-requests/i.test(userAgent)) {
      return SecurityEventType.SUSPICIOUS_USER_AGENT
    }

    return SecurityEventType.DANGEROUS_PATH_ACCESS
  }
}