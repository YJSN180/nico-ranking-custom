import { NextRequest, NextResponse } from 'next/server'
import { DERIVED_NG_BULK_DELETE_LIMIT } from '@/lib/admin-ng-constants'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')

  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const rawIds = Array.isArray(body?.videoIds) ? body.videoIds : []
    const videoIds: string[] = Array.from(
      new Set(
        rawIds
          .map((id: unknown): string => (typeof id === 'string' ? id.trim() : ''))
          .filter((id): id is string => Boolean(id))
      )
    )

    if (videoIds.length === 0) {
      return NextResponse.json({ error: 'Video IDs required' }, { status: 400 })
    }

    if (videoIds.length > DERIVED_NG_BULK_DELETE_LIMIT) {
      return NextResponse.json(
        { error: `Too many video IDs (max ${DERIVED_NG_BULK_DELETE_LIMIT})` },
        { status: 400 }
      )
    }

    const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
    const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
    const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

    if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
      return NextResponse.json({ error: 'KV credentials not configured' }, { status: 500 })
    }

    const getResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
      {
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`
        }
      }
    )

    let derivedList: string[] = []
    if (getResponse.ok) {
      derivedList = await getResponse.json()
    } else if (getResponse.status !== 404) {
      throw new Error(`Failed to fetch derived list: ${getResponse.statusText}`)
    }

    const derivedSet = new Set(derivedList)
    const removed: string[] = []
    const failed: string[] = []

    for (const id of videoIds) {
      if (derivedSet.has(id)) {
        derivedSet.delete(id)
        removed.push(id)
      } else {
        failed.push(id)
      }
    }

    const updatedList = Array.from(derivedSet)
    const putResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/ng-list-derived`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedList)
      }
    )

    if (!putResponse.ok) {
      throw new Error(`Failed to update derived list: ${putResponse.statusText}`)
    }

    return NextResponse.json({
      removed,
      failed,
      remainingCount: updatedList.length
    })
  } catch (error) {
    console.error('Error bulk deleting derived NG list:', error)
    return NextResponse.json({ error: 'Failed to bulk delete derived NG list' }, { status: 500 })
  }
}
