// 属性値の実体参照を 1 パスで復号する（&amp; を先に戻す逐次 replace は二重復号になる）
const ENTITIES = new Map<string, string>([
  ['quot', '"'],
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['apos', "'"],
])

// 数値参照は &#039; のような 0 埋めもあるので値で復号する。範囲外・サロゲート・NUL は残す
function decodeCodePoint(codePoint: number): string | null {
  if (!Number.isInteger(codePoint) || codePoint <= 0 || codePoint > 0x10ffff) return null
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null
  return String.fromCodePoint(codePoint)
}

export function decodeHtmlAttribute(value: string): string {
  return value.replace(
    /&(?:#(\d{1,8})|#[xX]([0-9a-fA-F]{1,7})|([a-zA-Z]+));/g,
    (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) return ENTITIES.get(name) ?? match
      const codePoint = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex ?? '', 16)
      return decodeCodePoint(codePoint) ?? match
    },
  )
}

