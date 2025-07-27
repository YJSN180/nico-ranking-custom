/**
 * Vercelログに出力するためのクライアントサイドログ関数
 */

type LogLevel = 'info' | 'warn' | 'error'

async function sendLogToServer(level: LogLevel, message: string, data?: any) {
  // 開発環境では通常のconsole.logも併用
  if (process.env.NODE_ENV === 'development') {
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
  }

  try {
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