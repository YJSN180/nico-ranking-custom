// 検索結果の投稿者情報補完API
// Snapshot API には投稿者名・アイコンが無いため、検索結果の表示後にクライアントが
// 非同期で呼び、ランキング画面と同じ投稿者表示（名前・アイコン・リンク）にする。
// 名前が分かったここで管理者の投稿者名 NG を当て、該当する投稿者を hiddenAuthorIds で返す（画面で隠す）。
//   users  = ユーザーID（数字）のカンマ区切り
//   videos = チャンネル動画の動画ID（チャンネルごとに代表 1 件）のカンマ区切り
import { NextRequest, NextResponse } from 'next/server'
import { authorIdsMatchingNames, fetchOwnerInfo, sanitizeChannelVideoIds, sanitizeUserIds } from '@/lib/search/owner-info'
import { getServerNGList } from '@/lib/ng-list-server'
import { matchesAuthorNameNG } from '@/lib/ng-filter-core'

export const revalidate = 0

/** 全体の期限。関数の上限（vercel.json の maxDuration 15 秒）より前に、取れた分だけで応答する */
const OWNERS_DEADLINE_MS = 8000
/** 管理者 NG の KV 読み取り 1 回のタイムアウト（再試行を含めて全体の期限で打ち切る） */
const KV_READ_TIMEOUT_MS = 3000

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userIds = sanitizeUserIds(request.nextUrl.searchParams.get('users'))
  const channelVideoIds = sanitizeChannelVideoIds(request.nextUrl.searchParams.get('videos'))
  if (userIds.length === 0 && channelVideoIds.length === 0) {
    return NextResponse.json({ error: 'no_ids' }, { status: 400 })
  }
  const started = Date.now()
  const deadline = AbortSignal.timeout(OWNERS_DEADLINE_MS)
  // 管理者 NG は上流の問い合わせと並列に読む（失敗や期限切れでも投げず、直前の成功値か空で続く）
  const ngListPromise = getServerNGList({ signal: deadline, timeoutMs: KV_READ_TIMEOUT_MS })
  const result = await fetchOwnerInfo({ userIds, channelVideoIds }, { signal: deadline })
  const { authorNames } = await ngListPromise
  const hiddenAuthorIds = authorIdsMatchingNames(result, (name) => matchesAuthorNameNG(name, authorNames))
  return NextResponse.json(
    {
      users: result.users,
      channels: result.channels,
      missing: result.missing,
      failed: result.failed,
      hiddenAuthorIds,
      elapsedMs: Date.now() - started,
    },
    {
      headers: {
        // 名前・アイコン（サーバーのメモリにも 1 日置く）より、管理者 NG の変更を数分で反映させることを優先する。
        // 取れなかった分がある応答は、同じ URL で取り直せるようにさらに短くする
        'Cache-Control':
          result.failed.length > 0 ? 'public, s-maxage=60, stale-while-revalidate=60' : 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  )
}
