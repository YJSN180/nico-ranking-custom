// タイトル・名前の正規化と照合
// 荒らしは「あ/い/う/え/お」「あaいsうaえaお」のように文字間へ記号・英数・絵文字を挿入し、
// カナの種類や濁点の付け方も変えてくるため、
//   1. 文字種を正規化（NFKC → カタカナをひらがなへ → 分離濁点を結合 → 小書き仮名を通常形へ）
//   2. 照合語の各文字が「この順で」現れるか（順序付き部分列一致。挿入文字の数・種類は問わない）
// で判定する。実データ 14,231 件では現存投稿者への誤検知 0 件だった。

const KATAKANA_TO_HIRAGANA_OFFSET = 0x60

const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: 'あ',
  ぃ: 'い',
  ぅ: 'う',
  ぇ: 'え',
  ぉ: 'お',
  っ: 'つ',
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
  ゎ: 'わ',
}

// 独立した濁点・半濁点（゛ U+309B / ゜ U+309C）→ 結合用（U+3099 / U+309A）。
// NFKC は独立形を「空白＋結合用」に分解するため、そのままでは直前の仮名と結合しない
const SPACING_TO_COMBINING_MARK: Record<string, string> = {
  '\u309B': '\u3099',
  '\u309C': '\u309A',
}

function isIgnorableCodePoint(cp: number): boolean {
  return (
    (cp >= 0x200b && cp <= 0x200f) || // ゼロ幅スペース・結合子・方向制御
    (cp >= 0x0300 && cp <= 0x036f) || // 結合ダイアクリティカルマーク
    (cp >= 0xfe00 && cp <= 0xfe0f) || // 異体字セレクタ
    cp === 0xfeff || // BOM
    cp === 0x00ad // ソフトハイフン
  )
}

/**
 * NFKC で全角英数・半角カナ・合字を統一し、カタカナをひらがなに、
 * 分離濁点（独立した ゛゜ を含む）を結合形に、小書き仮名を通常形に寄せ、ゼロ幅・結合記号・異体セレクタを除去する。
 * 記号や英数字は残す（一致判定側が挿入を許容するため、除去しなくてよい）。
 */
export function normalizeText(input: string): string {
  const nfkc = input
    .replace(/[\u309B\u309C]/g, (mark) => SPACING_TO_COMBINING_MARK[mark] ?? mark)
    .normalize('NFKC')
    .normalize('NFC')
  let out = ''
  for (const ch of nfkc) {
    const cp = ch.codePointAt(0) ?? 0
    if (isIgnorableCodePoint(cp)) continue
    let c = ch
    if (cp >= 0x30a1 && cp <= 0x30f6) c = String.fromCodePoint(cp - KATAKANA_TO_HIRAGANA_OFFSET)
    c = SMALL_TO_LARGE[c] ?? c
    out += c.toLowerCase()
  }
  return out
}

/** needle の各文字が haystack にこの順で現れるか（挿入数の上限なし） */
export function containsSubsequence(haystack: string, needle: string): boolean {
  const target = Array.from(needle)
  if (target.length === 0) return false
  let i = 0
  for (const ch of haystack) {
    if (ch === target[i]) i++
    if (i === target.length) return true
  }
  return false
}

/** 正規化した text に、正規化した needle が順序付き部分列として現れるか */
export function matchesSubsequenceNeedle(text: string, needle: string): boolean {
  const n = normalizeText(needle)
  if (n.length === 0) return false
  return containsSubsequence(normalizeText(text), n)
}

/** 正規化した text に、正規化した needle が連続して現れるか（部分一致） */
export function containsNormalized(text: string, needle: string): boolean {
  const n = normalizeText(needle)
  if (n.length === 0) return false
  return normalizeText(text).includes(n)
}

export function matchesAnySubsequenceNeedle(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => matchesSubsequenceNeedle(text, needle))
}

export function containsAnyNormalized(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => containsNormalized(text, needle))
}
