import { NextRequest, NextResponse } from 'next/server'

// KV書き込み数を追跡するためのメモリストレージ（簡易版）
// 本番環境では別のKVまたは外部DBを使用することを推奨
let writeCount: { [key: string]: number } = {}
let lastReset: string = new Date().toISOString().split('T')[0]!

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET
  
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]!
  
  // 日付が変わったらカウントをリセット
  if (today !== lastReset) {
    writeCount = {}
    lastReset = today
  }

  try {
    // Cloudflare Analytics API を使用してKV書き込み数を取得
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN
    
    if (!accountId || !apiToken) {
      return NextResponse.json({ 
        error: 'Cloudflare credentials not configured',
        manualCount: writeCount[today] || 0
      }, { status: 500 })
    }

    // Analytics APIからKV書き込み数を取得（過去1時間）
    const analyticsUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/analytics`
    const response = await fetch(analyticsUrl, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Analytics API error: ${response.status}`)
    }

    const data = await response.json()
    
    // 手動カウントと組み合わせて返す
    return NextResponse.json({
      date: today,
      manualCount: writeCount[today] || 0,
      cloudflareData: data,
      warning: (writeCount[today] || 0) > 100 ? 'HIGH_WRITE_COUNT_DETECTED' : null,
      message: 'KV write monitoring active'
    })

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch analytics',
      manualCount: writeCount[today] || 0,
      date: today
    }, { status: 500 })
  }
}

// 書き込み数を手動で記録するエンドポイント
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET
  
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]!
  
  // 日付が変わったらカウントをリセット
  if (today !== lastReset) {
    writeCount = {}
    lastReset = today
  }

  // カウントを増やす
  writeCount[today] = (writeCount[today] || 0) + 1

  // 100回を超えたら警告とキルスイッチ有効化
  if (writeCount[today] > 100) {
    // 自動的にキルスイッチを有効化
    try {
      await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/monitor/kv-kill-switch`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${expectedToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: `Auto-triggered: ${writeCount[today]} writes detected (limit: 100)`,
          autoTriggered: true
        })
      })
    } catch (error) {
      console.error('[KV Monitor] Failed to activate kill switch:', error)
    }
    
    return NextResponse.json({
      error: 'WRITE_LIMIT_EXCEEDED',
      count: writeCount[today],
      message: 'KV write limit exceeded - kill switch activated',
      killSwitchActivated: true
    }, { status: 429 })
  }

  return NextResponse.json({
    count: writeCount[today],
    date: today,
    remaining: 1000 - writeCount[today]
  })
}