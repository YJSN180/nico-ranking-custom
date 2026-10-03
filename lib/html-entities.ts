/**
 * XML / HTML のテキストに出てくる文字参照を 1 回だけ戻す。
 * 名前付きは XML の 5 つ（&amp; &lt; &gt; &quot; &apos;）、数値は 10 進（&#39;）と 16 進（&#x27;）。
 * 左から 1 回で置き換えるので &amp;lt; は &lt; になり、< までは戻さない。
 * 知らない名前やセミコロンのない &、制御文字・サロゲート・範囲外になる数値参照は書かれたまま残す
 */

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

const ENTITY_PATTERN =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(amp|lt|gt|quot|apos));/g

// 制御文字（C0・DEL・C1）と単独のサロゲートは作らない
function isAllowedCodePoint(codePoint: number): boolean {
  if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
    return false
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false
  return codePoint <= 0x10ffff
}

export function decodeHtmlEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(
    ENTITY_PATTERN,
    (
      entity: string,
      decimal: string | undefined,
      hex: string | undefined,
      name: string | undefined,
    ): string => {
      if (name !== undefined) return NAMED_ENTITIES[name] ?? entity
      const codePoint =
        decimal !== undefined
          ? Number.parseInt(decimal, 10)
          : Number.parseInt(hex ?? '', 16)
      return isAllowedCodePoint(codePoint)
        ? String.fromCodePoint(codePoint)
        : entity
    },
  )
}

/**
 * 属性値（本家ページの meta の content など）と getthumbinfo の XML の復号。decodeHtmlEntities と同じ 1 パスの復号で、
 * 検索・低品質 NG のポーラー・HD サムネイルの呼び出し元はこの名前で使う
 */
export const decodeHtmlAttribute = decodeHtmlEntities
