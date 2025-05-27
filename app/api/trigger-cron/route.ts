import { NextResponse } from 'next/server'
import { POST as cronFetch } from '../cron/fetch/route'

// 開発用：CRON_SECRETなしでcronをトリガー
export async function GET() {
  const cronSecret = process.env.CRON_SECRET || 'development-secret'
  
  const request = new Request('http://localhost:3000/api/cron/fetch', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cronSecret}`,
    },
  })

  const response = await cronFetch(request)
  const data = await response.json()
  
  return NextResponse.json({
    ...data,
    triggeredAt: new Date().toISOString(),
  })
}