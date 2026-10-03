/**
 * タグ候補の照合（Worker・Next の両方から使う。実行環境の API に依存しない）
 *
 * 照合は NFKC + 小文字で行う（全角英数や大文字でも同じ候補になる）。
 * 辞書に人気度があれば、キーが入力と同じタグ・前方一致・部分一致の順に、それぞれ人気度の高い順（同じなら辞書の順）で並べる。
 * 人気度がなければ（旧形式の辞書）、前方一致を辞書の順で先に並べ、足りない分を部分一致（辞書の順）で埋める。
 */

export const TAG_SUGGEST_MIN_QUERY = 2
export const TAG_SUGGEST_MAX_QUERY = 100

// 辞書の人気度の形式（scripts/accumulate-tags.ts が書く）。metadata.popularityVersion がこの値のときだけ読む
export const TAG_POPULARITY_VERSION = 1
// 人気度は tags と同じ並びで、1 タグあたり 36 進 3 桁の整数（0〜46655。大きいほど人気、0 は人気度なし）
export const TAG_POPULARITY_WIDTH = 3
export const TAG_POPULARITY_MAX_LEVEL = 36 ** TAG_POPULARITY_WIDTH - 1
const POPULARITY_RADIX = 36

/** 辞書の順のまま、元のタグと照合用のキー（と人気度）を同じ添字で持つ */
export interface TagIndex {
  readonly tags: readonly string[]
  readonly keys: readonly string[]
  // 辞書に人気度がなければ持たない（辞書の順で答える）
  readonly scores?: Uint16Array
}

export function normalizeTagQuery(raw: string): string {
  return raw.trim().normalize('NFKC').toLowerCase()
}

/**
 * tags と同じ並びの人気度の文字列を数に戻す。長さや文字が合わなければ null（人気度のない辞書として扱う）。
 * 文字は正規表現でなく 1 文字ずつ確かめる（RegExp は最後に照合した文字列を持ち続け、大きな文字列を手放せなくなる）
 */
export function decodeTagPopularity(value: unknown, count: number): Uint16Array | null {
  if (typeof value !== 'string' || value.length !== count * TAG_POPULARITY_WIDTH) return null
  const levels = new Uint16Array(count)
  let at = 0
  for (let i = 0; i < count; i++) {
    let level = 0
    for (let j = 0; j < TAG_POPULARITY_WIDTH; j++) {
      const code = value.charCodeAt(at++)
      // '0'〜'9' は 48〜57、'a'〜'z' は 97〜122
      let digit: number
      if (code >= 48 && code <= 57) digit = code - 48
      else if (code >= 97 && code <= 122) digit = code - 87
      else return null
      level = level * POPULARITY_RADIX + digit
    }
    levels[i] = level
  }
  return levels
}

/** 人気度を保存する形にする。範囲外の値は書かずに throw する */
export function encodeTagPopularity(levels: ArrayLike<number>): string {
  const parts = new Array<string>(levels.length)
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    if (!Number.isInteger(level) || level < 0 || level > TAG_POPULARITY_MAX_LEVEL) {
      throw new Error(`Cannot encode a popularity level of ${level}`)
    }
    parts[i] = level.toString(POPULARITY_RADIX).padStart(TAG_POPULARITY_WIDTH, '0')
  }
  return parts.join('')
}

/** popularity は辞書の人気度の文字列（tags と同じ並び）。形が合わなければ人気度のない索引にする */
export function buildTagIndex(tags: unknown, popularity?: unknown): TagIndex {
  const sourceTags: string[] = []
  const keys: string[] = []
  if (!Array.isArray(tags)) return { tags: sourceTags, keys }
  const levels = popularity === undefined ? null : decodeTagPopularity(popularity, tags.length)
  for (let i = 0; i < tags.length; i++) {
    const tag: unknown = tags[i]
    if (typeof tag !== 'string' || tag === '') continue
    const key = tag.normalize('NFKC').toLowerCase()
    // 飛ばしたタグの分を詰める（書く位置は読む位置より前なので、同じ配列の上で詰められる）
    if (levels) levels[sourceTags.length] = levels[i]
    sourceTags.push(tag)
    // 約 45 万件を持つため、キーが元のタグと同じなら複製を持たない
    keys.push(key === tag ? tag : key)
  }
  if (!levels) return { tags: sourceTags, keys }
  const scores = levels.length === sourceTags.length ? levels : levels.slice(0, sourceTags.length)
  return { tags: sourceTags, keys, scores }
}

/**
 * top を人気度の高い順（同じなら辞書で先の順）に limit 件まで保つ。index は辞書の順に増えていく前提で、
 * 同じ人気度なら先に入ったタグを残す
 */
function keepTop(top: number[], index: number, scores: Uint16Array, limit: number): void {
  const score = scores[index]
  let at = top.length
  if (at >= limit) {
    if (score <= scores[top[at - 1]]) return
    top.pop()
    at--
  }
  while (at > 0 && scores[top[at - 1]] < score) at--
  top.splice(at, 0, index)
}

/**
 * 人気度で並べる。後ろにもっと人気のタグがあり得るので辞書全体を 1 回見るが、全件は並べ替えず、
 * キーが同じタグ・前方一致・部分一致のそれぞれで上位 limit 件だけを持つ
 */
function suggestByPopularity(index: TagIndex, scores: Uint16Array, needle: string, limit: number): string[] {
  const exact: number[] = []
  const prefix: number[] = []
  const substring: number[] = []
  const { tags, keys } = index
  let prefixCount = 0
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    if (key.startsWith(needle)) {
      prefixCount++
      keepTop(key.length === needle.length ? exact : prefix, i, scores, limit)
    } else if (prefixCount < limit && key.includes(needle)) {
      // 前方一致（キーが同じタグを含む）が limit 件見つかれば、部分一致は答えに入らないので照合しない
      keepTop(substring, i, scores, limit)
    }
  }
  return exact
    .concat(prefix, substring)
    .slice(0, limit)
    .map((i) => tags[i])
}

export function suggestTags(index: TagIndex, query: string, limit: number): string[] {
  const needle = normalizeTagQuery(query)
  if (needle === '' || !(limit >= 1)) return []
  if (index.scores) return suggestByPopularity(index, index.scores, needle, limit)
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
