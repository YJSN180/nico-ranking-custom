const SNAPSHOT_API_URL = 'https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search'

const DERIVED_NG_LIST_KEY = 'ng-list-derived'
const DERIVED_INFO_MAP_KEY = 'ng-derived-video-info-map'
const DERIVED_INFO_META_KEY = 'ng-derived-video-info-meta'
const DERIVED_INFO_LOCK_KEY = 'ng-derived-video-info-lock'

const BATCH_SIZE = 50
const RUN_LIMIT = 300
const LOCK_TTL_SECONDS = 900
const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

const parseJson = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('Failed to parse JSON, using fallback:', error)
    return fallback
  }
}

const buildSnapshotUrl = ids => {
  const jsonFilter = JSON.stringify({
    type: 'or',
    filters: ids.map(id => ({
      type: 'equal',
      field: 'contentId',
      value: id
    }))
  })

  const params = new URLSearchParams({
    q: '',
    targets: 'title',
    fields: 'contentId,title,userId,channelId',
    _sort: '-viewCounter',
    _limit: String(Math.min(ids.length, BATCH_SIZE)),
    jsonFilter
  })

  return `${SNAPSHOT_API_URL}?${params}`
}

const fetchSnapshotBatch = async (ids, nowIso) => {
  const response = await fetch(buildSnapshotUrl(ids), {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      Accept: 'application/json',
      'Accept-Language': 'ja'
    }
  })

  if (!response.ok) {
    throw new Error(`Snapshot API error: ${response.status}`)
  }

  const data = await response.json()
  const found = new Map()

  if (data.data && Array.isArray(data.data)) {
    for (const video of data.data) {
      const authorId = video.channelId || video.userId || '不明'
      found.set(video.contentId, {
        title: video.title || 'タイトル不明',
        authorName: `投稿者ID: ${authorId}`,
        isDeleted: false,
        updatedAt: nowIso
      })
    }
  }

  const updates = {}
  ids.forEach(id => {
    if (found.has(id)) {
      updates[id] = found.get(id)
    } else {
      updates[id] = {
        title: '削除された動画',
        authorName: null,
        isDeleted: true,
        updatedAt: nowIso
      }
    }
  })

  return updates
}

export const runDerivedNgVideoInfoUpdate = async env => {
  if (!env?.NG_DATA) {
    console.error('KV binding NG_DATA is not configured')
    return
  }

  const kv = env.NG_DATA
  const nowIso = new Date().toISOString()

  const existingLock = await kv.get(DERIVED_INFO_LOCK_KEY)
  if (existingLock) {
    console.log('Lock exists, skipping run')
    return
  }

  await kv.put(DERIVED_INFO_LOCK_KEY, nowIso, { expirationTtl: LOCK_TTL_SECONDS })

  try {
    const listRaw = await kv.get(DERIVED_NG_LIST_KEY)
    const listValue = parseJson(listRaw, [])
    const derivedList = Array.isArray(listValue) ? listValue : []
    const totalIds = derivedList.length

    const mapRaw = await kv.get(DERIVED_INFO_MAP_KEY)
    const infoMap = parseJson(mapRaw, {}) || {}

    const metaRaw = await kv.get(DERIVED_INFO_META_KEY)
    const meta = parseJson(metaRaw, {}) || {}

    let cursor = Number.isFinite(meta.cursor) ? meta.cursor : 0
    let refreshCursor = Number.isFinite(meta.refreshCursor) ? meta.refreshCursor : 0
    let refreshActive = Boolean(meta.refreshActive)
    const lastRefreshAt = meta.lastRefreshAt ? new Date(meta.lastRefreshAt) : null

    if (!refreshActive) {
      const needsRefresh = !lastRefreshAt || Date.now() - lastRefreshAt.getTime() >= REFRESH_INTERVAL_MS
      if (needsRefresh) {
        refreshActive = true
        refreshCursor = 0
      }
    }

    const mode = refreshActive ? 'refresh' : 'incremental'
    const startIndex = mode === 'refresh' ? refreshCursor : cursor
    const slice = derivedList.slice(startIndex, startIndex + RUN_LIMIT)

    if (slice.length === 0) {
      if (refreshActive) {
        refreshActive = false
        refreshCursor = 0
        meta.lastRefreshAt = nowIso
      }
      cursor = 0

      meta.cursor = cursor
      meta.refreshCursor = refreshCursor
      meta.refreshActive = refreshActive
      meta.lastRunAt = nowIso
      meta.lastRunMode = mode
      meta.totalIds = totalIds

      await kv.put(DERIVED_INFO_META_KEY, JSON.stringify(meta))
      return
    }

    const normalizedSlice = Array.from(
      new Set(
        slice
          .map(id => (typeof id === 'string' ? id.trim() : ''))
          .filter(Boolean)
      )
    )

    const idsToFetch = mode === 'refresh'
      ? normalizedSlice
      : normalizedSlice.filter(id => !infoMap[id])

    let mapUpdated = false

    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const batch = idsToFetch.slice(i, i + BATCH_SIZE)
      if (batch.length === 0) continue
      const updates = await fetchSnapshotBatch(batch, nowIso)
      Object.assign(infoMap, updates)
      mapUpdated = true
    }

    const nextIndex = startIndex + RUN_LIMIT
    if (mode === 'refresh') {
      if (nextIndex >= totalIds) {
        refreshActive = false
        refreshCursor = 0
        meta.lastRefreshAt = nowIso
      } else {
        refreshCursor = nextIndex
      }
    } else {
      cursor = nextIndex >= totalIds ? 0 : nextIndex
    }

    meta.cursor = cursor
    meta.refreshCursor = refreshCursor
    meta.refreshActive = refreshActive
    meta.lastRunAt = nowIso
    meta.lastRunMode = mode
    meta.totalIds = totalIds

    if (mapUpdated) {
      await kv.put(DERIVED_INFO_MAP_KEY, JSON.stringify(infoMap))
    }
    await kv.put(DERIVED_INFO_META_KEY, JSON.stringify(meta))
  } catch (error) {
    console.error('Failed to update derived NG video info cache:', error)
    throw error
  } finally {
    try {
      await kv.delete(DERIVED_INFO_LOCK_KEY)
    } catch (error) {
      console.warn('Failed to release lock:', error)
    }
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDerivedNgVideoInfoUpdate(env))
  }
}
