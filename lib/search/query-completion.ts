/** A completion replaces one search term, never the surrounding query. */
export interface QueryCompletion {
  query: string
  start: number
  end: number
  negative: boolean
  quoted: boolean
}

export function queryCompletion(
  value: string,
  caret: number,
  selectionEnd = caret,
): QueryCompletion | null {
  if (caret !== selectionEnd) return null
  for (const match of value.matchAll(/-?"[^"]*"?|[^\s"]+/gu)) {
    const start = match.index!
    const end = start + match[0].length
    if (caret <= start || caret > end) continue
    const negative = match[0].startsWith('-')
    const term = match[0].slice(negative ? 1 : 0)
    const quoted = term.startsWith('"')
    const query = (quoted ? term.slice(1).replace(/"$/, '') : term).trim()
    if (!query || (!quoted && /^(OR|AND|NOT)$/.test(query))) return null
    return { query, start, end, negative, quoted }
  }
  return null
}

export function completeQuery(
  value: string,
  term: QueryCompletion,
  tag: string,
) {
  // A literal quote cannot be represented safely in the supported query syntax.
  if (tag.includes('"')) return null
  const quoted = term.quoted || /\s|^[-]|^(OR|AND|NOT)$/.test(tag)
  const replacement = `${term.negative ? '-' : ''}${quoted ? `"${tag}"` : tag}`
  return {
    value: value.slice(0, term.start) + replacement + value.slice(term.end),
    caret: term.start + replacement.length,
  }
}
