import { NextRequest, NextResponse } from 'next/server'

// 開発時だけ、クライアントのログを開発サーバーの端末に出す。
// 認証の無い書き込み口なので、本番ビルド（プレビューを含む）では 404 を返す。
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  try {
    const { level, message, data, timestamp } = await request.json()

    const logMessage = `[CLIENT-DEBUG] ${timestamp} ${level}: ${message}`
    
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(logMessage, data ? JSON.stringify(data, null, 2) : '')
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(logMessage, data ? JSON.stringify(data, null, 2) : '')
    } else {
      // eslint-disable-next-line no-console
      console.log(logMessage, data ? JSON.stringify(data, null, 2) : '')
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[DEBUG-LOG-API] Failed to log:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}