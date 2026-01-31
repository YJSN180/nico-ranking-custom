import { NextRequest, NextResponse } from 'next/server'
import { DERIVED_NG_VIDEO_INFO_MAP_KEY, DERIVED_NG_VIDEO_INFO_META_KEY } from '@/lib/admin-ng-constants'

export const runtime = 'nodejs'

interface DerivedVideoInfoEntry {
  title?: string
  authorName?: string | null
  isDeleted?: boolean
  updatedAt?: string
}

interface DerivedVideoInfoMeta {
  lastRunAt?: string | null
  lastRefreshAt?: string | null
}

const fetchKvValue = async <T,>(
  accountId: string,
  namespaceId: string,
  apiToken: string,
  key: string
): Promise<T | null> => {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${key}`,
    {
      headers: {
        Authorization: `Bearer ${apiToken}`
      }
    }
  )

  if (response.ok) {
    return (await response.json()) as T
  }

  if (response.status === 404) {
    return null
  }

  throw new Error(`Failed to fetch KV value (${key}): ${response.status}`)
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cookie = request.cookies.get('admin-auth')

  if (!authHeader && !cookie?.value) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID
  const CF_NAMESPACE_ID = process.env.CLOUDFLARE_KV_NAMESPACE_ID
  const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN

  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN) {
    return NextResponse.json({ videos: {}, updatedAt: null })
  }

  try {
    const [map, meta] = await Promise.all([
      fetchKvValue<Record<string, DerivedVideoInfoEntry>>(
        CF_ACCOUNT_ID,
        CF_NAMESPACE_ID,
        CF_API_TOKEN,
        DERIVED_NG_VIDEO_INFO_MAP_KEY
      ),
      fetchKvValue<DerivedVideoInfoMeta>(
        CF_ACCOUNT_ID,
        CF_NAMESPACE_ID,
        CF_API_TOKEN,
        DERIVED_NG_VIDEO_INFO_META_KEY
      )
    ])

    return NextResponse.json({
      videos: map || {},
      updatedAt: meta?.lastRunAt || null,
      lastRefreshAt: meta?.lastRefreshAt || null
    })
  } catch (error) {
    console.error('Error fetching derived NG video info cache:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
