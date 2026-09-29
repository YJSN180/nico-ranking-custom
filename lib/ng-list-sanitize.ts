import type { ExtendedUserNGList, TagNGList } from '@/types/ng-list-extended'

// 利用者の NG リスト（端末保存）の要素をそろえる。
// 空文字・空白だけの部分一致はすべての動画に当たり、文字列でないタグは絞り込みの
// toLowerCase で落ちるため、取り込み・読み込みの境界で取り除く。

type MatchLists = { exact: string[]; partial: string[] }

const TAG_TYPES = ['locked', 'user', 'both'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMatchLists(value: unknown): boolean {
  return isRecord(value) && Array.isArray(value.exact) && Array.isArray(value.partial)
}

/**
 * NG の語として使える値だけ残す。数値（手で書いた投稿者 ID など）は文字列に直し、
 * 空・空白だけ・その他の型は捨てる
 */
function sanitizeEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const entries: string[] = []
  for (const entry of value) {
    const text = typeof entry === 'number' && Number.isFinite(entry) ? String(entry) : entry
    if (typeof text === 'string' && text.trim() !== '') {
      entries.push(text)
    }
  }
  return entries
}

function sanitizeMatchLists(value: unknown): MatchLists {
  const lists = isRecord(value) ? value : {}
  return { exact: sanitizeEntries(lists.exact), partial: sanitizeEntries(lists.partial) }
}

/**
 * 取り込むファイルの NG リストが、動画 ID・タイトル・投稿者 ID・投稿者名（・タグ）の
 * 配列を持つ形かどうか。形が違うファイルで「上書き」すると今のリストが空になるため、取り込む前に確かめる
 */
export function hasNGListStructure(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (!Array.isArray(value.videoIds) || !Array.isArray(value.authorIds)) return false
  if (!isMatchLists(value.videoTitles) || !isMatchLists(value.authorNames)) return false
  if (value.tags !== undefined) {
    const tags = value.tags
    if (!isRecord(tags) || !TAG_TYPES.every((type) => isMatchLists(tags[type]))) return false
  }
  return true
}

/**
 * NG リストの各配列を、使える語だけにそろえた写しを返す（ほかの項目はそのまま）。
 * 配列が無い・壊れている項目は空として扱い、例外は投げない
 */
export function sanitizeNGListEntries(list: ExtendedUserNGList): ExtendedUserNGList {
  const sanitized: ExtendedUserNGList = {
    ...list,
    videoIds: sanitizeEntries(list.videoIds),
    videoTitles: sanitizeMatchLists(list.videoTitles),
    authorIds: sanitizeEntries(list.authorIds),
    authorNames: sanitizeMatchLists(list.authorNames),
  }
  if (list.tags !== undefined) {
    const tags: TagNGList = {
      locked: sanitizeMatchLists(list.tags?.locked),
      user: sanitizeMatchLists(list.tags?.user),
      both: sanitizeMatchLists(list.tags?.both),
    }
    sanitized.tags = tags
  }
  return sanitized
}
