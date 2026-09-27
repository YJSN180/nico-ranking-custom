import type { Mylist, MylistVideo } from './types'

/**
 * 取り込みに使うマイリストバックアップの中身（検証・正規化済み）
 */
export interface MylistBackupContent {
  mylists: Mylist[]
  mylistVideos: MylistVideo[]
}

export const INVALID_MYLIST_BACKUP_MESSAGE = '無効なファイル形式です。マイリストか動画の ID が欠けています'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * 数値の日時はそのまま、日時文字列は数値に直す。どちらでもなければ fallback。
 * 動画の addedAt が数値でないと、一覧の索引（mylistId-addedAt の数値範囲）から外れて
 * 詳細画面に出なくなるため、必ず数値にする
 */
function toTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * バックアップの mylists / mylistVideos を検証し、既知の項目だけを正しい型で持つレコードに組み直す。
 * IndexedDB のキーになる ID（マイリスト id、動画 id と所属 mylistId）が文字列でない
 * データが 1 件でもあれば、ファイル全体を受け付けない（そのレコードだけ書き込みに失敗し、
 * 一部だけ取り込まれた状態になるため）。
 */
export function parseMylistBackupContent(data: unknown, now: number = Date.now()): MylistBackupContent | null {
  if (!isRecord(data) || !Array.isArray(data.mylists) || !Array.isArray(data.mylistVideos)) {
    return null
  }

  const mylists: Mylist[] = []
  for (const raw of data.mylists) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || typeof raw.name !== 'string') {
      return null
    }
    const createdAt = toTimestamp(raw.createdAt, now)
    const description = optionalString(raw.description)
    mylists.push({
      id: raw.id,
      name: raw.name,
      ...(description !== undefined && { description }),
      createdAt,
      updatedAt: toTimestamp(raw.updatedAt, createdAt),
      videoCount: optionalNumber(raw.videoCount) ?? 0
    })
  }

  const mylistVideos: MylistVideo[] = []
  for (const raw of data.mylistVideos) {
    if (!isRecord(raw) || !isNonEmptyString(raw.id) || !isNonEmptyString(raw.mylistId)) {
      return null
    }
    const video: MylistVideo = {
      id: raw.id,
      mylistId: raw.mylistId,
      title: optionalString(raw.title) ?? '',
      thumbURL: optionalString(raw.thumbURL) ?? '',
      addedAt: toTimestamp(raw.addedAt, now)
    }
    const memo = optionalString(raw.memo)
    if (memo !== undefined) video.memo = memo
    const orderIndex = optionalNumber(raw.orderIndex)
    if (orderIndex !== undefined) video.orderIndex = orderIndex
    const duration = optionalNumber(raw.duration)
    if (duration !== undefined) video.duration = duration
    const registeredAt = optionalString(raw.registeredAt)
    if (registeredAt !== undefined) video.registeredAt = registeredAt
    const authorName = optionalString(raw.authorName)
    if (authorName !== undefined) video.authorName = authorName
    const authorId = optionalString(raw.authorId)
    if (authorId !== undefined) video.authorId = authorId
    const authorIcon = optionalString(raw.authorIcon)
    if (authorIcon !== undefined) video.authorIcon = authorIcon
    // 統計を除く前の古い形式のファイルにだけある項目
    const views = optionalNumber(raw.views)
    if (views !== undefined) video.views = views
    const comments = optionalNumber(raw.comments)
    if (comments !== undefined) video.comments = comments
    const mylistCount = optionalNumber(raw.mylists)
    if (mylistCount !== undefined) video.mylists = mylistCount
    const likes = optionalNumber(raw.likes)
    if (likes !== undefined) video.likes = likes
    mylistVideos.push(video)
  }

  return { mylists, mylistVideos }
}
