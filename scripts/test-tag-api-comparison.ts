#!/usr/bin/env npx tsx
/**
 * タグ取得API比較テスト
 * - getthumbinfo API
 * - api/watch/v3_guest API
 *
 * GitHub Actionsでの動作確認用
 * 検証項目:
 * 1. v3_guestのレート制限耐性
 * 2. FORBIDDEN（デバイス制限）動画の検出
 * 3. getthumbinfoとの性能比較
 */

interface APITestResult {
  api: string
  videoId: string
  status: number
  tagCount: number
  hasLockedTag: boolean
  error?: string
  errorCode?: string
}

async function testGetThumbInfo(videoId: string): Promise<APITestResult> {
  try {
    const response = await fetch(`https://ext.nicovideo.jp/api/getthumbinfo/${videoId}`)

    if (!response.ok) {
      return {
        api: 'getthumbinfo',
        videoId,
        status: response.status,
        tagCount: 0,
        hasLockedTag: false,
        error: `HTTP ${response.status}`
      }
    }

    const xml = await response.text()

    if (xml.includes('status="fail"')) {
      return {
        api: 'getthumbinfo',
        videoId,
        status: 200,
        tagCount: 0,
        hasLockedTag: false,
        error: 'API returned fail status'
      }
    }

    const allTags = xml.match(/<tag[^>]*>/g) || []
    const lockedTags = xml.match(/<tag[^>]*lock="1"[^>]*>/g) || []

    return {
      api: 'getthumbinfo',
      videoId,
      status: response.status,
      tagCount: allTags.length,
      hasLockedTag: lockedTags.length > 0
    }
  } catch (e) {
    return {
      api: 'getthumbinfo',
      videoId,
      status: 0,
      tagCount: 0,
      hasLockedTag: false,
      error: e instanceof Error ? e.message : 'Unknown error'
    }
  }
}

async function testV3Guest(videoId: string): Promise<APITestResult> {
  const actionTrackId = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`

  try {
    const response = await fetch(
      `https://www.nicovideo.jp/api/watch/v3_guest/${videoId}?actionTrackId=${actionTrackId}`,
      {
        headers: {
          'X-Frontend-Id': '6',
          'X-Frontend-Version': '0',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    )

    if (!response.ok) {
      let errorCode = 'UNKNOWN'
      try {
        const errorData = await response.json()
        errorCode = errorData?.meta?.errorCode || 'UNKNOWN'
      } catch {
        // ignore
      }
      return {
        api: 'v3_guest',
        videoId,
        status: response.status,
        tagCount: 0,
        hasLockedTag: false,
        error: `HTTP ${response.status} (${errorCode})`
      }
    }

    const data = await response.json()
    const tags = data?.data?.tag?.items || []
    const hasLocked = tags.some((t: any) => t.isLocked)

    return {
      api: 'v3_guest',
      videoId,
      status: response.status,
      tagCount: tags.length,
      hasLockedTag: hasLocked
    }
  } catch (e) {
    return {
      api: 'v3_guest',
      videoId,
      status: 0,
      tagCount: 0,
      hasLockedTag: false,
      error: e instanceof Error ? e.message : 'Unknown error'
    }
  }
}

async function fetchRankingVideoIds(): Promise<string[]> {
  // server-response メタタグからランキングデータを取得
  const response = await fetch(
    'https://www.nicovideo.jp/ranking/genre/all?term=24h',
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ja',
        'Cookie': 'sensitive_material_status=accept'
      }
    }
  )

  const html = await response.text()

  // server-response メタタグを抽出
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) {
    throw new Error('Failed to find server-response meta tag')
  }

  const decodedData = metaMatch[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")

  const serverData = JSON.parse(decodedData)

  // ランキングアイテムを取得
  const rankingData = serverData.data?.response?.$getTeibanRanking?.data
  if (!rankingData?.items) {
    throw new Error('No ranking items found')
  }

  return rankingData.items.slice(0, 20).map((item: any) => item.id)
}

async function main() {
  console.log('=== タグ取得API比較テスト ===\n')
  console.log(`実行環境: ${process.env.GITHUB_ACTIONS ? 'GitHub Actions' : 'ローカル'}\n`)

  // テスト用動画ID（通常動画 + HARMFUL_VIDEO）
  const testVideos = [
    'sm9',           // 通常動画（レッツゴー!陰陽師）
    'sm45502773',    // HARMFUL_VIDEO（デバイス制限）
  ]

  // ランキングから追加の動画IDを取得
  console.log('ランキングから動画ID取得中...')
  try {
    const rankingIds = await fetchRankingVideoIds()
    console.log(`取得: ${rankingIds.length}件\n`)
    testVideos.push(...rankingIds.slice(0, 18))  // 計20件程度
  } catch (e) {
    console.log(`ランキング取得失敗: ${e instanceof Error ? e.message : 'Unknown'}\n`)
  }

  console.log(`テスト対象: ${testVideos.length}件\n`)

  // 統計
  const stats = {
    getthumbinfo: { success: 0, fail: 0, rateLimited: 0 },
    v3_guest: { success: 0, fail: 0, forbidden: 0 }
  }

  // 各動画についてテスト
  console.log('--- テスト結果 ---\n')
  console.log('VideoID         | getthumbinfo        | v3_guest')
  console.log('----------------|---------------------|--------------------')

  for (const videoId of testVideos) {
    // 並列でテスト
    const [gtiResult, v3Result] = await Promise.all([
      testGetThumbInfo(videoId),
      testV3Guest(videoId)
    ])

    // getthumbinfo統計
    if (gtiResult.tagCount > 0) {
      stats.getthumbinfo.success++
    } else if (gtiResult.status === 403) {
      stats.getthumbinfo.rateLimited++
    } else {
      stats.getthumbinfo.fail++
    }

    // v3_guest統計
    if (v3Result.tagCount > 0) {
      stats.v3_guest.success++
    } else if (v3Result.status === 400 || v3Result.status === 403) {
      stats.v3_guest.forbidden++
    } else {
      stats.v3_guest.fail++
    }

    // 結果表示
    const gtiStatus = gtiResult.error ? `❌ ${gtiResult.error}` : `✅ ${gtiResult.tagCount}tags`
    const v3Status = v3Result.error ? `❌ ${v3Result.error}` : `✅ ${v3Result.tagCount}tags`

    console.log(`${videoId.padEnd(15)} | ${gtiStatus.padEnd(19)} | ${v3Status}`)

    // レート制限回避のため少し待機
    await new Promise(r => setTimeout(r, 100))
  }

  console.log('\n--- 統計サマリー ---\n')
  console.log('getthumbinfo API:')
  console.log(`  成功: ${stats.getthumbinfo.success}/${testVideos.length}`)
  console.log(`  403: ${stats.getthumbinfo.rateLimited}`)
  console.log(`  その他失敗: ${stats.getthumbinfo.fail}`)

  console.log('\nv3_guest API:')
  console.log(`  成功: ${stats.v3_guest.success}/${testVideos.length}`)
  console.log(`  FORBIDDEN: ${stats.v3_guest.forbidden}`)
  console.log(`  その他失敗: ${stats.v3_guest.fail}`)

  // 推奨判定
  console.log('\n--- 推奨 ---')
  if (stats.getthumbinfo.rateLimited > stats.getthumbinfo.success) {
    console.log('⚠️ getthumbinfoはレート制限されています')
  }
  if (stats.v3_guest.success > stats.getthumbinfo.success) {
    console.log('✅ v3_guestの方が成功率が高いです')
  }
  if (stats.v3_guest.forbidden > 0) {
    console.log(`⚠️ v3_guestで${stats.v3_guest.forbidden}件がFORBIDDEN（HARMFUL_VIDEO等）`)
  }
}

main().catch(console.error)
