import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// KV書き込みのキルスイッチ状態を管理
let killSwitchActive = false
let killSwitchReason = ''
let killSwitchActivatedAt: string | null = null

// GET: キルスイッチの状態を確認
export async function GET(request: NextRequest) {
  return NextResponse.json({
    active: killSwitchActive,
    reason: killSwitchReason,
    activatedAt: killSwitchActivatedAt,
    message: killSwitchActive ? 'KV writes are currently suspended' : 'KV writes are enabled'
  })
}

// POST: キルスイッチを有効化
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET
  
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { reason = 'Manual activation', autoTriggered = false } = body

    killSwitchActive = true
    killSwitchReason = reason
    killSwitchActivatedAt = new Date().toISOString()

    // Cloudflare KVにも停止フラグを書き込む（この1回の書き込みは許可）
    if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_KV_API_TOKEN) {
      try {
        const kvResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/KILL_SWITCH_ACTIVE`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${process.env.CLOUDFLARE_KV_API_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              active: true,
              reason,
              activatedAt: killSwitchActivatedAt,
              autoTriggered
            })
          }
        )

        if (!kvResponse.ok) {
          console.error('Failed to set kill switch in KV:', await kvResponse.text())
        }
      } catch (error) {
        console.error('Error setting kill switch in KV:', error)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Kill switch activated',
      active: killSwitchActive,
      reason: killSwitchReason,
      activatedAt: killSwitchActivatedAt,
      autoTriggered
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to activate kill switch',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// DELETE: キルスイッチを無効化
export async function DELETE(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.CRON_SECRET
  
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  killSwitchActive = false
  killSwitchReason = ''
  killSwitchActivatedAt = null

  // Cloudflare KVからも削除
  if (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_KV_API_TOKEN) {
    try {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/storage/kv/namespaces/${process.env.CLOUDFLARE_KV_NAMESPACE_ID}/values/KILL_SWITCH_ACTIVE`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${process.env.CLOUDFLARE_KV_API_TOKEN}`
          }
        }
      )
    } catch (error) {
      console.error('Error removing kill switch from KV:', error)
    }
  }

  return NextResponse.json({
    success: true,
    message: 'Kill switch deactivated',
    active: killSwitchActive
  })
}