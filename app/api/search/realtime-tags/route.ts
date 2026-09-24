// リアルタイム区間のタグ補完API（検索リアルタイム統合計画 S4）
// 検索結果の表示後にクライアントが非同期で呼び、リアルタイム区間の動画に
// tags / tagDetails（isLocked 含む）を後付けする。これによりタグ系のユーザーNG・
// タグ表示トグル・粗悪除外のタグ条件がリアルタイム区間でも機能する。
import { NextRequest, NextResponse } from 'next/server'
import { fetchTagDetailsForVideos, sanitizeVideoIds } from '@/lib/search/realtime-tags'

export const revalidate = 0

/** 全体の期限。関数の上限（vercel.json の maxDuration 15 秒）より前に、取れた分だけで応答する */
const REALTIME_TAGS_DEADLINE_MS = 8000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ids = sanitizeVideoIds(request.nextUrl.searchParams.get('ids'))
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no_ids' }, { status: 400 })
  }
  const started = Date.now()
  const result = await fetchTagDetailsForVideos(ids, { signal: AbortSignal.timeout(REALTIME_TAGS_DEADLINE_MS) })
  return NextResponse.json(
    { tagDetails: result.tagDetails, failed: result.failed, elapsedMs: Date.now() - started },
    {
      headers: {
        // 新着動画のタグは変わりうるが、数分のキャッシュは許容。取れなかった分がある応答は短くする
        'Cache-Control':
          result.failed.length > 0 ? 'public, s-maxage=60, stale-while-revalidate=60' : 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  )
}
