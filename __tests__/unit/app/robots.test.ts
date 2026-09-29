import { afterEach, describe, expect, it, vi } from 'vitest'
import robots from '@/app/robots'

describe('robots.txt', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lets crawlers into production except the admin pages and the API, and points to the sitemap', () => {
    vi.stubEnv('VERCEL_ENV', 'production')

    expect(robots()).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api'],
      },
      sitemap: 'https://nico-rank.com/sitemap.xml',
    })
  })

  it.each(['preview', 'development', undefined])(
    'turns every crawler away outside production (VERCEL_ENV=%s)',
    (vercelEnv) => {
      vi.stubEnv('VERCEL_ENV', vercelEnv)

      expect(robots()).toEqual({
        rules: {
          userAgent: '*',
          disallow: '/',
        },
      })
    },
  )
})
