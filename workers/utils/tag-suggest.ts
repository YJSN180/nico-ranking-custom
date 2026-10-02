/**
 * タグ候補の照合（Worker・Next の両方から使う。実行環境の API に依存しない）
 *
 * 照合は NFKC + 小文字で行う（全角英数や大文字でも同じ候補になる）。
 * 前方一致を辞書の順で先に並べ、足りない分を部分一致（辞書の順）で埋める。
 */

export const TAG_SUGGEST_MIN_QUERY = 2
export const TAG_SUGGEST_MAX_QUERY = 100

/** 辞書の順のまま、元のタグと照合用のキーを同じ添字で持つ */
export interface TagIndex {
  readonly tags: readonly string[]
  readonly keys: readonly string[]
}

export function normalizeTagQuery(raw: string): string {
  return raw.trim().normalize('NFKC').toLowerCase()
}

export function buildTagIndex(tags: unknown): TagIndex {
  const sourceTags: string[] = []
  const keys: string[] = []
  if (!Array.isArray(tags)) return { tags: sourceTags, keys }
  for (const tag of tags) {
    if (typeof tag !== 'string' || tag === '') continue
    const key = tag.normalize('NFKC').toLowerCase()
    sourceTags.push(tag)
    // 約 45 万件を持つため、キーが元のタグと同じなら複製を持たない
    keys.push(key === tag ? tag : key)
  }
  return { tags: sourceTags, keys }
}

export function suggestTags(index: TagIndex, query: string, limit: number): string[] {
  const needle = normalizeTagQuery(query)
  if (needle === '' || !(limit >= 1)) return []
  const prefixMatches: string[] = []
  const substringMatches: string[] = []
  const { tags, keys } = index
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (key.startsWith(needle)) {
      prefixMatches.push(tags[i])
      // 前方一致だけで埋まったら残りは見ない
      if (prefixMatches.length >= limit) return prefixMatches
    } else if (substringMatches.length < limit && key.includes(needle)) {
      substringMatches.push(tags[i])
    }
  }
  return prefixMatches.concat(substringMatches.slice(0, limit - prefixMatches.length))
}
