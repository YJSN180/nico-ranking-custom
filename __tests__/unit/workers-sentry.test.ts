import { describe, expect, it } from 'vitest'

import {
  buildSafeLogAttributes,
  createWorkerSentryOptions,
  scrubLog,
} from '../../workers/sentry.js'

describe('workers sentry log helpers', () => {
  it('drops low-value logs before sending', () => {
    expect(
      scrubLog({
        level: 'info',
        message: 'worker.info',
        attributes: {
          surface: 'video-stats-updater',
        },
      }),
    ).toBeNull()
  })

  it('keeps only scrubbed safe log attributes', () => {
    expect(
      buildSafeLogAttributes({
        surface: 'video-stats-updater',
        endpoint_family: '/api/ranking',
        url: 'https://nico-rank.com/api/ranking?tag=secret&genre=all',
        total_videos: 12,
        has_error: true,
        title: 'private title',
        query: 'secret tag',
        headers: {
          authorization: 'secret',
        },
        random_text: 'should drop',
      }),
    ).toEqual({
      surface: 'video-stats-updater',
      endpoint_family: '/api/ranking',
      url: '/api/ranking',
      total_videos: 12,
      has_error: true,
    })
  })

  it('enables logs with a beforeSendLog scrubber', () => {
    const options = createWorkerSentryOptions({
      SENTRY_WORKER_DSN: 'https://public@example.ingest.us.sentry.io/1',
      ENVIRONMENT: 'production',
    })

    expect(options.enableLogs).toBe(true)
    expect(
      options.beforeSendLog?.({
        level: 'warn',
        message: 'worker.warn',
        attributes: {
          surface: 'video-stats-updater',
          memo: 'private',
          total_videos: 3,
        },
      }),
    ).toEqual({
      level: 'warn',
      message: 'worker.warn',
      attributes: {
        surface: 'video-stats-updater',
        total_videos: 3,
      },
    })
  })
})
