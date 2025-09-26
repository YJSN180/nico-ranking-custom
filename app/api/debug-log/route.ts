import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { level, message, data, timestamp } = await request.json()
    
    // Vercelログに出力（本番環境でも表示される）
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