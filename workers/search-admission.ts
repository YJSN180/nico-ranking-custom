import { signSearchGrant } from '../lib/search/gateway-grant'
import { validSearchLimits, type SearchLimits } from './search-limits'
import type { SearchBudget } from './search-budget'

export interface SearchAdmissionEnv {
  RANKING_DATA: KVNamespace
  SEARCH_RATE_LIMITER?: RateLimit
  SEARCH_BUDGET?: DurableObjectNamespace<SearchBudget>
  WORKER_AUTH_KEY?: string
}
const reject = (error: string, status = 503, retryAfter?: number) =>
  Response.json(
    { error },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    },
  )
async function bounded<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, fail) => {
        timer = setTimeout(
          () => fail(new Error('search_control_timeout')),
          1500,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
export async function admitSearch(
  request: Request,
  env: SearchAdmissionEnv,
  endpoint: string,
): Promise<string | Response> {
  if (request.method !== 'GET') return reject('method_not_allowed', 405)
  if (
    !env.SEARCH_RATE_LIMITER ||
    !env.SEARCH_BUDGET ||
    !env.RANKING_DATA ||
    !env.WORKER_AUTH_KEY
  ) {
    return reject('search_unavailable')
  }
  try {
    // No worker-key bypass: internal callers consume the same search budget.
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const local = await bounded(
      env.SEARCH_RATE_LIMITER.limit({ key: `${ip}:${endpoint}` }),
    )
    if (!local.success) return reject('rate_limited', 429, 60)
    const control = (await bounded(
      env.RANKING_DATA.get('search:control', 'json'),
    )) as (SearchLimits & { enabled: boolean }) | null
    if (!control || control.enabled !== true) return reject('search_disabled')
    if (!validSearchLimits(control)) return reject('search_unavailable')
    const budget = await bounded(
      env.SEARCH_BUDGET.getByName('search-budget-v1').take(control),
    )
    if (!budget.allowed) return reject('rate_limited', 429, budget.retryAfter)
    return await signSearchGrant(request, env.WORKER_AUTH_KEY)
  } catch {
    return reject('search_unavailable')
  }
}
