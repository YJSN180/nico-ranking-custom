// リアルタイム区間のタグ補完API（検索リアルタイム統合計画 S4）
// 検索結果の表示後にクライアントが非同期で呼び、リアルタイム区間の動画に
// tags / tagDetails（isLocked 含む）を後付けする。これによりタグ系のユーザーNG・
// タグ表示トグル・粗悪除外のタグ条件がリアルタイム区間でも機能する。
// ロック情報が分かったここで自動 NG のロックタグ規則 D を当て、該当する動画を hiddenIds で返す（画面で隠す）。
import { NextRequest, NextResponse } from 'next/server'
import { fetchTagDetailsForVideos, sanitizeVideoIds } from '@/lib/search/realtime-tags'
import { getLqngConfig, isLqngEnabled } from '@/lib/lqng/server'
import { lockTagRuleHits } from '@/lib/lqng/request-rules'

export const revalidate = 0

/** 全体の期限。関数の上限（vercel.json の maxDuration 15 秒）より前に、取れた分だけで応答する */
const REALTIME_TAGS_DEADLINE_MS = 8000
/** 自動 NG の設定の KV 読み取り 1 回のタイムアウト（再試行を含めて全体の期限で打ち切る） */
const KV_READ_TIMEOUT_MS = 3000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const ids = sanitizeVideoIds(request.nextUrl.searchParams.get('ids'))
  if (ids.length === 0) {
    return NextResponse.json({ error: 'no_ids' }, { status: 400 })
  }
  const started = Date.now()
  const deadline = AbortSignal.timeout(REALTIME_TAGS_DEADLINE_MS)
  // 自動 NG の設定は上流の問い合わせと並列に読む（失敗や期限切れでも投げず、直前の成功値か無効で続く）
  const configPromise = isLqngEnabled()
    ? getLqngConfig({ signal: deadline, timeoutMs: KV_READ_TIMEOUT_MS }).catch(() => null)
    : Promise.resolve(null)
  const result = await fetchTagDetailsForVideos(ids, { signal: deadline })
  const hiddenIds = lockTagRuleHits(
    Object.entries(result.tagDetails).map(([id, tagDetails]) => ({ id, authorId: result.authorIds[id] ?? null, tagDetails })),
    await configPromise
  )
  return NextResponse.json(
    { tagDetails: result.tagDetails, failed: result.failed, hiddenIds, elapsedMs: Date.now() - started },
    {
      headers: {
        // 新着動画のタグは変わりうるが、数分のキャッシュは許容。取れなかった分がある応答は短くする
        'Cache-Control':
          result.failed.length > 0 ? 'public, s-maxage=60, stale-while-revalidate=60' : 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  )
}
