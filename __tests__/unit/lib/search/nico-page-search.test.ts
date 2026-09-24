import { describe, it, expect, vi } from 'vitest'
import {
  buildNicoSearchPageUrl,
  decodeHtmlAttribute,
  fetchNicoSearchPage,
  nicoPageOwnerId,
  NicoPageParseError,
  parseNicoSearchPage,
} from '@/lib/search/nico-page-search'

// 合成フィクスチャ（実在の ID・名前は使わない）
const payload = {
  metadata: { title: 'x' },
  data: {
    response: {
      $getSearchVideoV2: {
        data: {
          totalCount: 3,
          hasNext: true,
          items: [
            { id: 'sm100', title: 'A "quoted" & <b>', registeredAt: '2026-09-22T06:42:18+09:00', duration: 16, thumbnail: { listingUrl: 'https://t/1.jpg' }, count: { view: 12, comment: 51, mylist: 0, like: 3 }, owner: { ownerType: 'user', id: '1001', name: 'n', iconUrl: 'https://i/1.jpg', visibility: 'visible' }, isChannelVideo: false },
            { id: 'so200', title: 'ch', registeredAt: '2026-09-22T03:58:30+09:00', owner: { ownerType: 'channel', id: '1234567', name: 'c' }, isChannelVideo: true },
            { id: 'sm300', title: 'no owner', registeredAt: '2026-09-22T02:31:07+09:00', owner: null },
            { title: 'broken (no id)' },
          ],
        },
      },
      page: {},
    },
  },
}
const escapeAttr = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="server-response" content="${escapeAttr(JSON.stringify(payload))}"><title>t</title></head><body></body></html>`

describe('nico-page-search', () => {
  it('URL: キーワードは /search/、タグは /tag/、2 ページ目以降だけ page を付ける', () => {
    expect(buildNicoSearchPageUrl('keyword', 'ホモと見る 未解決')).toBe('https://www.nicovideo.jp/search/%E3%83%9B%E3%83%A2%E3%81%A8%E8%A6%8B%E3%82%8B%20%E6%9C%AA%E8%A7%A3%E6%B1%BA?sort=f&order=d')
    expect(buildNicoSearchPageUrl('tag', 'a b', 2)).toBe('https://www.nicovideo.jp/tag/a%20b?sort=f&order=d&page=2')
  })

  it('URL: ショートは /search_shorts, /tag_shorts で、投稿日時順は sort=registeredAt', () => {
    expect(buildNicoSearchPageUrl('keyword_shorts', 'x')).toBe('https://www.nicovideo.jp/search_shorts/x?sort=registeredAt&order=d')
    expect(buildNicoSearchPageUrl('tag_shorts', 'x', 3)).toBe('https://www.nicovideo.jp/tag_shorts/x?sort=registeredAt&order=d&page=3')
  })

  it('属性の実体参照は 1 パスで復号する（&amp;lt; は &lt; のまま）', () => {
    expect(decodeHtmlAttribute('&quot;a&quot; &amp; &lt;b&gt; &#39;c&#x27; &amp;lt;')).toBe('"a" & <b> \'c\' &lt;')
  })

  it('数値参照は 0 埋めの有無や 10 進・16 進によらず復号する（&#039; など）', () => {
    expect(decodeHtmlAttribute('&#039;a&#0039; &#x2f; &#X41; &#12354; &amp;#039;')).toBe("'a' / A あ &#039;")
  })

  it('範囲外・サロゲート・NUL の数値参照と未知の名前はそのまま残す', () => {
    expect(decodeHtmlAttribute('&#0; &#xD800; &#x110000; &nbspx;')).toBe('&#0; &#xD800; &#x110000; &nbspx;')
  })

  it('server-response の JSON から items / totalCount / hasNext を取り出し、壊れた項目は落とす', () => {
    const r = parseNicoSearchPage(html)
    expect(r.totalCount).toBe(3)
    expect(r.hasNext).toBe(true)
    expect(r.items.map((v) => v.id)).toEqual(['sm100', 'so200', 'sm300'])
    expect(r.items[0]?.title).toBe('A "quoted" & <b>')
    expect(r.items[0]?.count?.comment).toBe(51)
  })

  it('投稿者 ID はユーザーが数字、チャンネルは channel/chNNN、無ければ null', () => {
    const r = parseNicoSearchPage(html)
    expect(nicoPageOwnerId(r.items[0]!)).toBe('1001')
    expect(nicoPageOwnerId(r.items[1]!)).toBe('channel/ch1234567')
    expect(nicoPageOwnerId(r.items[2]!)).toBeNull()
  })

  it('構造が違えば NicoPageParseError を投げる（属性順に依存しない）', () => {
    expect(() => parseNicoSearchPage('<html><head></head></html>')).toThrow(NicoPageParseError)
    expect(() => parseNicoSearchPage('<meta content="{}" name="server-response">')).toThrow(NicoPageParseError)
    expect(() => parseNicoSearchPage('<meta content="not json" name="server-response">')).toThrow(NicoPageParseError)
    const swapped = html.replace('<meta name="server-response" content=', '<meta content=').replace('"><title>', '" name="server-response"><title>')
    expect(parseNicoSearchPage(swapped).items).toHaveLength(3)
  })

  it('fetchNicoSearchPage は HTML を取ってパースし、HTTP エラーは投げる', async () => {
    const ok = vi.fn(async () => ({ ok: true, text: async () => html }) as unknown as Response)
    const r = await fetchNicoSearchPage('tag', 'x', 1, ok as unknown as typeof fetch)
    expect(r.items).toHaveLength(3)
    expect(String(vi.mocked(ok).mock.calls[0]?.[0])).toBe('https://www.nicovideo.jp/tag/x?sort=f&order=d')
    const down = vi.fn(async () => ({ ok: false, status: 503 }) as unknown as Response)
    await expect(fetchNicoSearchPage('tag', 'x', 1, down as unknown as typeof fetch)).rejects.toThrow('nico_page_http_503')
  })
})
