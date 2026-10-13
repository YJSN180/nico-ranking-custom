import { NextResponse } from 'next/server'
import { verifySearchGrant } from './gateway-grant'

/** Enforce before CDN access in middleware and again at each route entry. */
export async function searchAccessDenied(
  request: Request,
): Promise<NextResponse | null> {
  const deployed =
    process.env.NODE_ENV === 'production' || !!process.env.VERCEL_ENV
  const headers = {
    'Cache-Control': 'no-store',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
  }
  if (
    process.env.SEARCH_ENABLED === 'false' ||
    (deployed && process.env.SEARCH_ENABLED !== 'true')
  ) {
    return NextResponse.json(
      { error: 'search_disabled' },
      { status: 503, headers },
    )
  }
  // Opt in only on a Vercel preview protected by Deployment Protection.
  // This flag never bypasses the kill switch or the production gateway check.
  if (
    process.env.VERCEL_ENV === 'preview' &&
    process.env.SEARCH_PREVIEW_DIRECT === 'true'
  ) return null
  if (!deployed) return null
  try {
    if (await verifySearchGrant(request, process.env.WORKER_AUTH_KEY ?? ''))
      return null
  } catch {
    /* Missing/invalid key or crypto failure must fail closed. */
  }
  return NextResponse.json(
    { error: 'search_gateway_required' },
    { status: 403, headers },
  )
}
