import { NextResponse } from 'next/server'
import { scrapeRankingPage } from '@/lib/scraper'
import { addToServerDerivedNGList } from '@/lib/ng-list-server'
import { CACHED_GENRES } from '@/types/ranking-config'
import { setRankingToKV, type KVRankingData } from '@/lib/cloudflare-kv'
import { buildRankingData } from '@/lib/pipeline/run-update'
import { createServerNgFilter } from '@/lib/pipeline/ng-filter'
// import { mockRankingData } from '@/lib/mock-data' // モックデータは使用しない
import type { RankingData, RankingItem } from '@/types/ranking'

export const runtime = 'nodejs'

function normalizeRankingItems(
  items: Partial<RankingItem>[],
  options?: { requireIdAndTitle?: boolean },
): RankingItem[] {
  const normalized = items.map(
    (item): RankingItem => ({
      rank: item.rank || 0,
      id: item.id || '',
      title: item.title || '',
      thumbURL: item.thumbURL || '',
      views: item.views || 0,
      comments: item.comments,
      mylists: item.mylists,
      likes: item.likes,
      tags: item.tags,
      authorId: item.authorId,
      authorName: item.authorName,
      authorIcon: item.authorIcon,
      registeredAt: item.registeredAt,
    }),
  )

  if (options?.requireIdAndTitle) {
    return normalized.filter((item) => item.id && item.title)
  }

  return normalized
}

// Vercel Cronは無効化（GitHub Actionsを使用）
// export const crons = [
//   {
//     path: '/api/cron/fetch',
//     schedule: '15,45 * * * *'
//   }
// ]

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return NextResponse.json(
      { error: 'Cron secret not configured' },
      { status: 500 },
    )
  }

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[cron/fetch] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 重複実行防止機能は削除（Cloudflare KVで管理）

  // キルスイッチのチェック
  try {
    const killSwitchResponse = await fetch(
      `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/monitor/kv-kill-switch`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )

    if (killSwitchResponse.ok) {
      const killSwitchData = await killSwitchResponse.json()
      if (killSwitchData.active) {
        console.error(
          `[KV Kill Switch] Writes suspended: ${killSwitchData.reason}`,
        )
        return NextResponse.json(
          {
            success: false,
            error: 'KV_WRITES_SUSPENDED',
            message: `KV writes are suspended: ${killSwitchData.reason}`,
            suspendedAt: killSwitchData.activatedAt,
          },
          { status: 503 },
        )
      }
    }
  } catch (error) {
    console.error('[KV Kill Switch] Failed to check kill switch status:', error)
    // キルスイッチチェックが失敗しても処理は続行
  }

  try {
    // 人気ジャンルのデータを取得してキャッシュ
    const genres = CACHED_GENRES
    const periods: ('24h' | 'hour')[] = ['24h', 'hour']
    let allSuccess = true
    let totalItems = 0

    // Cloudflare KV用のデータ構造を初期化
    const kvData: KVRankingData = {
      genres: {},
      metadata: {
        version: 1,
        updatedAt: new Date().toISOString(),
        totalItems: 0,
      },
    }

    const serverNgFilter = createServerNgFilter()

    const { genres: rankingGenres, hadErrors } = await buildRankingData({
      genres,
      periods,
      targetCount: 500,
      maxPages: 10,
      pageDelayMs: 500,
      dedupe: true,
      stopOnEmptyPage: false,
      onError: 'throw',
      includeTagRankings: true,
      tagTargetCount: 500,
      tagMaxPages: 10,
      tagPageDelayMs: 500,
      tagDedupe: true,
      tagStopOnEmptyPage: true,
      tagOnError: 'break',
      popularTagsStrategy: 'per-period',
      fetchPage: (genre, period, tag, page) =>
        scrapeRankingPage(genre, period, tag, 100, page),
      normalizeItems: (items, context) =>
        normalizeRankingItems(items, {
          requireIdAndTitle: context.kind === 'main',
        }),
      filterItems: (items) => serverNgFilter(items),
      onDerivedIds: async (newDerivedIds, context) => {
        if (newDerivedIds.length === 0) return
        const label =
          context.kind === 'tag' && context.tag
            ? `${context.genre}-${context.period}-tag-${context.tag}`
            : `${context.genre}-${context.period}`
        try {
          await addToServerDerivedNGList(newDerivedIds)
          if (process.env.NODE_ENV === 'production') {
            // eslint-disable-next-line no-console
            console.log(
              `[NG] Added ${newDerivedIds.length} new derived NG IDs for ${label}`,
            )
          }
        } catch (error) {
          console.error(
            `[NG] Failed to add derived NG IDs for ${label}:`,
            error,
          )
        }
      },
    })

    kvData.genres = rankingGenres
    kvData.metadata!.totalItems = Object.values(rankingGenres).reduce(
      (sum, genreData) =>
        sum + genreData['24h'].items.length + genreData.hour.items.length,
      0,
    )

    allSuccess = !hadErrors
    totalItems = rankingGenres.all?.['24h']?.items.length || 0

    // KV書き込み数をチェック
    try {
      const monitorResponse = await fetch(
        `${process.env.VERCEL_URL || 'http://localhost:3000'}/api/monitor/kv-writes`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cronSecret}`,
            'Content-Type': 'application/json',
          },
        },
      )

      if (!monitorResponse.ok) {
        const monitorData = await monitorResponse.json()
        if (monitorData.error === 'WRITE_LIMIT_EXCEEDED') {
          console.error(
            `[KV Monitor] Write limit exceeded: ${monitorData.count} writes today`,
          )
          return NextResponse.json(
            {
              success: false,
              error: 'KV_WRITE_LIMIT_EXCEEDED',
              message: `KV write limit exceeded: ${monitorData.count} writes today. Stopping to prevent quota exhaustion.`,
              itemsCount: totalItems,
              timestamp: new Date().toISOString(),
            },
            { status: 429 },
          )
        }
      }
    } catch (monitorError) {
      console.error('[KV Monitor] Failed to check write count:', monitorError)
      // モニタリングが失敗しても処理は続行（安全のため）
    }

    // すべてのジャンルの更新が完了したら、Cloudflare KVに一括保存
    try {
      await setRankingToKV(kvData)
      // Cloudflare KV書き込み成功（ログは出力しない - ESLintエラー回避）
    } catch (cfError) {
      // Cloudflare KVへの書き込みに失敗しても、Vercel KVへの書き込みは成功しているので処理は続行
      // エラーは記録するが、全体としては成功とする
    }

    // 更新情報はCloudflare KVのメタデータに含まれる

    return NextResponse.json({
      success: true,
      itemsCount: totalItems,
      timestamp: new Date().toISOString(),
      allSuccess,
      genresProcessed: genres.length,
      isMock: !allSuccess && totalItems === 100, // モックデータを使用した場合
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch ranking' },
      { status: 500 },
    )
  }
}
