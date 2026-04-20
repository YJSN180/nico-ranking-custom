import { describe, expect, it } from 'vitest'
import {
  buildSafeTags,
  normalizeTransactionName,
  sanitizeUrlForSentry,
  scrubBreadcrumb,
  scrubEvent,
} from '@/lib/sentry/shared'

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

    expect(event.request).toEqual({
      url: '/mylists/:id?memo=%5Bredacted%5D&genre=all',
    })
    expect(event.breadcrumbs).toEqual([
      {
        message: '[redacted]',
        data: {
          url: '/api/ranking?tag=%5Bredacted%5D&genre=all',
        },
      },
    ])
    expect(event.transaction).toBe('GET /mylists/:id?title=%5Bredacted%5D')
    expect(event.user).toBeUndefined()
    expect(event.contexts).toEqual({
      trace: {
        data: {
          url: '/api/ranking?tag=%5Bredacted%5D',
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
        from: '/api/ranking?tag=%5Bredacted%5D',
        to: '/mylists/:id?memo=%5Bredacted%5D',
      },
    })
  })
})
