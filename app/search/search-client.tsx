'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import InitialRankingSkeleton from '@/components/initial-ranking-skeleton'
import Pagination from '@/components/pagination'
import { TagToggleButton } from '@/components/tag-toggle-button'
import { VideoContextMenu } from '@/components/video-context-menu'
import { TagAutocompleteInput } from '@/components/tag-autocomplete-input'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'
import { showToast } from '@/lib/toast'
import {
  addSavedSearch,
  loadSavedSearches,
  persistSavedSearches,
  removeSavedSearch,
  type SavedSearch,
} from '@/lib/search/saved-searches'
import {
  SEARCH_GENRES,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_OPTIONS,
  type SearchTagCondition,
  type SearchTagOperator,
} from '@/lib/search/snapshot-search'
import type { RankingItem } from '@/types/ranking'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { NGType } from '@/components/quick-ng-button'
import '@/components/ranking-item-responsive.css'
import './search.css'

interface SearchApiResponse {
  items: RankingItem[]
  totalCount: number
  page: number
  pageSize: number
  excludedCount: number
  /** merged: 直近5:00以降のリアルタイム区間を先頭に連結 / snapshot: 毎朝5時時点のみ */
  source?: 'merged' | 'snapshot'
  boundary?: string
  realtimeCount?: number
  realtimeTruncated?: boolean
  realtimeError?: string
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
  /** タグの論理条件（カスタムランキングと同じ AND/OR/NOT 体系） */
  tagConditions: SearchTagCondition[]
}

// カスタムランキング（custom-ranking-modal）と同じ演算子ラベル
const TAG_OPERATOR_LABELS: Record<SearchTagOperator, string> = {
  AND: 'すべて含む',
  OR: 'いずれかを含む',
  NOT: '除外する',
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
  tagConditions: [],
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

// 文字列フィールドだけを指す型（チップの一括クリア用）
type StringFieldKey =
  | 'viewsMin' | 'viewsMax'
  | 'commentsMin' | 'commentsMax'
  | 'likesMin' | 'likesMax'
  | 'mylistsMin' | 'mylistsMax'
  | 'durationMin' | 'durationMax'

interface ActiveChip {
  key: string
  label: string
  clear: (form: FormState) => FormState
}

/** 実行済み検索条件から「適用中の条件チップ」を生成 */
function buildActiveChips(form: FormState): ActiveChip[] {
  const chips: ActiveChip[] = []
  if (form.q.trim()) {
    chips.push({
      key: 'q',
      label: `${form.targets === 'tag' ? 'タグ' : 'キーワード'}: ${form.q.trim()}`,
      clear: (f) => ({ ...f, q: '' }),
    })
  }
  form.tagConditions.forEach((condition, index) => {
    if (!condition.tag.trim()) return
    chips.push({
      key: `tag-${index}`,
      label: `タグ(${TAG_OPERATOR_LABELS[condition.operator]}): ${condition.tag.trim()}`,
      clear: (f) => ({ ...f, tagConditions: f.tagConditions.filter((_, i) => i !== index) }),
    })
  })
  form.genres.forEach((genre) => {
    chips.push({
      key: `genre-${genre}`,
      label: `ジャンル: ${genre}`,
      clear: (f) => ({ ...f, genres: f.genres.filter((g) => g !== genre) }),
    })
  })
  const rangeChip = (name: string, minKey: StringFieldKey, maxKey: StringFieldKey, unit = '') => {
    const min = form[minKey]
    const max = form[maxKey]
    if (!min && !max) return
    const fmt = (v: string) => (v ? `${Number(v).toLocaleString()}${unit}` : '')
    chips.push({
      key: minKey,
      label: `${name}: ${fmt(min)}〜${fmt(max)}`,
      clear: (f) => ({ ...f, [minKey]: '', [maxKey]: '' }),
    })
  }
  rangeChip('再生数', 'viewsMin', 'viewsMax')
  rangeChip('コメント数', 'commentsMin', 'commentsMax')
  rangeChip('いいね！数', 'likesMin', 'likesMax')
  rangeChip('マイリスト数', 'mylistsMin', 'mylistsMax')
  rangeChip('再生時間', 'durationMin', 'durationMax', '分')
  if (form.dateFrom || form.dateTo) {
    chips.push({
      key: 'date',
      label: `投稿日時: ${form.dateFrom || ''}〜${form.dateTo || ''}`,
      clear: (f) => ({ ...f, dateFrom: '', dateTo: '' }),
    })
  }
  return chips
}

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
  for (const condition of form.tagConditions) {
    const tag = condition.tag.trim()
    if (!tag) continue
    const key = condition.operator === 'AND' ? 'tagAnd' : condition.operator === 'OR' ? 'tagOr' : 'tagNot'
    params.append(key, tag)
  }
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
      tagConditions: [
        ...params.getAll('tagAnd').map((tag): SearchTagCondition => ({ tag, operator: 'AND' })),
        ...params.getAll('tagOr').map((tag): SearchTagCondition => ({ tag, operator: 'OR' })),
        ...params.getAll('tagNot').map((tag): SearchTagCondition => ({ tag, operator: 'NOT' })),
      ],
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
  // 検索結果のデータ源（リアルタイム区間の有無）とリアルタイム件数（次ページ要求のヒント）
  const [resultMeta, setResultMeta] = useState<{ source: 'merged' | 'snapshot'; boundary?: string; realtimeCount: number } | null>(null)
  const realtimeCountRef = useRef(0)
  // リアルタイム区間のタグ補完（S4）: 応答表示後に非同期で取得し、古い検索の結果は捨てる
  const tagsRequestIdRef = useRef(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastForm, setLastForm] = useState<FormState | null>(null)
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hasSearchedRef = useRef(false)

  // 保存済み検索と詳細条件の開閉状態を復元
  useEffect(() => {
    setSavedSearches(loadSavedSearches())
    try {
      if (localStorage.getItem('search-details-open') === '1') {
        setDetailsOpen(true)
      }
    } catch {
      // localStorage エラーは無視
    }
  }, [])

  const updateField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  // リアルタイム区間（nvapi 由来）の動画はタグを持たないため、表示後に v3_guest 経由で
  // tags / tagDetails を後付けする。これでタグ系のユーザーNG・タグ表示が区間にも効く。
  const enrichRealtimeTags = useCallback(async (data: SearchApiResponse) => {
    if (data.source !== 'merged' || !data.realtimeCount) return
    const targets = data.items.filter((it) => it.tags === undefined && it.tagDetails === undefined).map((it) => it.id)
    if (targets.length === 0) return
    const requestId = ++tagsRequestIdRef.current
    try {
      const res = await fetch(`/api/search/realtime-tags?ids=${encodeURIComponent(targets.slice(0, 30).join(','))}`)
      if (!res.ok) return
      const body = (await res.json()) as { tagDetails?: Record<string, Array<{ name: string; isLocked: boolean }>> }
      if (requestId !== tagsRequestIdRef.current || !body.tagDetails) return
      const details = body.tagDetails
      setItems((prev) =>
        prev
          ? prev.map((it) =>
              details[it.id]
                ? { ...it, tagDetails: details[it.id], tags: details[it.id].map((t) => t.name) }
                : it
            )
          : prev
      )
    } catch {
      // 補完は任意機能なので失敗しても検索結果はそのまま
    }
  }, [])

  const runSearch = useCallback(
    async (searchForm: FormState, searchPage: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsLoading(true)
      setError(null)
      hasSearchedRef.current = true
      setLastForm(searchForm)

      const params = buildQueryParams(searchForm, searchPage)
      const queryString = params.toString()
      router.replace(queryString ? `/search?${queryString}` : '/search', { scroll: false })

      // 2ページ目以降はリアルタイム件数のヒントを渡し、サーバーが Snapshot を並列取得できるようにする
      const apiParams = new URLSearchParams(params)
      if (searchPage > 1 && realtimeCountRef.current > 0) {
        apiParams.set('rtCount', String(realtimeCountRef.current))
      }

      try {
        const res = await fetch(`/api/search?${apiParams.toString()}`, { signal: controller.signal })
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
        realtimeCountRef.current = data.realtimeCount ?? 0
        setResultMeta({ source: data.source ?? 'snapshot', boundary: data.boundary, realtimeCount: data.realtimeCount ?? 0 })
        void enrichRealtimeTags(data)
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
    [router, enrichRealtimeTags]
  )

  // URLに条件付きで直接アクセスした場合は自動検索
  useEffect(() => {
    if (hasSearchedRef.current) return
    const params = new URLSearchParams(searchParams.toString())
    const hasCondition = ['q', 'genre', 'viewsMin', 'viewsMax', 'dateFrom', 'dateTo', 'durationMin', 'durationMax', 'likesMin', 'likesMax', 'mylistsMin', 'mylistsMax', 'commentsMin', 'commentsMax', 'tagAnd', 'tagOr', 'tagNot'].some(
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
        showToast(`NGリストに追加しました: ${trimmedValue}`)
      } else {
        showToast(`すでにNGリストに登録済みです: ${trimmedValue}`, 'info')
      }
    },
    [ngList, saveNGListDirectly]
  )

  const applyDatePreset = useCallback((days: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    setForm((prev) => ({ ...prev, dateFrom: formatDateInput(from), dateTo: formatDateInput(now) }))
  }, [])

  // フォームを更新して即再検索（チップ解除・ソート/ジャンル変更用）
  const applyAndSearch = useCallback(
    (next: FormState) => {
      setForm(next)
      void runSearch(next, 1)
    },
    [runSearch]
  )

  // 検索条件の保存・復元・削除
  const handleSaveCurrent = useCallback(() => {
    const query = buildQueryParams(form, 1).toString()
    if (!query) {
      showToast('保存する条件がありません。キーワードや詳細条件を指定してください。', 'error')
      return
    }
    const defaultName =
      form.q.trim() || form.tagConditions.find((c) => c.tag.trim())?.tag || '無題の検索'
    const name = window.prompt('この検索条件の名前を入力してください', defaultName)
    if (!name?.trim()) return
    const next = addSavedSearch(savedSearches, name, query)
    setSavedSearches(next)
    persistSavedSearches(next)
    showToast(`検索条件「${name.trim()}」を保存しました`)
  }, [form, savedSearches])

  const handleLoadSaved = useCallback(
    (saved: SavedSearch) => {
      const parsed = parseFormFromUrl(new URLSearchParams(saved.query))
      setForm(parsed.form)
      void runSearch(parsed.form, parsed.page)
    },
    [runSearch]
  )

  const handleDeleteSaved = useCallback(
    (saved: SavedSearch) => {
      if (!window.confirm(`保存した検索「${saved.name}」を削除しますか？`)) return
      const next = removeSavedSearch(savedSearches, saved.id)
      setSavedSearches(next)
      persistSavedSearches(next)
      showToast(`保存した検索「${saved.name}」を削除しました`, 'info')
    },
    [savedSearches]
  )

  // 詳細条件で指定中の件数（summary のバッジ表示用）
  const advancedCount = useMemo(() => {
    let count = 0
    if (form.dateFrom || form.dateTo) count++
    for (const field of RANGE_FIELDS) {
      if (form[field.min] || form[field.max]) count++
    }
    if (form.durationMin || form.durationMax) count++
    count += form.tagConditions.filter((c) => c.tag.trim()).length
    count += form.genres.length
    return count
  }, [form])

  const activeChips = useMemo(() => (lastForm ? buildActiveChips(lastForm) : []), [lastForm])

  return (
    <TagDisplayProvider>
    <div className="search-page">
      <h1 className="search-page__title">動画検索</h1>

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
        <p className="search-form__hint">
          スペース区切り = すべて含む ／ <code>A OR B</code> = いずれか ／ <code>-語</code> = 除外
        </p>

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
            onChange={(e) => {
              const next = { ...form, sort: e.target.value }
              if (hasSearchedRef.current) {
                applyAndSearch(next)
              } else {
                setForm(next)
              }
            }}
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

        {savedSearches.length > 0 && (
          <div className="search-form__saved">
            <span className="search-form__saved-label">保存した検索:</span>
            {savedSearches.map((saved) => (
              <span key={saved.id} className="search-form__saved-chip">
                <button
                  type="button"
                  className="search-form__saved-load"
                  onClick={() => handleLoadSaved(saved)}
                  title={`「${saved.name}」の条件で検索`}
                >
                  {saved.name}
                </button>
                <button
                  type="button"
                  className="search-form__saved-delete"
                  aria-label={`保存した検索「${saved.name}」を削除`}
                  onClick={() => handleDeleteSaved(saved)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <details
          className="search-form__details"
          open={detailsOpen}
          onToggle={(e) => {
            const open = (e.currentTarget as HTMLDetailsElement).open
            setDetailsOpen(open)
            try {
              localStorage.setItem('search-details-open', open ? '1' : '0')
            } catch {
              // localStorage エラーは無視
            }
          }}
        >
          <summary>
            詳細条件
            {advancedCount > 0 && (
              <span className="search-form__details-badge">{advancedCount}件指定中</span>
            )}
          </summary>

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
            <span className="search-form__section-label">
              タグ条件（キーワードと同時に指定可・完全一致）
            </span>
            {form.tagConditions.map((condition, index) => (
              <div key={index} className="search-form__tag-condition">
                <select
                  className="search-form__sort"
                  value={condition.operator}
                  onChange={(e) =>
                    updateField(
                      'tagConditions',
                      form.tagConditions.map((c, i) =>
                        i === index ? { ...c, operator: e.target.value as SearchTagOperator } : c
                      )
                    )
                  }
                  aria-label={`タグ条件${index + 1}の演算子`}
                >
                  {(Object.keys(TAG_OPERATOR_LABELS) as SearchTagOperator[]).map((op) => (
                    <option key={op} value={op}>
                      {TAG_OPERATOR_LABELS[op]}
                    </option>
                  ))}
                </select>
                <TagAutocompleteInput
                  className="search-form__number search-form__tag-input"
                  value={condition.tag}
                  onChange={(value) =>
                    updateField(
                      'tagConditions',
                      form.tagConditions.map((c, i) => (i === index ? { ...c, tag: value } : c))
                    )
                  }
                  placeholder="タグ名（入力で候補表示）"
                />
                <button
                  type="button"
                  className="search-form__preset"
                  onClick={() =>
                    updateField(
                      'tagConditions',
                      form.tagConditions.filter((_, i) => i !== index)
                    )
                  }
                  aria-label={`タグ条件${index + 1}を削除`}
                >
                  ✕
                </button>
              </div>
            ))}
            {form.tagConditions.length < 10 && (
              <div className="search-form__presets">
                <button
                  type="button"
                  className="search-form__preset"
                  onClick={() =>
                    updateField('tagConditions', [
                      ...form.tagConditions,
                      { tag: '', operator: 'AND' },
                    ])
                  }
                >
                  ＋ タグ条件を追加
                </button>
              </div>
            )}
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
                      onChange={() => {
                        const next = {
                          ...form,
                          genres: active
                            ? form.genres.filter((g) => g !== genre)
                            : [...form.genres, genre],
                        }
                        if (hasSearchedRef.current) {
                          applyAndSearch(next)
                        } else {
                          setForm(next)
                        }
                      }}
                    />
                    {genre}
                  </label>
                )
              })}
            </div>
          </div>
        </details>

        <div className="search-form__actions">
          <button type="button" className="search-form__preset" onClick={handleSaveCurrent}>
            ☆ この条件を保存
          </button>
        </div>
      </form>

      {activeChips.length > 0 && lastForm && (
        <div className="search-results__chips" aria-label="適用中の検索条件">
          <span className="search-form__saved-label">適用中:</span>
          {activeChips.map((chip) => (
            <span key={chip.key} className="search-results__chip">
              {chip.label}
              <button
                type="button"
                aria-label={`条件「${chip.label}」を解除`}
                onClick={() => applyAndSearch(chip.clear(lastForm))}
              >
                ✕
              </button>
            </span>
          ))}
          {activeChips.length > 1 && (
            <button
              type="button"
              className="search-form__preset"
              onClick={() =>
                applyAndSearch({ ...EMPTY_FORM, sort: lastForm.sort, targets: lastForm.targets })
              }
            >
              すべて解除
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="search-results__status" role="alert">
          {error}
        </div>
      )}

      {!error && isLoading && items === null && (
        <div className="search-results" aria-label="検索中">
          <InitialRankingSkeleton itemCount={8} hideRank flat />
        </div>
      )}

      {!error && filteredItems && (
        <div className="search-results">
          <div className="search-results__meta">
            <span>
              検索結果 {totalCount.toLocaleString()} 件
              {ngHiddenCount > 0 && `（NG設定により ${ngHiddenCount} 件非表示）`}
              <span
                className={`search-results__source search-results__source--${resultMeta?.source ?? 'snapshot'}`}
                title={
                  resultMeta?.source === 'merged'
                    ? `直近5:00以降の新着 ${resultMeta.realtimeCount} 件をリアルタイムに取得し、先頭に表示しています`
                    : '検索インデックスは毎朝5時に更新されます。それ以降の新着動画は含まれません'
                }
              >
                {resultMeta?.source === 'merged' ? 'リアルタイム込み' : '毎朝5時時点'}
              </span>
            </span>
            <TagToggleButton />
          </div>

          {filteredItems.length === 0 ? (
            <div className="search-results__status">
              条件に一致する動画が見つかりませんでした。
              {resultMeta?.source !== 'merged' && (
                <div className="search-results__hint">
                  ※ 検索対象は毎朝5時時点のデータです。それ以降の新着動画は「投稿日時が新しい順」でタグのAND条件のみの検索にするとリアルタイムに含まれます。
                </div>
              )}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredItems.map((item) => (
                <li key={item.id} style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  <VideoContextMenu video={item}>
                    <RankingItemResponsive item={item} hideRank flat onQuickNGAdd={handleQuickNGAdd} />
                  </VideoContextMenu>
                </li>
              ))}
            </ul>
          )}

          {/* ランキングと共通のページネーション（フェーズ4-3） */}
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={Math.min(totalCount, 100000)}
            itemsPerPage={SEARCH_PAGE_SIZE}
            onPageChange={handlePageChange}
          />
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
