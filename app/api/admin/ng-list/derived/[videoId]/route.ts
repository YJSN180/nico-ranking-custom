import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ videoId: string }> }
) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { videoId } = await context.params
    
    if (!videoId) {
      return NextResponse.json({ error: 'Video ID required' }, { status: 400 })
    }
    
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return NextResponse.json({ error: 'KV credentials not configured' }, { status: 500 })
    }
    
    // Get current derived NG list
    const getResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
      {
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`
        }
      }
    )
    
    let derivedList: string[] = []
    if (getResponse.ok) {
      derivedList = await getResponse.json()
    }
    
    // Remove the video ID from the list
    const updatedList = derivedList.filter(id => id !== videoId)
    
    // Save updated list
    const putResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
      {
        method: 'PUT',
        headers: {
          "Authorization": `Bearer ${CF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(updatedList)
      }
    )
    
    if (!putResponse.ok) {
      throw new Error(`Failed to update list: ${putResponse.statusText}`)
    }
    
    return NextResponse.json({
      success: true,
      message: `Video ${videoId} removed from derived NG list`,
      remainingCount: updatedList.length
    })
  } catch (error) {
    console.error('Error removing from derived NG list:', error)
    return NextResponse.json({ error: 'Failed to remove from derived NG list' }, { status: 500 })
  }
}