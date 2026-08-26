'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import { VideoContextMenu } from '@/components/video-context-menu'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'
import {
  SEARCH_GENRES,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_OPTIONS,
} from '@/lib/search/snapshot-search'
import type { RankingItem } from '@/types/ranking'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { NGType } from '@/components/quick-ng-button'
import './search.css'

interface SearchApiResponse {
  items: RankingItem[]
  totalCount: number
  page: number
  pageSize: number
  excludedCount: number
}

interface FormState {
  q: string
  targets: 'keyword' | 'tag'
  sort: string
  genres: string[]
  viewsMin: string
  viewsMax: string
  commentsMin: string
  commentsMax: string
  likesMin: string
  likesMax: string
  mylistsMin: string
  mylistsMax: string
  /** 分単位（APIへは秒に変換して送る） */
  durationMin: string
  durationMax: string
  /** YYYY-MM-DD */
  dateFrom: string
  dateTo: string
}

const EMPTY_FORM: FormState = {
  q: '',
  targets: 'keyword',
  sort: '-viewCounter',
  genres: [],
  viewsMin: '',
  viewsMax: '',
  commentsMin: '',
  commentsMax: '',
  likesMin: '',
  likesMax: '',
  mylistsMin: '',
  mylistsMax: '',
  durationMin: '',
  durationMax: '',
  dateFrom: '',
  dateTo: '',
}

const RANGE_FIELDS: Array<{
  name: string
  min: keyof FormState
  max: keyof FormState
}> = [
  { name: '再生数', min: 'viewsMin', max: 'viewsMax' },
  { name: 'コメント数', min: 'commentsMin', max: 'commentsMax' },
  { name: 'いいね！数', min: 'likesMin', max: 'likesMax' },
  { name: 'マイリスト数', min: 'mylistsMin', max: 'mylistsMax' },
]

function toJstIso(date: string, endOfDay: boolean): string {
  return `${date}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`
}

function formatDateInput(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

/** フォーム状態からAPI/URL用のクエリパラメータを構築 */
function buildQueryParams(form: FormState, page: number): URLSearchParams {
  const params = new URLSearchParams()
  if (form.q) params.set('q', form.q)
  if (form.targets !== 'keyword') params.set('targets', form.targets)
  if (form.sort !== '-viewCounter') params.set('sort', form.sort)
  form.genres.forEach((g) => params.append('genre', g))

  const numeric: Array<[string, string]> = [
    ['viewsMin', form.viewsMin],
    ['viewsMax', form.viewsMax],
    ['commentsMin', form.commentsMin],
    ['commentsMax', form.commentsMax],
    ['likesMin', form.likesMin],
    ['likesMax', form.likesMax],
    ['mylistsMin', form.mylistsMin],
    ['mylistsMax', form.mylistsMax],
  ]
  for (const [key, value] of numeric) {
    if (value !== '' && Number.isFinite(Number(value))) params.set(key, value)
  }
  if (form.durationMin !== '' && Number.isFinite(Number(form.durationMin))) {
    params.set('durationMin', String(Math.round(Number(form.durationMin) * 60)))
  }
  if (form.durationMax !== '' && Number.isFinite(Number(form.durationMax))) {
    params.set('durationMax', String(Math.round(Number(form.durationMax) * 60)))
  }
  if (form.dateFrom) params.set('dateFrom', toJstIso(form.dateFrom, false))
  if (form.dateTo) params.set('dateTo', toJstIso(form.dateTo, true))
  if (page > 1) params.set('page', String(page))
  return params
}

/** URLのクエリパラメータからフォーム状態を復元 */
function parseFormFromUrl(params: URLSearchParams): { form: FormState; page: number } {
  const secToMin = (v: string | null): string => {
    if (!v) return ''
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? String(Math.round(n / 60)) : ''
  }
  const isoToDate = (v: string | null): string => (v ? v.slice(0, 10) : '')
  const genres = params.getAll('genre').filter((g) => (SEARCH_GENRES as readonly string[]).includes(g))
  const sort = params.get('sort') ?? '-viewCounter'

  return {
    form: {
      q: params.get('q') ?? '',
      targets: params.get('targets') === 'tag' ? 'tag' : 'keyword',
      sort: SEARCH_SORT_OPTIONS.some((o) => o.value === sort) ? sort : '-viewCounter',
      genres,
      viewsMin: params.get('viewsMin') ?? '',
      viewsMax: params.get('viewsMax') ?? '',
      commentsMin: params.get('commentsMin') ?? '',
      commentsMax: params.get('commentsMax') ?? '',
      likesMin: params.get('likesMin') ?? '',
      likesMax: params.get('likesMax') ?? '',
      mylistsMin: params.get('mylistsMin') ?? '',
      mylistsMax: params.get('mylistsMax') ?? '',
      durationMin: secToMin(params.get('durationMin')),
      durationMax: secToMin(params.get('durationMax')),
      dateFrom: isoToDate(params.get('dateFrom')),
      dateTo: isoToDate(params.get('dateTo')),
    },
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

export function SearchClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { ngList, saveNGListDirectly } = useUserNGListExtended()

  const initial = useMemo(() => parseFormFromUrl(new URLSearchParams(searchParams.toString())), [searchParams])
  const [form, setForm] = useState<FormState>(initial.form)
  const [page, setPage] = useState(initial.page)
  const [items, setItems] = useState<RankingItem[] | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const hasSearchedRef = useRef(false)

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const runSearch = useCallback(
    async (searchForm: FormState, searchPage: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsLoading(true)
      setError(null)
      hasSearchedRef.current = true

      const params = buildQueryParams(searchForm, searchPage)
      const queryString = params.toString()
      router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false })

      try {
        const res = await fetch(`/api/search?${params.toString()}`, { signal: controller.signal })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          const messages: Record<string, string> = {
            search_maintenance: '検索APIがメンテナンス中です。しばらくしてからお試しください。',
            search_timeout: '検索がタイムアウトしました。条件を絞ってお試しください。',
            search_query_error: '検索条件が不正です。条件を見直してください。',
          }
          setError(messages[body?.error ?? ''] ?? '検索中にエラーが発生しました。')
          setItems(null)
          return
        }
        const data = (await res.json()) as SearchApiResponse
        setItems(data.items)
        setTotalCount(data.totalCount)
        setPage(data.page)
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        setError('検索中にエラーが発生しました。ネットワークをご確認ください。')
        setItems(null)
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false)
        }
      }
    },
    [router]
  )

  // URLに条件付きで直接アクセスした場合は自動検索
  useEffect(() => {
    if (hasSearchedRef.current) return
    const params = new URLSearchParams(searchParams.toString())
    const hasCondition = ['q', 'genre', 'viewsMin', 'viewsMax', 'dateFrom', 'dateTo', 'durationMin', 'durationMax', 'likesMin', 'likesMax', 'mylistsMin', 'mylistsMax', 'commentsMin', 'commentsMax'].some(
      (key) => params.has(key)
    )
    if (hasCondition) {
      void runSearch(initial.form, initial.page)
    }
    // 初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      void runSearch(form, 1)
    },
    [form, runSearch]
  )

  const handlePageChange = useCallback(
    (nextPage: number) => {
      void runSearch(form, nextPage)
      window.scrollTo({ top: 0 })
    },
    [form, runSearch]
  )

  // ユーザーNGリストを自動適用
  const filteredItems = useMemo(() => {
    if (!items) return null
    return filterWithExtendedNGList(items, ngList).filteredItems
  }, [items, ngList])

  const ngHiddenCount = items && filteredItems ? items.length - filteredItems.length : 0
  const totalPages = Math.max(1, Math.ceil(Math.min(totalCount, 100000) / SEARCH_PAGE_SIZE))

  // クイックNG追加（client-page と同じセマンティクス: title/author は完全一致）
  const handleQuickNGAdd = useCallback(
    (video: RankingItem, type: NGType, value: string | string[]) => {
      const stringValue = Array.isArray(value) ? value[0] : value
      const trimmedValue = stringValue?.trim()
      if (!trimmedValue) return

      const updated: ExtendedUserNGList = { ...ngList, updatedAt: new Date().toISOString() }
      let wasAdded = false

      switch (type) {
        case 'videoId':
          if (!ngList.videoIds.includes(trimmedValue)) {
            updated.videoIds = [...ngList.videoIds, trimmedValue]
            wasAdded = true
          }
          break
        case 'title':
          if (!ngList.videoTitles.exact.includes(trimmedValue)) {
            updated.videoTitles = { ...ngList.videoTitles, exact: [...ngList.videoTitles.exact, trimmedValue] }
            wasAdded = true
          }
          break
        case 'author':
          if (!ngList.authorNames.exact.includes(trimmedValue)) {
            updated.authorNames = { ...ngList.authorNames, exact: [...ngList.authorNames.exact, trimmedValue] }
            wasAdded = true
          }
          break
        case 'authorId':
          if (!ngList.authorIds.includes(trimmedValue)) {
            updated.authorIds = [...ngList.authorIds, trimmedValue]
            wasAdded = true
          }
          break
        default:
          return
      }

      if (wasAdded) {
        updated.totalCount = ngList.totalCount + 1
        saveNGListDirectly(updated)
      }
    },
    [ngList, saveNGListDirectly]
  )

  const applyDatePreset = useCallback((days: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    setForm((prev) => ({ ...prev, dateFrom: formatDateInput(from), dateTo: formatDateInput(now) }))
  }, [])

  return (
    <TagDisplayProvider>
    <div>
      <h1 className="search-page__title">詳細検索</h1>
      <p className="search-page__note">
        検索データは1日1回（毎朝5時頃）更新されます。最新の投稿は反映されるまで時間がかかります。
      </p>

      <form className="search-form" onSubmit={handleSubmit}>
        <div className="search-form__row">
          <input
            type="search"
            className="search-form__keyword"
            value={form.q}
            onChange={(e) => updateField('q', e.target.value)}
            placeholder={form.targets === 'tag' ? 'タグを入力（完全一致）' : 'キーワードを入力'}
            aria-label="検索キーワード"
          />
          <button type="submit" className="search-form__submit" disabled={isLoading}>
            {isLoading ? '検索中…' : '検索'}
          </button>
        </div>

        <div className="search-form__row search-form__targets" role="radiogroup" aria-label="検索対象">
          <label>
            <input
              type="radio"
              name="targets"
              checked={form.targets === 'keyword'}
              onChange={() => updateField('targets', 'keyword')}
            />
            キーワード検索
          </label>
          <label>
            <input
              type="radio"
              name="targets"
              checked={form.targets === 'tag'}
              onChange={() => updateField('targets', 'tag')}
            />
            タグ検索
          </label>
          <select
            className="search-form__sort"
            value={form.sort}
            onChange={(e) => updateField('sort', e.target.value)}
            aria-label="並び順"
            style={{ marginLeft: 'auto' }}
          >
            {SEARCH_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <details className="search-form__details">
          <summary>詳細条件</summary>

          <div className="search-form__section">
            <span className="search-form__section-label">投稿日時</span>
            <div className="search-form__row" style={{ padding: 0 }}>
              <input
                type="date"
                className="search-form__date"
                value={form.dateFrom}
                onChange={(e) => updateField('dateFrom', e.target.value)}
                aria-label="投稿日時（から）"
              />
              〜
              <input
                type="date"
                className="search-form__date"
                value={form.dateTo}
                onChange={(e) => updateField('dateTo', e.target.value)}
                aria-label="投稿日時（まで）"
              />
            </div>
            <div className="search-form__presets">
              <button type="button" className="search-form__preset" onClick={() => applyDatePreset(1)}>昨日から</button>
              <button type="button" className="search-form__preset" onClick={() => applyDatePreset(7)}>最近7日</button>
              <button type="button" className="search-form__preset" onClick={() => applyDatePreset(30)}>最近30日</button>
              <button type="button" className="search-form__preset" onClick={() => applyDatePreset(365)}>最近1年</button>
              <button
                type="button"
                className="search-form__preset"
                onClick={() => setForm((prev) => ({ ...prev, dateFrom: '', dateTo: '' }))}
              >
                クリア
              </button>
            </div>
          </div>

          <div className="search-form__section">
            <span className="search-form__section-label">カウンター範囲（空欄は制限なし）</span>
            <div className="search-form__ranges">
              {RANGE_FIELDS.map((field) => (
                <div key={field.name} className="search-form__range">
                  <span className="search-form__range-name">{field.name}</span>
                  <input
                    type="number"
                    min="0"
                    className="search-form__number"
                    value={form[field.min] as string}
                    onChange={(e) => updateField(field.min, e.target.value)}
                    placeholder="下限"
                    aria-label={`${field.name}の下限`}
                  />
                  〜
                  <input
                    type="number"
                    min="0"
                    className="search-form__number"
                    value={form[field.max] as string}
                    onChange={(e) => updateField(field.max, e.target.value)}
                    placeholder="上限"
                    aria-label={`${field.name}の上限`}
                  />
                </div>
              ))}
              <div className="search-form__range">
                <span className="search-form__range-name">再生時間</span>
                <input
                  type="number"
                  min="0"
                  className="search-form__number"
                  value={form.durationMin}
                  onChange={(e) => updateField('durationMin', e.target.value)}
                  placeholder="下限(分)"
                  aria-label="再生時間の下限（分）"
                />
                〜
                <input
                  type="number"
                  min="0"
                  className="search-form__number"
                  value={form.durationMax}
                  onChange={(e) => updateField('durationMax', e.target.value)}
                  placeholder="上限(分)"
                  aria-label="再生時間の上限（分）"
                />
              </div>
            </div>
          </div>

          <div className="search-form__section">
            <span className="search-form__section-label">ジャンル（未選択は全ジャンル）</span>
            <div className="search-form__genres">
              {SEARCH_GENRES.map((genre) => {
                const active = form.genres.includes(genre)
                return (
                  <label key={genre} className={`search-form__genre${active ? ' search-form__genre--active' : ''}`}>
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() =>
                        updateField(
                          'genres',
                          active ? form.genres.filter((g) => g !== genre) : [...form.genres, genre]
                        )
                      }
                    />
                    {genre}
                  </label>
                )
              })}
            </div>
          </div>
        </details>
      </form>

      {error && (
        <div className="search-results__status" role="alert">
          {error}
        </div>
      )}

      {!error && isLoading && items === null && (
        <div className="search-results__status">検索中…</div>
      )}

      {!error && filteredItems && (
        <div className="search-results">
          <div className="search-results__meta">
            <span>
              検索結果 {totalCount.toLocaleString()} 件
              {ngHiddenCount > 0 && `（NG設定により ${ngHiddenCount} 件非表示）`}
            </span>
            <span>
              {page} / {totalPages} ページ
            </span>
          </div>

          {filteredItems.length === 0 ? (
            <div className="search-results__status">条件に一致する動画が見つかりませんでした。</div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredItems.map((item) => (
                <li key={item.id} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <VideoContextMenu video={item}>
                    <RankingItemResponsive item={item} hideRank onQuickNGAdd={handleQuickNGAdd} />
                  </VideoContextMenu>
                </li>
              ))}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="search-results__pagination">
              <button
                type="button"
                className="search-results__page-button"
                disabled={page <= 1 || isLoading}
                onClick={() => handlePageChange(page - 1)}
              >
                ← 前
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                className="search-results__page-button"
                disabled={page >= totalPages || isLoading}
                onClick={() => handlePageChange(page + 1)}
              >
                次 →
              </button>
            </div>
          )}
        </div>
      )}

      {!error && !isLoading && items === null && (
        <div className="search-results__status">
          キーワードやタグ、詳細条件を指定して検索してください。
        </div>
      )}
    </div>
    </TagDisplayProvider>
  )
}
