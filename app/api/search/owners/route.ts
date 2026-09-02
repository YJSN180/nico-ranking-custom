// 検索結果の投稿者情報補完API
// Snapshot API には投稿者名・アイコンが無いため、検索結果の表示後にクライアントが
// 非同期で呼び、ランキング画面と同じ投稿者表示（名前・アイコン・リンク）にする。
//   users  = ユーザーID（数字）のカンマ区切り
//   videos = チャンネル動画の動画ID（チャンネルごとに代表 1 件）のカンマ区切り
import { NextRequest, NextResponse } from 'next/server'
import { fetchOwnerInfo, sanitizeChannelVideoIds, sanitizeUserIds } from '@/lib/search/owner-info'

export const revalidate = 0

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userIds = sanitizeUserIds(request.nextUrl.searchParams.get('users'))
  const channelVideoIds = sanitizeChannelVideoIds(request.nextUrl.searchParams.get('videos'))
  if (userIds.length === 0 && channelVideoIds.length === 0) {
    return NextResponse.json({ error: 'no_ids' }, { status: 400 })
  }
  const started = Date.now()
  const result = await fetchOwnerInfo({ userIds, channelVideoIds })
  return NextResponse.json(
    { users: result.users, channels: result.channels, failed: result.failed, elapsedMs: Date.now() - started },
    // 投稿者名・アイコンは滅多に変わらないので CDN でも長めに保持する
    { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } }
  )
}
