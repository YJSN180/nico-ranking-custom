import { decodeHtmlEntities } from './html-entities'

/**
 * 利用者が保存したタグ名（カスタムランキングの条件・NG タグ）と動画のタグ名を比べる。
 * 修正前はタグ名が文字参照のまま（DAM&amp;JOY配信中 など）届き、候補やタグ詳細から保存した設定にその形が残る。
 * 逆に、修正前の世代のランキングはしばらく文字参照のままの名前を持つ。
 * そこで、どちらか一方が 1 段多くエスケープされていても同じタグとみなす（保存値は書き換えない）。
 * 両方を戻してから比べないのは、chage&amp;aska のように文字参照に見える文字を名前に含む実在のタグが、
 * 修正前に保存された chage&amp;amp;aska と一致しなくなるため
 */

/** 比べる形。raw はそのまま、decoded は文字参照を 1 回戻した形（どちらも大文字小文字の扱いをそろえ済み） */
export interface TagNameForms {
  readonly raw: string
  readonly decoded: string
}

// 戻す前に小文字にすると &AMP; まで戻すので、戻してから小文字にする
function toForms(name: string, fold: (text: string) => string): TagNameForms {
  const raw = fold(name)
  const decoded = name.includes('&') ? fold(decodeHtmlEntities(name)) : raw
  return { raw, decoded }
}

/** 大文字小文字を区別する比べ方の形 */
export function tagNameForms(name: string): TagNameForms {
  return toForms(name, (text) => text)
}

/** 大文字小文字を区別しない比べ方（カスタムランキング・NG の絞り込み）の形 */
export function tagNameFormsIgnoringCase(name: string): TagNameForms {
  return toForms(name, (text) => text.toLowerCase())
}

/** 完全一致。そのままで同じか、どちらか一方を 1 回戻すと同じになる */
export function isSameTagName(saved: TagNameForms, tag: TagNameForms): boolean {
  return (
    saved.raw === tag.raw ||
    saved.decoded === tag.raw ||
    saved.raw === tag.decoded
  )
}

/** 部分一致（動画のタグ名が保存した語を含む）。どちらか一方を 1 回戻して含む場合も当たる */
export function tagNameIncludes(
  tag: TagNameForms,
  saved: TagNameForms,
): boolean {
  return (
    tag.raw.includes(saved.raw) ||
    tag.raw.includes(saved.decoded) ||
    tag.decoded.includes(saved.raw)
  )
}
