import { NextRequest, NextResponse } from 'next/server'

// Edge Runtime指定
export const runtime = 'edge'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  // Basic authentication check
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')
  
  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { videoId } = params

  // Validate video ID format (sm followed by numbers)
  if (!videoId || !/^sm\d+$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid video ID format' }, { status: 400 })
  }

  try {
    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_KV_API_TOKEN
    
    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    // 1. Get current derived list
    const getUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`
    
    const getResponse = await fetch(getUrl, {
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`
      }
    })
    
    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        return NextResponse.json({ error: 'Derived NG list is empty' }, { status: 404 })
      }
      throw new Error(`Failed to fetch derived list: ${getResponse.status}`)
    }

    const currentList: string[] = await getResponse.json()
    
    // 2. Check if video ID exists in the list
    const filteredList = currentList.filter(id => id !== videoId)
    
    if (filteredList.length === currentList.length) {
      return NextResponse.json({ error: 'Video ID not found in derived NG list' }, { status: 404 })
    }

    // 3. Update the list in KV
    const putResponse = await fetch(getUrl, {
      method: 'PUT',
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(filteredList)
    })
    
    if (!putResponse.ok) {
      throw new Error(`Failed to update derived list: ${putResponse.status}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Video ID removed from derived NG list',
      remainingCount: filteredList.length
    })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete video ID' }, { status: 500 })
  }
}