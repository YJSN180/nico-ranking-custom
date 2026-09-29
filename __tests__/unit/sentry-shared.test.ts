import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildSafeTags,
  getSentryEnvironment,
  isSentryEnabled,
  normalizeTransactionName,
  sanitizeUrlForSentry,
  scrubBreadcrumb,
  scrubDynamicSamplingContext,
  scrubEvent,
  scrubServerBreadcrumb,
  scrubSpan,
  scrubUrl,
} from '@/lib/sentry/shared'

// 目印の文字列。Sentry に渡る JSON のどこにも（そのまま・URL エンコード後のどちらでも）残ってはいけない
const MARKER = 'zzleakcheck'
const MARKER_JA = '検索語 テスト'
const MARKER_WITH_JA = `${MARKER}${MARKER_JA}`
const enc = (value: string) => encodeURIComponent(value)

function expectNoLeak(value: unknown) {
  const json = JSON.stringify(value)
  const forms = [
    MARKER,
    MARKER_JA,
    '検索語',
    enc('検索語'),
    enc(MARKER_JA),
    enc(enc(MARKER_JA)),
    new URLSearchParams({ q: MARKER_JA }).toString().slice(2),
  ]
  for (const form of forms) {
    expect(json).not.toContain(form)
    expect(json.toLowerCase()).not.toContain(form.toLowerCase())
  }
}

describe('sentry shared helpers', () => {
  it('redacts sensitive query parameters while preserving safe ones', () => {
    expect(
      sanitizeUrlForSentry(
        'https://nico-rank.com/api/ranking?genre=game&tag=secret-tag&page=2#hash',
      ),
    ).toBe('/api/ranking?genre=game&tag=%5Bredacted%5D&page=2')
  })

  it('normalizes dynamic transaction paths', () => {
    expect(
      normalizeTransactionName(
        'GET https://nico-rank.com/api/thumbnail/sm9?token=secret',
      ),
    ).toBe('GET /api/thumbnail/:videoId?token=%5Bredacted%5D')
  })

  it('scrubs request and breadcrumb payloads', () => {
    const event = scrubEvent({
      request: {
        url: 'https://nico-rank.com/mylists/abc123?memo=private&genre=all',
        headers: {
          authorization: 'secret',
        },
        data: {
          body: 'secret',
        },
        cookies: 'a=b',
      },
      breadcrumbs: [
        {
          message: 'Authorization header leaked',
          data: {
            url: 'https://nico-rank.com/api/ranking?tag=hidden&genre=all',
            headers: {
              cookie: 'secret',
            },
            response: {
              body: 'secret',
            },
          },
        },
      ],
      user: {
        id: 'user-1',
      },
      transaction: 'GET https://nico-rank.com/mylists/abc123?title=secret',
      contexts: {
        response: {
          status_code: 500,
        },
        trace: {
          data: {
            url: 'https://nico-rank.com/api/ranking?tag=hidden',
            'http.request.body.size': 100,
            'http.response.body.size': 200,
          },
        },
      },
    })

    // 絶対 URL はオリジンを残し、パスとクエリだけを整える
    expect(event.request).toEqual({
      url: 'https://nico-rank.com/mylists/:id?memo=%5Bredacted%5D&genre=all',
    })
    expect(event.breadcrumbs).toEqual([
      {
        message: '[redacted]',
        data: {
          url: 'https://nico-rank.com/api/ranking?tag=%5Bredacted%5D&genre=all',
        },
      },
    ])
    expect(event.transaction).toBe('GET /mylists/:id?title=%5Bredacted%5D')
    expect(event.user).toBeUndefined()
    expect(event.contexts).toEqual({
      trace: {
        data: {
          url: 'https://nico-rank.com/api/ranking?tag=%5Bredacted%5D',
        },
      },
    })
  })

  it('keeps only non-empty safe tags', () => {
    expect(
      buildSafeTags({
        runtime: 'browser',
        is_preview: false,
        count: 3,
        empty: '',
        missing: undefined,
        nullable: null,
      }),
    ).toEqual({
      runtime: 'browser',
      is_preview: 'false',
      count: '3',
    })
  })

  it('scrubs standalone breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        data: {
          from: 'https://nico-rank.com/api/ranking?tag=foo',
          to: 'https://nico-rank.com/mylists/123?memo=secret',
          input: 'hidden',
        },
      }),
    ).toEqual({
      data: {
        from: 'https://nico-rank.com/api/ranking?tag=%5Bredacted%5D',
        to: 'https://nico-rank.com/mylists/:id?memo=%5Bredacted%5D',
      },
    })
  })
})

describe('scrubUrl: query allowlist', () => {
  it('keeps values only for allowlisted keys', () => {
    expect(
      scrubUrl(
        'https://nico-rank.com/search?q=a&keyword=b&tagAnd=c&tagOr=d&tagNot=e&tag=f&title=g'
          + '&genre=game&period=24h&page=2&limit=10&offset=20&sort=f&order=d&targets=title'
          + '&contentType=video&_sort=-startTime&_offset=0&_limit=100',
      ),
    ).toBe(
      'https://nico-rank.com/search?q=%5Bredacted%5D&keyword=%5Bredacted%5D&tagAnd=%5Bredacted%5D'
        + '&tagOr=%5Bredacted%5D&tagNot=%5Bredacted%5D&tag=%5Bredacted%5D&title=%5Bredacted%5D'
        + '&genre=game&period=24h&page=2&limit=10&offset=20&sort=f&order=d&targets=title'
        + '&contentType=video&_sort=-startTime&_offset=0&_limit=100',
    )
  })

  it('redacts every value of repeated keys without collapsing them', () => {
    expect(scrubUrl('/search?tagAnd=a&tagAnd=b&tagNot=c&genre=game&genre=all')).toBe(
      '/search?tagAnd=%5Bredacted%5D&tagAnd=%5Bredacted%5D&tagNot=%5Bredacted%5D&genre=game&genre=all',
    )
  })

  it('treats keys case-sensitively and redacts non-ASCII key names', () => {
    expect(scrubUrl(`/search?Genre=x&${enc(MARKER_JA)}=1`)).toBe(
      '/search?Genre=%5Bredacted%5D&%5Bredacted%5D=%5Bredacted%5D',
    )
  })

  it('drops the fragment and credentials', () => {
    expect(scrubUrl('https://user:pass@nico-rank.com/search?genre=all#q=secret')).toBe(
      'https://nico-rank.com/search?genre=all',
    )
  })
})

describe('scrubUrl: path templates', () => {
  it.each([
    ['https://www.nicovideo.jp/search/%E3%81%82?sort=f', 'https://www.nicovideo.jp/search/:query?sort=f'],
    ['https://www.nicovideo.jp/tag/touhou?sort=f&order=d', 'https://www.nicovideo.jp/tag/:query?sort=f&order=d'],
    [
      'https://www.nicovideo.jp/search_shorts/%E6%9D%B1%E6%96%B9?sort=registeredAt&order=d',
      'https://www.nicovideo.jp/search_shorts/:query?sort=registeredAt&order=d',
    ],
    ['https://www.nicovideo.jp/tag_shorts/abc?page=2', 'https://www.nicovideo.jp/tag_shorts/:query?page=2'],
    [`https://www.nicovideo.jp/search/${MARKER_JA}`, 'https://www.nicovideo.jp/search/:query'],
    [
      'https://www.nicovideo.jp/api/watch/v3_guest/sm9?_frontendId=6&actionTrackId=abc_123',
      'https://www.nicovideo.jp/api/watch/v3_guest/:videoId?_frontendId=%5Bredacted%5D&actionTrackId=%5Bredacted%5D',
    ],
    ['https://nvapi.nicovideo.jp/v1/users/12345', 'https://nvapi.nicovideo.jp/v1/users/:userId'],
    ['/api/admin/ng-list/derived/sm123', '/api/admin/ng-list/derived/:videoId'],
    ['/api/admin/ng-list/derived/bulk', '/api/admin/ng-list/derived/bulk'],
    ['/mylists/abc?genre=all', '/mylists/:id?genre=all'],
    ['/ranking/%E3%81%82/detail', '/ranking/:redacted/detail'],
    ['/foo/a%20b', '/foo/:redacted'],
  ])('%s -> %s', (input, expected) => {
    expect(scrubUrl(input)).toBe(expected)
  })

  it('leaves route names that only contain the words search or tag alone', () => {
    expect(scrubUrl('/api/search/realtime?q=x')).toBe('/api/search/realtime?q=%5Bredacted%5D')
    expect(scrubUrl('https://nvapi.nicovideo.jp/v2/search/video?keyword=x&pageSize=100')).toBe(
      'https://nvapi.nicovideo.jp/v2/search/video?keyword=%5Bredacted%5D&pageSize=%5Bredacted%5D',
    )
  })

  it('is idempotent', () => {
    const once = scrubUrl(`https://www.nicovideo.jp/search/${enc(MARKER_JA)}?q=${MARKER}&sort=f`)
    expect(scrubUrl(once)).toBe(once)
  })

  it('hides the content of non-http URLs', () => {
    expect(scrubUrl(`data:text/plain,${MARKER}`)).toBe('data:[redacted]')
  })
})

describe('normalizeTransactionName', () => {
  it.each([
    ['middleware GET', 'middleware GET'],
    ['resolve page components', 'resolve page components'],
    ['GET /search?q=zz&genre=all', 'GET /search?q=%5Bredacted%5D&genre=all'],
    ['RSC GET /tag/%E6%9D%B1', 'RSC GET /tag/:query'],
    ['/search/%E3%81%82', '/search/:query'],
    ['GET https://nico-rank.com/search?q=zz', 'GET /search?q=%5Bredacted%5D'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeTransactionName(input)).toBe(expected)
  })
})

describe('scrubSpan', () => {
  const searchUrl = `https://www.nicovideo.jp/search/${enc(MARKER_WITH_JA)}?sort=f&order=d&keyword=${enc(MARKER_JA)}#${MARKER}`

  it('drops query/fragment attributes and templates URL attributes', () => {
    const span = {
      span_id: 'span-1',
      trace_id: 'trace-1',
      start_timestamp: 1,
      op: 'http.client',
      description: `GET https://www.nicovideo.jp/search/${enc(MARKER_WITH_JA)}`,
      data: {
        url: searchUrl,
        'url.full': searchUrl,
        'http.url': searchUrl,
        'http.target': `/search/${enc(MARKER_WITH_JA)}?sort=f&order=d`,
        'url.path': `/search/${enc(MARKER_WITH_JA)}`,
        'url.query': `sort=f&keyword=${enc(MARKER_JA)}`,
        'http.query': `?keyword=${MARKER}`,
        'url.fragment': MARKER,
        'http.fragment': `#${MARKER}`,
        'http.request.method': 'GET',
        'server.address': 'www.nicovideo.jp',
        'http.response.status_code': 200,
      },
    }
    const original = structuredClone(span)
    const scrubbed = scrubSpan(span)

    expectNoLeak(scrubbed)
    expect(scrubbed).toEqual({
      span_id: 'span-1',
      trace_id: 'trace-1',
      start_timestamp: 1,
      op: 'http.client',
      description: 'GET https://www.nicovideo.jp/search/:query',
      data: {
        url: 'https://www.nicovideo.jp/search/:query?sort=f&order=d&keyword=%5Bredacted%5D',
        'url.full': 'https://www.nicovideo.jp/search/:query?sort=f&order=d&keyword=%5Bredacted%5D',
        'http.url': 'https://www.nicovideo.jp/search/:query?sort=f&order=d&keyword=%5Bredacted%5D',
        'http.target': '/search/:query?sort=f&order=d',
        'url.path': '/search/:query',
        'http.request.method': 'GET',
        'server.address': 'www.nicovideo.jp',
        'http.response.status_code': 200,
      },
    })
    expect(span).toEqual(original)
  })

  it('only rewrites descriptions that carry a URL', () => {
    const base = { span_id: 's', trace_id: 't', start_timestamp: 0, data: {} }

    expect(scrubSpan({ ...base, description: 'middleware GET' }).description).toBe('middleware GET')
    expect(scrubSpan({ ...base, description: 'resolve page components' }).description).toBe(
      'resolve page components',
    )
    expect(scrubSpan({ ...base, description: `RSC GET /search?q=${MARKER}&_rsc=1` }).description).toBe(
      'RSC GET /search?q=%5Bredacted%5D&_rsc=%5Bredacted%5D',
    )
    expect(scrubSpan({ ...base, description: `POST /api/search?q=${MARKER}` }).description).toBe(
      'POST /api/search?q=%5Bredacted%5D',
    )
  })

  it('removes request/response header attributes and scrubs Next.js span names', () => {
    const scrubbed = scrubSpan({
      span_id: 's',
      trace_id: 't',
      start_timestamp: 0,
      description: 'GET /search',
      data: {
        'http.request.header.referer': `https://nico-rank.com/search?q=${MARKER}`,
        'http.request.header.next_url': `/search?q=${MARKER}`,
        'http.request.header.next_router_state_tree': enc(`["",{"children":["search",{"children":["__PAGE__?{\\"q\\":\\"${MARKER}\\"}",{}]}]}]`),
        'http.response.header.location': `/search?q=${MARKER}`,
        'next.span_name': `GET /search?q=${MARKER}`,
        'http.route': `middleware GET /tag/${enc(MARKER_JA)}`,
        'next.route': '/search',
        transaction: `/tag/${enc(MARKER_JA)}`,
      },
    })

    expect(scrubbed.data).toEqual({
      'next.span_name': 'GET /search?q=%5Bredacted%5D',
      'http.route': 'middleware GET /tag/:query',
      'next.route': '/search',
      transaction: '/tag/:query',
    })
    expectNoLeak(scrubbed)
  })
})

describe('scrubEvent: nothing typed by the user reaches Sentry', () => {
  const searchPage = `https://nico-rank.com/search?q=${enc(MARKER_WITH_JA)}&tagAnd=${MARKER}&tagAnd=${enc(MARKER_JA)}&genre=game`

  it('scrubs a transaction including contexts.trace.data and event.spans', () => {
    const scrubbed = scrubEvent({
      type: 'transaction',
      transaction: `GET /search?q=${MARKER}`,
      contexts: {
        trace: {
          span_id: 'root',
          trace_id: 'trace',
          data: {
            'http.target': `/search?q=${enc(MARKER_JA)}&genre=game`,
            'url.full': searchPage,
            'url.query': `q=${MARKER}`,
            'next.span_name': `GET /search?q=${MARKER}`,
            'http.request.header.referer': searchPage,
          },
        },
      },
      spans: [
        {
          span_id: 'child',
          trace_id: 'trace',
          start_timestamp: 0,
          op: 'http.client',
          description: `GET https://www.nicovideo.jp/tag/${MARKER}`,
          data: {
            url: `https://www.nicovideo.jp/tag/${MARKER}?sort=f`,
            'url.full': `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=${enc(MARKER_JA)}&targets=title&_sort=-startTime&filters%5BtagsExact%5D%5B0%5D=${MARKER}`,
            'http.query': `?q=${MARKER}`,
            'url.fragment': MARKER,
          },
        },
      ],
      request: {
        url: searchPage,
        query_string: `q=${MARKER}`,
        headers: { Referer: searchPage },
      },
    })

    expectNoLeak(scrubbed)
    expect(scrubbed.transaction).toBe('GET /search?q=%5Bredacted%5D')
    expect(scrubbed.spans?.[0].description).toBe('GET https://www.nicovideo.jp/tag/:query')
    expect(scrubbed.spans?.[0].data['url.full']).toBe(
      'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?q=%5Bredacted%5D&targets=title&_sort=-startTime&filters%5BtagsExact%5D%5B0%5D=%5Bredacted%5D',
    )
    expect(scrubbed.contexts?.trace?.data?.['http.target']).toBe('/search?q=%5Bredacted%5D&genre=game')
  })

  it('scrubs URLs inside exception messages, stack frames of the page and Next.js request context', () => {
    const scrubbed = scrubEvent({
      message: `Failed to load ${searchPage}`,
      logentry: { message: `GET /tag/${enc(MARKER_JA)} failed` },
      exception: {
        values: [
          {
            type: 'Error',
            value: `Failed to fetch RSC payload for ${searchPage}. Falling back to browser navigation.`,
            stacktrace: {
              frames: [
                { filename: searchPage, abs_path: searchPage, lineno: 1 },
                {
                  filename: 'https://nico-rank.com/_next/static/chunks/app/page-abc.js?dpl=dpl_1',
                  lineno: 2,
                },
              ],
            },
          },
          { type: 'Error', value: `request to "/api/search?q=${MARKER}" failed` },
          { type: 'Error', value: `NEXT_REDIRECT;replace;/search?q=${MARKER};307;` },
          { type: 'Error', value: 'ENOENT: open (/var/task/.next/server/app/page.js:1:2)' },
        ],
      },
      contexts: {
        nextjs: {
          request_path: `/search?q=${MARKER}&genre=game`,
          router_path: '/search',
        },
      },
      breadcrumbs: [
        {
          category: 'fetch',
          data: {
            method: 'GET',
            url: `https://nvapi.nicovideo.jp/v2/search/video?keyword=${enc(MARKER_JA)}`,
            'http.query': `?keyword=${MARKER}`,
            'http.fragment': `#${MARKER}`,
          },
        },
        { category: 'navigation', data: { from: `/search?q=${MARKER}`, to: `/tag/${enc(MARKER_JA)}` } },
        {
          category: 'console',
          message: `Failed to fetch RSC payload for ${searchPage}`,
          data: { arguments: [`Failed to fetch RSC payload for ${searchPage}`], logger: 'console' },
        },
      ],
    })

    expectNoLeak(scrubbed)
    const [first, second, third, fourth] = scrubbed.exception?.values ?? []
    expect(first.value).toBe(
      'Failed to fetch RSC payload for https://nico-rank.com/search?q=%5Bredacted%5D&tagAnd=%5Bredacted%5D&tagAnd=%5Bredacted%5D&genre=game. Falling back to browser navigation.',
    )
    expect(second.value).toBe('request to "/api/search?q=%5Bredacted%5D" failed')
    expect(third.value).toBe('NEXT_REDIRECT;replace;/search?q=%5Bredacted%5D')
    // URL を含まないメッセージ（ファイルパス）はそのまま
    expect(fourth.value).toBe('ENOENT: open (/var/task/.next/server/app/page.js:1:2)')
    expect(first.stacktrace?.frames?.[1].filename).toBe(
      'https://nico-rank.com/_next/static/chunks/app/page-abc.js?dpl=dpl_1',
    )
    expect(scrubbed.contexts?.nextjs).toEqual({
      request_path: '/search?q=%5Bredacted%5D&genre=game',
      router_path: '/search',
    })
  })
})

describe('browser-only places where typed text can appear', () => {
  const base = { span_id: 's', trace_id: 't', start_timestamp: 0, data: {} }

  it('redacts the page URL that the SDK rewrites to app:/// in stack frames and keeps script files', () => {
    const event = scrubEvent({
      exception: {
        values: [
          {
            type: 'Error',
            value: 'boom',
            stacktrace: {
              frames: [
                { filename: `app:///?genre=all&tag=${enc(MARKER_JA)}`, abs_path: `app:///search?q=${MARKER}&sort=f`, lineno: 1 },
                { filename: `app:///tag/${enc(MARKER_WITH_JA)}`, lineno: 2 },
                { filename: 'app:///_next/static/chunks/app/page-abc.js?dpl=dpl_1', lineno: 3 },
              ],
            },
          },
        ],
      },
    })

    expectNoLeak(event)
    const frames = event.exception?.values?.[0]?.stacktrace?.frames
    expect(frames?.[0]?.filename).toBe('app:///?genre=all&tag=%5Bredacted%5D')
    expect(frames?.[0]?.abs_path).toBe('app:///search?q=%5Bredacted%5D&sort=f')
    expect(frames?.[1]?.filename).toBe('app:///tag/:query')
    expect(frames?.[2]?.filename).toBe('app:///_next/static/chunks/app/page-abc.js?dpl=dpl_1')
  })

  it('redacts aria-label, title and alt values in click breadcrumbs and keeps type and name', () => {
    const breadcrumb = scrubBreadcrumb({
      category: 'ui.click',
      message: `div.modal > button.item[type="button"][aria-label="${MARKER_JA}"] > img[alt="${MARKER}"][title="${MARKER}"]`,
    })

    expectNoLeak(breadcrumb)
    expect(breadcrumb?.message).toBe(
      'div.modal > button.item[type="button"][aria-label="[redacted]"] > img[alt="[redacted]"][title="[redacted]"]',
    )
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'form > input[name="q"][type="search"]' })?.message).toBe(
      'form > input[name="q"][type="search"]',
    )
  })

  it('redacts element text in INP span names', () => {
    const span = scrubSpan({
      ...base,
      op: 'ui.interaction.click',
      description: `div.chips > button.chip[aria-label="条件「キーワード: ${MARKER}」を解除"]`,
      data: { transaction: `/search?q=${MARKER}` },
    })

    expectNoLeak(span)
    expect(span.description).toBe('div.chips > button.chip[aria-label="[redacted]"]')
  })

  it('treats the long animation frame script attributes as URLs', () => {
    const span = scrubSpan({
      ...base,
      op: 'ui.long-animation-frame',
      description: 'Main UI thread blocked',
      data: {
        'code.filepath': `https://nico-rank.com/search?q=${MARKER}`,
        'browser.script.invoker': `https://nico-rank.com/?tag=${enc(MARKER_JA)}`,
        'browser.script.invoker_type': 'classic-script',
      },
    })

    expectNoLeak(span)
    expect(span.data?.['code.filepath']).toBe('https://nico-rank.com/search?q=%5Bredacted%5D')
    expect(scrubSpan({ ...base, data: { 'browser.script.invoker': 'BUTTON#save.onclick' } }).data?.['browser.script.invoker']).toBe(
      'BUTTON#save.onclick',
    )
  })
})

describe('scrubDynamicSamplingContext', () => {
  it('normalizes the transaction name carried in envelope headers and baggage', () => {
    const dsc = { trace_id: 't', public_key: 'k', transaction: `GET /tag/${enc(MARKER_JA)}?q=${MARKER}` }
    scrubDynamicSamplingContext(dsc)

    expect(dsc).toEqual({ trace_id: 't', public_key: 'k', transaction: 'GET /tag/:query?q=%5Bredacted%5D' })
  })

  it('leaves a DSC without a transaction name untouched', () => {
    const dsc = { trace_id: 't', environment: 'production' }
    scrubDynamicSamplingContext(dsc)

    expect(dsc).toEqual({ trace_id: 't', environment: 'production' })
  })
})

describe('scrubBreadcrumb', () => {
  it('removes http.query/http.fragment and templates url/to/from', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'http',
      data: {
        url: `https://www.nicovideo.jp/search/${enc(MARKER_JA)}`,
        'http.method': 'GET',
        'http.query': `?q=${MARKER}`,
        'http.fragment': `#${MARKER}`,
        from: `/search?q=${MARKER}`,
        to: `/tag/${MARKER}?genre=all`,
      },
    })

    expectNoLeak(scrubbed)
    expect(scrubbed).toEqual({
      category: 'http',
      data: {
        url: 'https://www.nicovideo.jp/search/:query',
        'http.method': 'GET',
        from: '/search?q=%5Bredacted%5D',
        to: '/tag/:query?genre=all',
      },
    })
  })

  it('drops console breadcrumbs on the server but keeps other ones', () => {
    expect(scrubServerBreadcrumb({ category: 'console', message: `query=${MARKER}` })).toBeNull()
    expect(
      scrubServerBreadcrumb({ category: 'http', data: { url: `https://nvapi.nicovideo.jp/v1/users/1?q=${MARKER}` } }),
    ).toEqual({ category: 'http', data: { url: 'https://nvapi.nicovideo.jp/v1/users/:userId?q=%5Bredacted%5D' } })
  })

  it('keeps browser console breadcrumbs but scrubs URLs in them', () => {
    const scrubbed = scrubBreadcrumb({
      category: 'console',
      message: `Failed to fetch RSC payload for https://nico-rank.com/search?q=${MARKER}`,
      data: { arguments: [`see /search?q=${MARKER}`, 42], logger: 'console' },
    })

    expect(scrubbed).toEqual({
      category: 'console',
      message: 'Failed to fetch RSC payload for https://nico-rank.com/search?q=%5Bredacted%5D',
      data: { arguments: ['see /search?q=%5Bredacted%5D', 42], logger: 'console' },
    })
  })
})

describe('environment and sending', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function stubEnvironment(vars: Record<string, string | undefined>) {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_ENVIRONMENT', undefined)
    vi.stubEnv('VERCEL_ENV', undefined)
    vi.stubEnv('NEXT_PUBLIC_SENTRY_FORCE_ENABLE', undefined)
    for (const [key, value] of Object.entries(vars)) {
      vi.stubEnv(key, value)
    }
  }

  it.each([
    [{ VERCEL_ENV: 'production' }, 'production'],
    [{ VERCEL_ENV: 'preview' }, 'preview'],
    [{}, 'local'],
    [{ NODE_ENV: 'production' }, 'local'],
    [{ NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'preview', VERCEL_ENV: 'production' }, 'preview'],
  ])('%o -> %s', (vars, expected) => {
    stubEnvironment(vars)
    expect(getSentryEnvironment()).toBe(expected)
  })

  const dsn = 'https://public@o1.ingest.us.sentry.io/1'

  it('sends only from production and preview when a DSN is set', () => {
    stubEnvironment({})
    expect(isSentryEnabled(dsn, 'production')).toBe(true)
    expect(isSentryEnabled(dsn, 'preview')).toBe(true)
    expect(isSentryEnabled(dsn, 'local')).toBe(false)
    expect(isSentryEnabled(dsn, 'development')).toBe(false)
    expect(isSentryEnabled(undefined, 'production')).toBe(false)
    expect(isSentryEnabled('', 'production')).toBe(false)
  })

  it('sends from local only with the explicit flag', () => {
    stubEnvironment({ NEXT_PUBLIC_SENTRY_FORCE_ENABLE: 'true' })
    expect(isSentryEnabled(dsn, 'local')).toBe(true)
    expect(isSentryEnabled(undefined, 'local')).toBe(false)

    stubEnvironment({ NEXT_PUBLIC_SENTRY_FORCE_ENABLE: '1' })
    expect(isSentryEnabled(dsn, 'local')).toBe(false)
  })

  it('uses the resolved environment by default', () => {
    stubEnvironment({ VERCEL_ENV: 'preview' })
    expect(isSentryEnabled(dsn)).toBe(true)

    stubEnvironment({ NODE_ENV: 'production' })
    expect(isSentryEnabled(dsn)).toBe(false)
  })
})
