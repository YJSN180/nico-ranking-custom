/**
 * 開発時だけ、クライアントのログをブラウザのコンソールと開発サーバーの端末（/api/debug-log）に出す。
 * 本番ビルドでは何もしない（/api/debug-log も本番では 404）。
 */

import { requestThrottle } from './request-throttle'

type LogLevel = 'info' | 'warn' | 'error'

async function sendLogToServer(level: LogLevel, message: string, data?: any) {
  // SSR 中（window が無い）も送らない。相対 URL の fetch はサーバーでは失敗する
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
    return
  }

  if (level === 'error') {
    // eslint-disable-next-line no-console
    console.error(`[DEBUG] ${message}`, data)
  } else if (level === 'warn') {
    // eslint-disable-next-line no-console
    console.warn(`[DEBUG] ${message}`, data)
  } else {
    // eslint-disable-next-line no-console
    console.log(`[DEBUG] ${message}`, data)
  }

  try {
    // レート制限を適用してからリクエスト
    await requestThrottle.throttle('/api/debug-log')
    
    await fetch('/api/debug-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        level,
        message,
        data,
        timestamp: new Date().toISOString()
      })
    })
  } catch (error) {
    // ログ送信に失敗してもアプリケーションは継続
    // eslint-disable-next-line no-console
    console.error('Failed to send log to server:', error)
  }
}

export const serverLog = {
  info: (message: string, data?: any) => sendLogToServer('info', message, data),
  warn: (message: string, data?: any) => sendLogToServer('warn', message, data),
  error: (message: string, data?: any) => sendLogToServer('error', message, data)
}
