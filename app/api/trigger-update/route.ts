import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST() {
  try {
    // Trigger the cron endpoint with the secret
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    
    const response = await fetch(`${baseUrl}/api/cron/fetch`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Cron trigger failed: ${response.status}`)
    }
    
    const data = await response.json()
    
    return NextResponse.json({
      success: true,
      ...data
    })
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to trigger update',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}