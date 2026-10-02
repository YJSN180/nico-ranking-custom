'use client'

import {
  Plus,
  X,
  Bookmark,
  Check,
  ChevronDown,
  History,
  Undo2,
  Film,
  User,
} from 'lucide-react'
import controlStyles from '@/components/control.module.css'
import { createEnrichmentQueue } from '@/lib/search/enrichment-queue'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import RankingItemResponsive from '@/components/ranking-item-responsive'
import InitialRankingSkeleton from '@/components/initial-ranking-skeleton'
import Pagination from '@/components/pagination'
import { TagToggleButton } from '@/components/tag-toggle-button'
import {
  TagAutocompleteInput,
  type AutocompleteAction,
} from '@/components/tag-autocomplete-input'
import { LookupResults, type LookupResultData } from './lookup-results'
import { UserResults, UserResultsSkeleton } from './user-results'
import {
  VIDEO_LOOKUP_MAX_IDS,
  buildLookupPageQuery,
  buildVideoLookupQuery,
  parseVideoIdsInput,
} from '@/lib/search/video-lookup'
import {
  buildUserPageQuery,
  buildUserSearchQuery,
  normalizeUserQuery,
  parseUserPageConditions,
  type SearchUser,
  type UserSearchConditions,
  type UserSearchSort,
} from '@/lib/search/user-search'
import { matchesAuthorNameNG } from '@/lib/ng-filter-core'
import { KeywordConditionEditor } from '@/components/keyword-condition-editor'
import { SearchLibraryPanel } from '@/components/search-library-panel'
import { useSearchLibrary } from '@/hooks/use-search-library'
import { TagDisplayProvider } from '@/contexts/tag-display-context'
import { useUserNGListExtended } from '@/hooks/use-user-ng-list-extended'
import { filterWithExtendedNGList } from '@/lib/filter-with-extended-ng-list'
import { showToast } from '@/lib/toast'
import {
  EMPTY_KEYWORD_CONDITIONS,
  EMPTY_KEYWORD_DRAFTS,
  buildKeywordQuery,
  commitKeywordDrafts,
  describeKeywordConditions,
  isKeywordQueryTooLong,
  parseKeywordQuery,
  type KeywordConditions,
  type KeywordDrafts,
  type KeywordGroup,
} from '@/lib/search/keyword-conditions'
import {
  SEARCH_CONTENT_TYPE_OPTIONS,
  SEARCH_GENRES,
  SEARCH_MAX_OFFSET,
  SEARCH_PAGE_SIZE,
  SEARCH_SORT_OPTIONS,
  buildSearchQuery,
  isSearchDateRangeReversed,
  parseSearchConditions,
  parseSearchContentType,
  type SearchContentType,
  type SearchTagCondition,
  type SearchTagOperator,
} from '@/lib/search/snapshot-search'
import {
  REALTIME_TAGS_MAX_VIDEOS,
  buildRealtimeTagsQuery,
  isVideoId,
} from '@/lib/search/realtime-tags'
import {
  OWNER_INFO_MAX_CHANNEL_VIDEOS,
  OWNER_INFO_MAX_USERS,
  buildOwnersQuery,
  isUserId,
} from '@/lib/search/owner-info'
import type { OwnerInfo } from '@/lib/search/owner-info'
import type { RankingItem } from '@/types/ranking'
import type { ExtendedUserNGList } from '@/types/ng-list-extended'
import type { NGType } from '@/components/quick-ng-button'
import '@/components/ranking-item-responsive.css'
import './search.css'

/** 境界時刻を「M/D HH:mm」（JST）で表示する。不正な値は null */
const formatCutoff = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return null
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

interface SearchApiResponse {
  items: RankingItem[]
  totalCount: number
  page: number
  pageSize: number
  excludedCount: number
  /** merged: 境界（Snapshot が持つ最新投稿時刻）以降のリアルタイム区間を先頭に連結 / snapshot: 索引時点のみ */
  source?: 'merged' | 'snapshot'
  boundary?: string
  realtimeCount?: number
  realtimeTruncated?: boolean
  /** 新着区間を打ち切ったとき、投稿が欠けうる範囲 */
  realtimeGap?: { from: string; to: string }
  /** 新着の取得に失敗して索引だけの結果にしたとき */
  realtimeError?: string
  /** 本家の検索ページ（最新の投稿）の取得に失敗したとき（nvapi の新着は含む） */
  freshError?: string
}

type ResultMeta = Pick<
  SearchApiResponse,
  'boundary' | 'realtimeGap' | 'realtimeError' | 'freshError'
> & {
  source: 'merged' | 'snapshot'
  realtimeCount: number
}

/** 新着区間について利用者に知らせること（打ち切りと取得の失敗） */
function realtimeNotices(meta: ResultMeta | null): string[] {
  if (!meta) return []
  const notices: string[] = []
  if (meta.source === 'snapshot' && meta.realtimeError) {
    notices.push(
      '新着動画を取得できなかったため、検索インデックスの時点までの結果を表示しています。時間をおいて再度検索してください。',
    )
  }
  if (meta.source === 'merged') {
    const from = formatCutoff(meta.realtimeGap?.from)
    const to = formatCutoff(meta.realtimeGap?.to)
    if (from && to)
      notices.push(
        `新着が多いため、${from}〜${to} に投稿された動画の一部を表示できていません。`,
      )
    if (meta.freshError)
      notices.push(
        '最新の投稿の一部を取得できませんでした。時間をおいて再度検索してください。',
      )
  }
  return notices
}

interface FormState {
  q: string
  targets: 'keyword' | 'tag'
  /** 動画の種類（all=すべて / long=動画 / short=ショート） */
  contentType: SearchContentType
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

/** 入力方法（通常入力＝検索式 / 条件で入力＝3 つの欄）。端末ごとに前回の選択を覚える */
type InputMode = 'raw' | 'builder'
const INPUT_MODE_KEY = 'search-input-mode'
const KEYWORD_INPUT_ID = 'search-keyword-input'
const CONVERT_ERROR =
  'この式は「すべて含む・いずれかを含む・含めない」に分けられません。通常入力のまま編集してください。'

/** 検索結果の種類。動画ID・ユーザーは検索欄の候補（または ID だけの入力）から開く */
type ResultView = 'video' | 'id' | 'user'

interface UserResultState {
  conditions: UserSearchConditions
  items: SearchUser[]
  totalCount: number
}

/** API のエラーを、利用者が次に取れる行動の言葉にする */
const SEARCH_ERROR_MESSAGES: Record<string, string> = {
  search_disabled: '検索は現在停止しています。しばらくしてからお試しください。',
  search_unavailable: '検索を利用できません。しばらくしてからお試しください。',
  search_maintenance:
    '検索APIがメンテナンス中です。しばらくしてからお試しください。',
  search_timeout: '検索がタイムアウトしました。条件を絞ってお試しください。',
  search_query_error: '検索条件が不正です。条件を見直してください。',
  rate_limited:
    'アクセスが集中しています。少し待ってから、もう一度お試しください。',
  // 画面は正規形だけを送るので、起きるのはサイトの更新をまたいで古い画面のまま検索したときなど
  invalid_params:
    '検索できませんでした。ページを再読み込みしてから、もう一度お試しください。',
  user_search_unavailable:
    'ユーザー検索を利用できません。しばらくしてからお試しください。',
}

/** 候補の文言に入れる検索語（長い語は省略して 1 行に収める） */
const shortLabel = (text: string): string =>
  text.length > 24 ? `${text.slice(0, 24)}…` : text

/** クリアの直前の状態。クリア後に何も編集していないあいだだけ、同じ場所で元に戻せる */
interface ClearUndo {
  kind: 'keyword' | 'details'
  previous: FormState
  previousConditions: KeywordConditions
  previousDrafts: KeywordDrafts
  /** クリアした直後のフォーム。form がこれと同じ（＝未編集）あいだだけ有効 */
  cleared: FormState
}

const EMPTY_FORM: FormState = {
  q: '',
  targets: 'keyword',
  contentType: 'all',
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

function toJstIso(date: string, endOfDay: boolean): string {
  return `${date}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`
}

function formatDateInput(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

/**
 * フォーム状態をクエリパラメータにする（入力のまま。正規形にするのは toSearchQuery）
 */
function buildQueryParams(form: FormState, page: number): URLSearchParams {
  const params = new URLSearchParams()
  if (form.q) params.set('q', form.q)
  if (form.targets !== 'keyword') params.set('targets', form.targets)
  if (form.contentType !== 'all') params.set('contentType', form.contentType)
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
    const key =
      condition.operator === 'AND'
        ? 'tagAnd'
        : condition.operator === 'OR'
          ? 'tagOr'
          : 'tagNot'
    params.append(key, tag)
  }
  if (page > 1) params.set('page', String(page))
  return params
}

/**
 * フォーム状態を検索条件の正規形の URL クエリにする。画面の URL・保存した検索・/api/search に使う
 * （サーバーと同じ読み方で読み直すので、サーバーが受け付ける形と一致する）
 */
function toSearchQuery(form: FormState, page: number): string {
  return buildSearchQuery(parseSearchConditions(buildQueryParams(form, page)))
}

/**
 * URL にこのどれかがあれば検索条件あり（直接アクセスや戻る・進むで自動検索する）。
 * 並び順・検索対象・ページも含める（キーワードなしで並び順だけ変えた検索も URL に残るため）
 */
const SEARCH_CONDITION_KEYS = [
  'q',
  'targets',
  'contentType',
  'sort',
  'genre',
  'viewsMin',
  'viewsMax',
  'dateFrom',
  'dateTo',
  'durationMin',
  'durationMax',
  'likesMin',
  'likesMax',
  'mylistsMin',
  'mylistsMax',
  'commentsMin',
  'commentsMax',
  'tagAnd',
  'tagOr',
  'tagNot',
  'page',
] as const

/** URLのクエリパラメータからフォーム状態を復元 */
function parseFormFromUrl(params: URLSearchParams): {
  form: FormState
  page: number
} {
  // 秒を分に戻す。小数第 2 位までにすると、どの整数秒も分→秒の丸めで同じ秒に戻る（1.5 分 = 90 秒、100 秒 = 1.67 分）
  const secToMin = (v: string | null): string => {
    if (!v) return ''
    const n = Number(v)
    return Number.isFinite(n) && n >= 0
      ? String(Math.round((n / 60) * 100) / 100)
      : ''
  }
  // 日付は日本時間の日にする（+09:00 以外の表記の URL でも日がずれないように）
  const isoToDate = (v: string | null): string => {
    if (!v) return ''
    const d = new Date(v)
    return Number.isFinite(d.getTime()) ? formatDateInput(d) : ''
  }
  const genres = params
    .getAll('genre')
    .filter((g) => (SEARCH_GENRES as readonly string[]).includes(g))
  const sort = params.get('sort') ?? '-viewCounter'

  return {
    form: {
      q: params.get('q') ?? '',
      targets: params.get('targets') === 'tag' ? 'tag' : 'keyword',
      contentType: parseSearchContentType(params.get('contentType')),
      sort: SEARCH_SORT_OPTIONS.some((o) => o.value === sort)
        ? sort
        : '-viewCounter',
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
        ...params
          .getAll('tagAnd')
          .map((tag): SearchTagCondition => ({ tag, operator: 'AND' })),
        ...params
          .getAll('tagOr')
          .map((tag): SearchTagCondition => ({ tag, operator: 'OR' })),
        ...params
          .getAll('tagNot')
          .map((tag): SearchTagCondition => ({ tag, operator: 'NOT' })),
      ],
    },
    page: Math.max(1, Number(params.get('page')) || 1),
  }
}

export function SearchClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { ngList, saveNGListDirectly } = useUserNGListExtended()

  // 初期値だけ URL から作る。その後の URL の変化は下の同期（useEffect）で反映する
  const [form, setForm] = useState<FormState>(
    () => parseFormFromUrl(new URLSearchParams(searchParams.toString())).form,
  )
  const [page, setPage] = useState(
    () => parseFormFromUrl(new URLSearchParams(searchParams.toString())).page,
  )
  const [items, setItems] = useState<RankingItem[] | null>(null)
  // 検索結果のデータ源（リアルタイム区間の有無）とリアルタイム件数
  const [resultMeta, setResultMeta] = useState<ResultMeta | null>(null)
  /**
   * 直前に表示した結果の条件（ページを除く URL クエリ）と、そのときの境界・新着件数。
   * 同じ条件の 2 ページ目以降にだけ返して、ページ間で区間を一貫させる（別の条件へは持ち越さない）
   */
  const pagingHintRef = useRef<{
    conditionKey: string
    boundary: string | null
    realtimeCount: number
  } | null>(null)
  // リアルタイム区間のタグ補完（S4）: 応答表示後に非同期で取得し、古い検索の結果は捨てる
  const tagsRequestIdRef = useRef(0)
  const enrichmentQueueRef = useRef(createEnrichmentQueue(2))
  const ownersRequestIdRef = useRef(0)
  const [totalCount, setTotalCount] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastForm, setLastForm] = useState<FormState | null>(null)
  const library = useSearchLibrary()
  /** 履歴・保存を開いた場所（閉じたらそこへフォーカスを戻す）。null は閉じている */
  const [libraryOrigin, setLibraryOrigin] = useState<'field' | 'button' | null>(
    null,
  )
  const libraryButtonRef = useRef<HTMLButtonElement | null>(null)
  const queryRowRef = useRef<HTMLDivElement | null>(null)
  const libraryAnchorRef = useRef<HTMLDivElement | null>(null)
  /** プログラムで検索欄へ戻したフォーカスでは、履歴・保存を開き直さない */
  const suppressLibraryOpenRef = useRef(false)
  const [inputMode, setInputMode] = useState<InputMode>('raw')
  /** URL 同期の effect から今の入力方法を読む（依存に入れて同期をやり直さないため） */
  const inputModeRef = useRef<InputMode>('raw')
  const [conditions, setConditions] = useState<KeywordConditions>(
    EMPTY_KEYWORD_CONDITIONS,
  )
  const [drafts, setDrafts] = useState<KeywordDrafts>(EMPTY_KEYWORD_DRAFTS)
  const [convertError, setConvertError] = useState<string | null>(null)
  const [editorAnimate, setEditorAnimate] = useState(false)
  const [clearUndo, setClearUndo] = useState<ClearUndo | null>(null)
  const [resultView, setResultView] = useState<ResultView>('video')
  const [lookup, setLookup] = useState<LookupResultData | null>(null)
  const [userResult, setUserResult] = useState<UserResultState | null>(null)
  const [userSort, setUserSort] = useState<UserSearchSort>('followers')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const advancedRef = useRef<HTMLDivElement | null>(null)
  const dateRangeInvalid = isSearchDateRangeReversed(form)
  const abortRef = useRef<AbortController | null>(null)
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const detailsRef = useRef<HTMLDetailsElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)
  /** runSearch が書き換えたが、まだ searchParams に届いていない URL クエリ（古い順）。届いたら読み捨てる */
  const pendingUrlWritesRef = useRef<string[]>([])
  /** いま表示中（または取得中）の検索の URL クエリ。同じ URL への変化では検索し直さない */
  const currentQueryRef = useRef<string | null>(null)

  // ページを離れたら、検索と補完（投稿者情報・タグ）の問い合わせを止める（補完は検索と同じシグナルで動く）。
  // 開発時の StrictMode は付け外しを 2 回行うので、覚えている URL も忘れて、付け直しのときに検索し直させる
  useEffect(
    () => () => {
      abortRef.current?.abort()
      abortRef.current = null
      currentQueryRef.current = null
      pendingUrlWritesRef.current = []
    },
    [],
  )

  // 詳細条件の開閉状態と、前回の入力方法を復元する（URL の検索式が 3 つの欄に分けられるときだけ条件で入力）
  useEffect(() => {
    try {
      if (localStorage.getItem('search-details-open') === '1') {
        setDetailsOpen(true)
      }
      if (localStorage.getItem(INPUT_MODE_KEY) !== 'builder') return
    } catch {
      // localStorage エラーは無視
      return
    }
    const parsed = parseKeywordQuery(
      parseFormFromUrl(new URLSearchParams(window.location.search)).form.q.trim(),
    )
    if (!parsed) return
    setConditions(parsed)
    setInputMode('builder')
    inputModeRef.current = 'builder'
  }, [])

  /** URL・履歴などから検索式が差し替わったら、条件で入力の欄も合わせる。分けられない式なら通常入力で見せる */
  const syncKeywordConditions = useCallback((q: string) => {
    setDrafts(EMPTY_KEYWORD_DRAFTS)
    if (inputModeRef.current !== 'builder') return
    const parsed = parseKeywordQuery(q.trim())
    if (parsed) {
      setConditions(parsed)
      return
    }
    setInputMode('raw')
    inputModeRef.current = 'raw'
  }, [])

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }))
    },
    [],
  )

  // リアルタイム区間（nvapi 由来）の動画はタグを持たないため、表示後に v3_guest 経由で
  // tags / tagDetails を後付けする。これでタグ系のユーザーNG・タグ表示が区間にも効く。
  // サーバーが自動 NG のロックタグ規則 D に当たると判定した動画（hiddenIds）は、ここで一覧から外す。
  const enrichRealtimeTags = useCallback(
    async (data: SearchApiResponse, signal?: AbortSignal) => {
      // 早期 return より前に採番し、新しい検索が来たら（結果がマージでなくても）古い補完を無効化する
      const requestId = ++tagsRequestIdRef.current
      if (data.source !== 'merged' || !data.realtimeCount) return
      const targets = data.items
        .filter(
          (it) =>
            it.tags === undefined &&
            it.tagDetails === undefined &&
            isVideoId(it.id),
        )
        .map((it) => it.id)
      if (targets.length === 0) return
      const batches: Promise<void>[] = []
      for (let i = 0; i < targets.length; i += REALTIME_TAGS_MAX_VIDEOS) {
        const chunk = targets.slice(i, i + REALTIME_TAGS_MAX_VIDEOS)
        batches.push(
          enrichmentQueueRef.current.run(async () => {
            try {
              const res = await fetch(
                `/api/search/realtime-tags?${buildRealtimeTagsQuery(chunk)}`,
                { signal },
              )
              if (!res.ok) return
              const body = (await res.json()) as {
                tagDetails?: Record<
                  string,
                  Array<{ name: string; isLocked: boolean }>
                >
                hiddenIds?: string[]
              }
              if (
                signal?.aborted ||
                requestId !== tagsRequestIdRef.current ||
                !body.tagDetails
              )
                return
              const details = body.tagDetails
              const hidden = new Set(body.hiddenIds ?? [])
              setItems((prev) =>
                prev
                  ? prev
                      .filter((it) => !hidden.has(it.id))
                      .map((it) =>
                        details[it.id]
                          ? {
                              ...it,
                              tagDetails: details[it.id],
                              tags: details[it.id].map((t) => t.name),
                            }
                          : it,
                      )
                  : prev,
              )
            } catch {
              /* A failed batch must not discard the remaining enrichment. */
            }
          }, signal),
        )
      }
      await Promise.all(batches)
    },
    [],
  )

  // Snapshot API には投稿者名・アイコンが無い（userId / channelId のみ）ため、表示後に
  // /api/search/owners で後付けし、ランキング画面と同じ投稿者表示にする。
  // ユーザーは ID ごと、チャンネルは代表動画 1 件ごとに問い合わせる。
  // サーバーが管理者の投稿者名 NG に当たると判定した投稿者（hiddenAuthorIds）の動画は、ここで一覧から外す。
  const enrichOwners = useCallback(
    async (data: SearchApiResponse, signal?: AbortSignal) => {
      const requestId = ++ownersRequestIdRef.current
      const userIds = new Set<string>()
      const channelVideos = new Map<string, string>()
      for (const it of data.items) {
        if (it.authorName || !it.authorId) continue
        if (it.authorId.startsWith('channel/')) {
          const channelId = it.authorId.slice('channel/'.length)
          if (!channelVideos.has(channelId) && isVideoId(it.id))
            channelVideos.set(channelId, it.id)
        } else if (isUserId(it.authorId)) {
          userIds.add(it.authorId)
        }
      }
      if (userIds.size === 0 && channelVideos.size === 0) return

      const applyOwners = (
        users: Record<string, OwnerInfo>,
        channels: Record<string, OwnerInfo>,
        missing: string[],
        hiddenAuthorIds: string[],
      ): void => {
        const deleted = new Set(missing)
        const hidden = new Set(hiddenAuthorIds)
        setItems((prev) =>
          prev
            ? prev
                .filter((it) => !(it.authorId && hidden.has(it.authorId)))
                .map((it) => {
                  if (it.authorName || !it.authorId) return it
                  if (deleted.has(it.authorId))
                    return { ...it, authorDeleted: true }
                  const info = it.authorId.startsWith('channel/')
                    ? channels[it.authorId.slice('channel/'.length)]
                    : users[it.authorId]
                  return info
                    ? {
                        ...it,
                        authorName: info.name,
                        authorIcon: info.icon ?? it.authorIcon,
                      }
                    : it
                })
            : prev,
        )
      }

      // 問い合わせは正規形（ID を昇順）。サーバーはそれ以外の形を受け付けない
      const requests: string[] = []
      const userList = Array.from(userIds)
      for (let i = 0; i < userList.length; i += OWNER_INFO_MAX_USERS) {
        requests.push(
          buildOwnersQuery({
            userIds: userList.slice(i, i + OWNER_INFO_MAX_USERS),
            channelVideoIds: [],
          }),
        )
      }
      const videoList = Array.from(channelVideos.values())
      for (
        let i = 0;
        i < videoList.length;
        i += OWNER_INFO_MAX_CHANNEL_VIDEOS
      ) {
        requests.push(
          buildOwnersQuery({
            userIds: [],
            channelVideoIds: videoList.slice(
              i,
              i + OWNER_INFO_MAX_CHANNEL_VIDEOS,
            ),
          }),
        )
      }

      await Promise.all(
        requests.map((query) =>
          enrichmentQueueRef.current.run(async () => {
            try {
              const res = await fetch(`/api/search/owners?${query}`, { signal })
              if (!res.ok) return
              const body = (await res.json()) as {
                users?: Record<string, OwnerInfo>
                channels?: Record<string, OwnerInfo>
                missing?: string[]
                hiddenAuthorIds?: string[]
              }
              if (signal?.aborted || requestId !== ownersRequestIdRef.current)
                return
              applyOwners(
                body.users ?? {},
                body.channels ?? {},
                body.missing ?? [],
                body.hiddenAuthorIds ?? [],
              )
            } catch {
              // 補完は任意機能なので失敗（abort 含む）しても検索結果はそのまま（ID 表示のまま）
            }
          }, signal),
        ),
      )
    },
    [],
  )

  /** 表示中の検索を URL に残す（戻る・進む・共有で同じ表示になる）。自分で書いた URL は同期の effect が読み捨てる */
  const writeSearchUrl = useCallback(
    (queryString: string) => {
      currentQueryRef.current = queryString
      if (
        queryString !== new URLSearchParams(window.location.search).toString()
      ) {
        pendingUrlWritesRef.current.push(queryString)
        router.replace(queryString ? `/search?${queryString}` : '/search', {
          scroll: false,
        })
      }
    },
    [router],
  )

  const runSearch = useCallback(
    async (searchForm: FormState, searchPage: number) => {
      if (isSearchDateRangeReversed(searchForm)) {
        abortRef.current?.abort()
        setIsLoading(false)
        setAdvancedOpen(true)
        return
      }
      setResultView('video')
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setIsLoading(true)
      setError(null)

      // 条件は正規形にしてから使う（URL・API・適用中のチップのどれも、実際に検索した条件と一致させる）
      const conditions = parseSearchConditions(
        buildQueryParams(searchForm, searchPage),
      )
      const queryString = buildSearchQuery(conditions)
      const conditionKey = buildSearchQuery({ ...conditions, page: 1 })
      setLastForm(parseFormFromUrl(new URLSearchParams(queryString)).form)
      writeSearchUrl(queryString)

      // 2ページ目以降は、直前に表示した結果と同じ条件のときだけ境界とリアルタイム件数のヒントを渡す
      // （件数のヒントでサーバーが Snapshot を並列取得できる）
      const hint = pagingHintRef.current
      const sameConditions =
        conditions.page > 1 &&
        hint !== null &&
        hint.conditionKey === conditionKey
      const apiQuery = buildSearchQuery(
        conditions,
        sameConditions
          ? {
              rtCount: hint.realtimeCount,
              boundary: hint.boundary ?? undefined,
            }
          : {},
      )

      try {
        const res = await fetch(`/api/search?${apiQuery}`, {
          signal: controller.signal,
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string
          } | null
          // 新しい検索に置き換えられた（または離れた）後の応答は捨てる
          if (controller.signal.aborted) return
          setError(
            SEARCH_ERROR_MESSAGES[body?.error ?? ''] ??
              '検索中にエラーが発生しました。',
          )
          setItems(null)
          return
        }
        const data = (await res.json()) as SearchApiResponse
        if (controller.signal.aborted) return
        setItems(data.items)
        setTotalCount(data.totalCount)
        setPage(data.page)
        pagingHintRef.current = {
          conditionKey,
          boundary:
            data.source === 'merged' && data.boundary ? data.boundary : null,
          realtimeCount: data.realtimeCount ?? 0,
        }
        setResultMeta({
          source: data.source ?? 'snapshot',
          boundary: data.boundary,
          realtimeCount: data.realtimeCount ?? 0,
          realtimeGap: data.realtimeGap,
          realtimeError: data.realtimeError,
          freshError: data.freshError,
        })
        void enrichRealtimeTags(data, controller.signal)
        void enrichOwners(data, controller.signal)
      } catch (err) {
        // 置き換えられた検索の失敗（中断を含む）で、新しい検索の表示を上書きしない
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        )
          return
        setError('検索中にエラーが発生しました。ネットワークをご確認ください。')
        setItems(null)
      } finally {
        if (abortRef.current === controller) {
          setIsLoading(false)
        }
      }
    },
    [writeSearchUrl, enrichRealtimeTags, enrichOwners],
  )

  /** 動画ID・ユーザーの結果は検索欄（通常入力）で扱う。条件で入力の好みは端末に残したまま、この表示だけ通常入力にする */
  const switchToRawInput = useCallback(() => {
    setInputMode('raw')
    inputModeRef.current = 'raw'
  }, [])

  /** 動画IDで開く。前の問い合わせは止め、見つからない ID も入力の順に理由を出す */
  const runLookup = useCallback(
    async (allIds: string[]) => {
      const ids = allIds.slice(0, VIDEO_LOOKUP_MAX_IDS)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setResultView('id')
      switchToRawInput()
      setIsLoading(true)
      setError(null)
      setLookup(null)
      writeSearchUrl(buildLookupPageQuery(ids))
      try {
        const res = await fetch(
          `/api/search/videos?${buildVideoLookupQuery(ids)}`,
          { signal: controller.signal },
        )
        const body = (await res.json().catch(() => null)) as Partial<
          LookupResultData & { error: string }
        > | null
        if (controller.signal.aborted) return
        if (!res.ok || !body) {
          setError(
            SEARCH_ERROR_MESSAGES[body?.error ?? ''] ??
              '動画を取得できませんでした。しばらくしてからお試しください。',
          )
          return
        }
        const list = (value: unknown): string[] =>
          Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []
        setLookup({
          ids,
          overflow: allIds.length - ids.length,
          items: Array.isArray(body.items) ? body.items : [],
          hiddenIds: list(body.hiddenIds),
          missing: list(body.missing),
          unavailable: list(body.unavailable),
          failed: list(body.failed),
        })
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        )
          return
        setError('動画を取得できませんでした。ネットワークをご確認ください。')
      } finally {
        if (abortRef.current === controller) setIsLoading(false)
      }
    },
    [writeSearchUrl, switchToRawInput],
  )

  /** ユーザーを探す。動画の検索と同じく、次の一覧が届くまで前の一覧と見出しを出したままにする */
  const runUserSearch = useCallback(
    async (conditions: UserSearchConditions) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      setResultView('user')
      switchToRawInput()
      setUserSort(conditions.sort)
      setIsLoading(true)
      setError(null)
      writeSearchUrl(buildUserPageQuery(conditions))
      try {
        const res = await fetch(
          `/api/search/users?${buildUserSearchQuery(conditions)}`,
          { signal: controller.signal },
        )
        const body = (await res.json().catch(() => null)) as {
          items?: SearchUser[]
          totalCount?: number
          error?: string
        } | null
        if (controller.signal.aborted) return
        if (!res.ok || !body) {
          setError(
            SEARCH_ERROR_MESSAGES[body?.error ?? ''] ??
              'ユーザーを検索できませんでした。しばらくしてからお試しください。',
          )
          setUserResult(null)
          return
        }
        setUserResult({
          conditions,
          items: Array.isArray(body.items) ? body.items : [],
          totalCount:
            typeof body.totalCount === 'number' ? body.totalCount : 0,
        })
      } catch (err) {
        if (
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError')
        )
          return
        setError(
          'ユーザーを検索できませんでした。ネットワークをご確認ください。',
        )
        setUserResult(null)
      } finally {
        if (abortRef.current === controller) setIsLoading(false)
      }
    },
    [writeSearchUrl, switchToRawInput],
  )

  // URL から条件が消えたとき（ナビの「検索」など）は、検索前の表示に戻す
  const resetResults = useCallback((query: string) => {
    abortRef.current?.abort()
    abortRef.current = null
    currentQueryRef.current = query
    pagingHintRef.current = null
    setIsLoading(false)
    setError(null)
    setItems(null)
    setTotalCount(0)
    setResultMeta(null)
    setLastForm(null)
    setResultView('video')
    setLookup(null)
    setUserResult(null)
  }, [])

  // URL（外部システム）に画面を合わせる。直接アクセス、ブラウザの戻る・進む、ヘッダーやボトムナビからの遷移で
  // searchParams が変わったら、URL から条件を戻して検索し直す。runSearch が自分で書いた URL が届いたときは読み捨てる
  useEffect(() => {
    const query = new URLSearchParams(searchParams.toString()).toString()
    const pending = pendingUrlWritesRef.current
    const ownWrite = pending.indexOf(query)
    if (ownWrite >= 0) {
      // それより前の書き込みは、あとの書き込みに追い越されて届かない
      pending.splice(0, ownWrite + 1)
      return
    }
    if (query === currentQueryRef.current) return
    const params = new URLSearchParams(query)
    const parsed = parseFormFromUrl(params)
    setForm(parsed.form)
    syncKeywordConditions(parsed.form.q)
    const type = params.get('type')
    const ids = type === 'id' ? parseVideoIdsInput(params.get('q') ?? '') : null
    if (ids) {
      void runLookup(ids)
      return
    }
    const userConditions =
      type === 'user' ? parseUserPageConditions(params) : null
    if (userConditions?.q) {
      void runUserSearch(userConditions)
      return
    }
    if (SEARCH_CONDITION_KEYS.some((key) => params.has(key))) {
      void runSearch(parsed.form, parsed.page)
    } else {
      resetResults(query)
    }
  }, [
    searchParams,
    runSearch,
    runLookup,
    runUserSearch,
    resetResults,
    syncKeywordConditions,
  ])

  /** 条件で入力のときは、欄に打ちかけの語も加えてから送る */
  const committedConditions = useMemo(
    () => commitKeywordDrafts(conditions, drafts),
    [conditions, drafts],
  )
  const keywordTooLong =
    inputMode === 'builder' && isKeywordQueryTooLong(committedConditions)

  const closeLibrary = useCallback(
    (returnFocus: boolean) => {
      const origin = libraryOrigin
      setLibraryOrigin(null)
      library.reset()
      if (!returnFocus || !origin) return
      if (origin === 'field') {
        suppressLibraryOpenRef.current = true
        document.getElementById(KEYWORD_INPUT_ID)?.focus()
        suppressLibraryOpenRef.current = false
      } else {
        libraryButtonRef.current?.focus()
      }
    },
    [libraryOrigin, library],
  )

  /** 動画IDで開く（候補・Enter・履歴から）。欄は整えた ID の並びにする */
  const openLookup = useCallback(
    (ids: string[]) => {
      setForm((prev) => ({ ...prev, q: ids.join(' ') }))
      setLibraryOrigin(null)
      library.reset()
      library.record(buildLookupPageQuery(ids.slice(0, VIDEO_LOOKUP_MAX_IDS)))
      void runLookup(ids)
    },
    [library, runLookup],
  )

  /** ユーザーを探す（候補・Enter・履歴から）。実行した検索として記録する */
  const openUserSearch = useCallback(
    (raw: string, sort: UserSearchSort) => {
      const q = normalizeUserQuery(raw)
      if (!q) return
      const conditions: UserSearchConditions = { q, sort, page: 1 }
      setLibraryOrigin(null)
      library.reset()
      library.record(buildUserPageQuery(conditions))
      void runUserSearch(conditions)
    },
    [library, runUserSearch],
  )

  /** 今の検索欄の語で、動画の検索結果に戻る（ユーザー・動画IDの表示から） */
  const showVideoResults = useCallback(() => {
    setLibraryOrigin(null)
    library.reset()
    library.record(toSearchQuery(form, 1))
    void runSearch(form, 1)
  }, [form, library, runSearch])

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      let submitForm = form
      if (inputMode === 'builder') {
        if (keywordTooLong) return
        if (committedConditions !== conditions) {
          setConditions(committedConditions)
          submitForm = { ...form, q: buildKeywordQuery(committedConditions) }
          setForm(submitForm)
        }
        setDrafts(EMPTY_KEYWORD_DRAFTS)
      }
      if (inputMode === 'raw') {
        // 動画ID・URL だけならその動画を開く。ユーザーの結果を見ているあいだはユーザーを探し直す
        const ids = parseVideoIdsInput(submitForm.q)
        if (ids) {
          openLookup(ids)
          return
        }
        if (resultView === 'user') {
          openUserSearch(submitForm.q, userSort)
          return
        }
      }
      setLibraryOrigin(null)
      library.reset()
      if (!isSearchDateRangeReversed(submitForm)) {
        setAdvancedOpen(false)
        // 最近の検索は、実行した検索だけを記録する（ページ送り・URL の移動では記録しない）
        library.record(toSearchQuery(submitForm, 1))
      }
      void runSearch(submitForm, 1)
    },
    [
      form,
      inputMode,
      keywordTooLong,
      committedConditions,
      conditions,
      library,
      runSearch,
      openLookup,
      openUserSearch,
      resultView,
      userSort,
    ],
  )

  /** 保存した検索・最近の検索から選んだら、条件を入れてすぐ検索する（本家アプリと同じ） */
  const handleRunFromLibrary = useCallback(
    (query: string) => {
      const params = new URLSearchParams(query)
      const type = params.get('type')
      const ids = type === 'id' ? parseVideoIdsInput(params.get('q') ?? '') : null
      if (ids) {
        openLookup(ids)
        return
      }
      const user = type === 'user' ? parseUserPageConditions(params) : null
      if (user?.q) {
        setForm((prev) => ({ ...prev, q: user.q }))
        openUserSearch(user.q, user.sort)
        return
      }
      const parsed = parseFormFromUrl(params)
      setForm(parsed.form)
      syncKeywordConditions(parsed.form.q)
      setLibraryOrigin(null)
      library.reset()
      library.record(toSearchQuery(parsed.form, 1))
      // 保存・履歴の条件はページ番号なし（1 ページ目）。古い保存データにページがあればそれに従う
      void runSearch(parsed.form, parsed.page)
    },
    [library, runSearch, syncKeywordConditions, openLookup, openUserSearch],
  )

  const switchInputMode = useCallback(
    (mode: InputMode) => {
      if (mode === inputMode) return
      setLibraryOrigin(null)
      library.reset()
      if (mode === 'builder') {
        const parsed = parseKeywordQuery(form.q.trim())
        if (!parsed) {
          setConvertError(CONVERT_ERROR)
          return
        }
        setConditions(parsed)
        setEditorAnimate(true)
      } else if (committedConditions !== conditions) {
        // 打ちかけの語は捨てずに式へ入れる
        setForm((prev) => ({
          ...prev,
          q: buildKeywordQuery(committedConditions),
        }))
      }
      setDrafts(EMPTY_KEYWORD_DRAFTS)
      setConvertError(null)
      setInputMode(mode)
      inputModeRef.current = mode
      try {
        localStorage.setItem(INPUT_MODE_KEY, mode)
      } catch {
        // 保存できなくても、この画面では切り替える
      }
    },
    [inputMode, form.q, committedConditions, conditions, library],
  )

  /** 条件で入力の欄が変わったら、検索式（URL・保存・履歴に使う正）も合わせる */
  const handleConditionsChange = useCallback((next: KeywordConditions) => {
    setConditions(next)
    setForm((prev) => ({ ...prev, q: buildKeywordQuery(next) }))
  }, [])

  const handleDraftChange = useCallback(
    (group: KeywordGroup, value: string) => {
      setDrafts((prev) => ({ ...prev, [group]: value }))
      // 打ちかけの語も「次の編集」なので、クリアの取り消しはここで終える
      setClearUndo(null)
    },
    [],
  )

  // クリアは同じ場所の「元に戻す」で取り消せる（次に編集するまで）。戻しても検索はしない
  const clearKeyword = useCallback(() => {
    const cleared = { ...form, q: '' }
    setClearUndo({
      kind: 'keyword',
      previous: form,
      previousConditions: conditions,
      previousDrafts: drafts,
      cleared,
    })
    setForm(cleared)
    setConditions(EMPTY_KEYWORD_CONDITIONS)
    setDrafts(EMPTY_KEYWORD_DRAFTS)
    if (inputMode === 'raw') document.getElementById(KEYWORD_INPUT_ID)?.focus()
  }, [form, conditions, drafts, inputMode])

  const clearDetails = useCallback(() => {
    const cleared = {
      ...EMPTY_FORM,
      q: form.q,
      targets: form.targets,
      contentType: form.contentType,
      sort: form.sort,
    }
    setClearUndo({
      kind: 'details',
      previous: form,
      previousConditions: conditions,
      previousDrafts: drafts,
      cleared,
    })
    setForm(cleared)
  }, [form, conditions, drafts])

  const undoClear = useCallback(() => {
    if (!clearUndo) return
    setForm(clearUndo.previous)
    setConditions(clearUndo.previousConditions)
    setDrafts(clearUndo.previousDrafts)
    setClearUndo(null)
    if (clearUndo.kind === 'keyword' && inputMode === 'raw') {
      suppressLibraryOpenRef.current = true
      document.getElementById(KEYWORD_INPUT_ID)?.focus()
      suppressLibraryOpenRef.current = false
    }
  }, [clearUndo, inputMode])

  const canUndo = (kind: ClearUndo['kind']): boolean =>
    clearUndo?.kind === kind && form === clearUndo.cleared

  // 通常入力: 検索欄が空のままフォーカスすると履歴・保存を出し、打ち始めたら閉じて語の候補に任せる
  const handleKeywordChange = useCallback(
    (value: string) => {
      updateField('q', value)
      const input = document.getElementById(KEYWORD_INPUT_ID)
      if (value === '' && document.activeElement === input) {
        setLibraryOrigin((prev) => prev ?? 'field')
      } else if (value !== '' && libraryOrigin && !library.saving) {
        setLibraryOrigin(null)
        library.reset()
      }
    },
    [updateField, libraryOrigin, library],
  )

  const handleKeywordFocus = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      // 欄の中のクリア・元に戻すボタンへのフォーカスでは開かない
      if (event.target.id !== KEYWORD_INPUT_ID) return
      if (suppressLibraryOpenRef.current || form.q !== '') return
      setLibraryOrigin((prev) => prev ?? 'field')
    },
    [form.q],
  )

  const handleKeywordKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented) return
      // 検索欄（type=search）の Escape はブラウザが黙って消すので、取り消せるクリアにする
      if (!libraryOrigin && event.key === 'Escape' && form.q !== '') {
        event.preventDefault()
        clearKeyword()
        return
      }
      if (!libraryOrigin) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setLibraryOrigin(null)
        library.reset()
      } else if (event.key === 'ArrowDown') {
        const first = queryRowRef.current?.querySelector<HTMLElement>(
          '[data-library-item]',
        )
        if (!first) return
        event.preventDefault()
        first.focus()
      }
    },
    [libraryOrigin, library, form.q, clearKeyword],
  )

  // フォーカスが検索欄・履歴・保存・ボタンの外へ出たら閉じる（外側のクリックも含む）
  const handleLibraryBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (!libraryOrigin) return
      const next = event.relatedTarget
      if (
        next instanceof Node &&
        (queryRowRef.current?.contains(next) ||
          libraryAnchorRef.current?.contains(next))
      )
        return
      setLibraryOrigin(null)
      library.reset()
    },
    [libraryOrigin, library],
  )

  const toggleLibrary = useCallback(() => {
    if (libraryOrigin) {
      setLibraryOrigin(null)
      library.reset()
      return
    }
    setLibraryOrigin('button')
  }, [libraryOrigin, library])

  // 並び替えはページ送りと同じく実行済みの条件に適用する。入力途中の条件は保持する。
  const handleSortChange = useCallback(
    (sort: string) => {
      if (sort === form.sort) return
      setForm((prev) => ({ ...prev, sort }))
      if (!lastForm) return
      // 選択した並び順と古い結果を同時に見せず、取得中は既存スケルトンを使う。
      setItems(null)
      library.record(toSearchQuery({ ...lastForm, sort }, 1))
      void runSearch({ ...lastForm, sort }, 1)
    },
    [form.sort, lastForm, library, runSearch],
  )

  // タグ欄の Enter でも検索する（候補を選ぶ Enter は欄が受け持つ）。日本語の変換を確定する Enter では送らない。
  // 送信ボタンを押したのと同じ扱いにして、入力の検証も通す
  const handleTagKeyPress = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return
      submitRef.current?.click()
    },
    [],
  )

  // 詳細条件を閉じたままだと、ブラウザは不正な値の欄を見せられず、送信が無反応になる。
  // 送信を止めた欄が詳細条件の中にあれば、開いてブラウザがその欄と理由を示せるようにする
  const handleInvalid = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      if (!(event.target instanceof HTMLElement)) return
      // ブラウザが不正な欄へフォーカスする前に、外側のパネルも表示する。
      if (advancedRef.current?.contains(event.target)) {
        advancedRef.current.hidden = false
        setAdvancedOpen(true)
      }
      let parent = event.target.closest('details')
      while (parent) {
        parent.open = true
        if (parent === detailsRef.current) setDetailsOpen(true)
        parent = parent.parentElement?.closest('details') ?? null
      }
    },
    [],
  )

  // ページ送り（ランキング画面と同じ配置・挙動）: 上部からは位置を保ち、下部からは結果一覧の先頭へ戻す。
  // 送るのは実行済みの条件（lastForm）。入力欄で編集中の、まだ送信していない条件は使わない
  const handlePageChangeTop = useCallback(
    (nextPage: number) => {
      if (lastForm) void runSearch(lastForm, nextPage)
    },
    [lastForm, runSearch],
  )

  const handlePageChangeBottom = useCallback(
    (nextPage: number) => {
      if (!lastForm) return
      void runSearch(lastForm, nextPage)
      // スティッキーヘッダ分は .search-results の scroll-margin-top で吸収する
      resultsRef.current?.scrollIntoView({ block: 'start' })
    },
    [lastForm, runSearch],
  )

  // ユーザーNGリストを自動適用
  const filteredItems = useMemo(() => {
    if (!items) return null
    return filterWithExtendedNGList(items, ngList).filteredItems
  }, [items, ngList])

  // ページ送りは検索の総数を表示し、索引が返せる深さ（10万件）まで移動できる。
  const totalPages = Math.max(
    1,
    Math.ceil(Math.min(totalCount, SEARCH_MAX_OFFSET) / SEARCH_PAGE_SIZE),
  )

  // クイックNG追加（client-page と同じセマンティクス: title/author は完全一致）
  const handleQuickNGAdd = useCallback(
    (video: RankingItem, type: NGType, value: string | string[]) => {
      const stringValue = Array.isArray(value) ? value[0] : value
      const trimmedValue = stringValue?.trim()
      if (!trimmedValue) return
      // 名前の分からない行（名前の補完前・補完に失敗した行）の「投稿者名」は ID になっている。
      // 名前として登録しても効かないので登録せず、投稿者 ID で NG にするよう案内する（行の⋮メニューはまだ出す）
      if (type === 'author' && !video.authorName?.trim()) {
        showToast(
          '投稿者名が分からないため、投稿者 ID で NG にしてください。',
          'error',
        )
        return
      }

      const updated: ExtendedUserNGList = {
        ...ngList,
        updatedAt: new Date().toISOString(),
      }
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
            updated.videoTitles = {
              ...ngList.videoTitles,
              exact: [...ngList.videoTitles.exact, trimmedValue],
            }
            wasAdded = true
          }
          break
        case 'author':
          if (!ngList.authorNames.exact.includes(trimmedValue)) {
            updated.authorNames = {
              ...ngList.authorNames,
              exact: [...ngList.authorNames.exact, trimmedValue],
            }
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
    [ngList, saveNGListDirectly],
  )

  const applyDatePreset = useCallback((days: number) => {
    const now = new Date()
    const from = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
    setForm((prev) => ({
      ...prev,
      dateFrom: formatDateInput(from),
      dateTo: formatDateInput(now),
    }))
  }, [])

  /** 今の条件（条件で入力の打ちかけの語も含む）の URL クエリ。保存に使う */
  /** 今の検索欄の語が動画ID・URL だけなら、その ID の並び（検索欄の候補・保存に使う） */
  const keywordIds = inputMode === 'raw' ? parseVideoIdsInput(form.q) : null
  const userQuery = normalizeUserQuery(form.q)

  const currentQuery =
    inputMode === 'builder'
      ? toSearchQuery({ ...form, q: buildKeywordQuery(committedConditions) }, 1)
      : resultView === 'id' && keywordIds
        ? buildLookupPageQuery(keywordIds.slice(0, VIDEO_LOOKUP_MAX_IDS))
        : resultView === 'user' && userQuery
          ? buildUserPageQuery({ q: userQuery, sort: userSort, page: 1 })
          : toSearchQuery(form, 1)

  /** 検索欄の候補の最後に出す操作: 動画ID なら「表示」、語なら「ユーザーを探す」（ユーザーの結果では「動画を探す」） */
  const keywordActions: AutocompleteAction[] = keywordIds
    ? [
        {
          key: 'ids',
          icon: <Film size={16} aria-hidden="true" />,
          label:
            keywordIds.length === 1
              ? `動画 ${keywordIds[0]} を表示`
              : `動画 ${keywordIds[0]} ほか${keywordIds.length - 1}件を表示`,
          onSelect: () => openLookup(keywordIds),
        },
      ]
    : userQuery
      ? [
          resultView === 'user'
            ? {
                key: 'videos',
                icon: <Film size={16} aria-hidden="true" />,
                label: `「${shortLabel(userQuery)}」の動画を探す`,
                onSelect: showVideoResults,
              }
            : {
                key: 'users',
                icon: <User size={16} aria-hidden="true" />,
                label: `「${shortLabel(userQuery)}」でユーザーを探す`,
                onSelect: () => openUserSearch(form.q, userSort),
              },
        ]
      : []

  // 利用者の NG は、動画IDで開いた結果・ユーザーの一覧にも同じ規則で当てる
  const lookupVisibleIds = useMemo(
    () =>
      new Set(
        lookup
          ? filterWithExtendedNGList(lookup.items, ngList).filteredItems.map(
              (item) => item.id,
            )
          : [],
      ),
    [lookup, ngList],
  )
  const visibleUsers = useMemo(
    () =>
      userResult?.items.filter(
        (user) =>
          !ngList.authorIds.includes(user.id) &&
          !matchesAuthorNameNG(user.name, ngList.authorNames),
      ) ?? [],
    [userResult, ngList],
  )

  const handleUserSortChange = useCallback(
    (sort: UserSearchSort) => {
      if (!userResult) return
      const conditions = { ...userResult.conditions, sort, page: 1 }
      library.record(buildUserPageQuery(conditions))
      void runUserSearch(conditions)
    },
    [userResult, library, runUserSearch],
  )

  const handleUserPageChange = useCallback(
    (nextPage: number, fromBottom: boolean) => {
      if (!userResult) return
      void runUserSearch({ ...userResult.conditions, page: nextPage })
      if (fromBottom) resultsRef.current?.scrollIntoView({ block: 'start' })
    },
    [userResult, runUserSearch],
  )

  /** ユーザーを投稿者 ID の NG に入れる（一覧からはすぐ消える） */
  const handleUserNG = useCallback(
    (user: SearchUser) => {
      if (ngList.authorIds.includes(user.id)) {
        showToast(`すでにNGリストに登録済みです: ${user.name}`, 'info')
        return
      }
      saveNGListDirectly({
        ...ngList,
        authorIds: [...ngList.authorIds, user.id],
        totalCount: ngList.totalCount + 1,
        updatedAt: new Date().toISOString(),
      })
      showToast(`「${user.name}」をNGリストに追加しました`)
    },
    [ngList, saveNGListDirectly],
  )

  // 今の条件を名前を付けて保存する（履歴・保存の中で名前を入れる）
  const handleSaveCurrent = useCallback(() => {
    if (isSearchDateRangeReversed(form)) {
      setAdvancedOpen(true)
      setLibraryOrigin('button')
      library.notify('開始日は終了日以前の日付を指定してください。', 'error')
      return
    }
    setLibraryOrigin('button')
    library.startSaving(currentQuery)
  }, [form, currentQuery, library])

  // 折りたたんだ数値条件の指定数
  const rangeCount = useMemo(() => {
    let count = 0
    for (const field of RANGE_FIELDS) {
      if (form[field.min] || form[field.max]) count++
    }
    if (form.durationMin || form.durationMax) count++
    return count
  }, [form])

  const notices = realtimeNotices(resultMeta)

  return (
    <TagDisplayProvider>
      <div className="search-page">
        <div className="search-page__head">
          <h1 className="search-page__title">動画検索</h1>
          {resultView === 'video' && (
          <div
            className="search-form__types search-page__mode"
            role="radiogroup"
            aria-label="入力方法"
          >
            {(
              [
                ['raw', '通常入力'],
                ['builder', '条件で入力'],
              ] as const
            ).map(([mode, label]) => (
              <label
                key={mode}
                className={`search-form__type${inputMode === mode ? ' search-form__type--active' : ''}`}
              >
                <input
                  type="radio"
                  name="inputMode"
                  value={mode}
                  checked={inputMode === mode}
                  onChange={() => switchInputMode(mode)}
                />
                {label}
              </label>
            ))}
          </div>
          )}
          <div
            ref={libraryAnchorRef}
            className="search-library-anchor"
            onBlur={handleLibraryBlur}
          >
            <button
              ref={libraryButtonRef}
              type="button"
              className="search-page__library"
              aria-label="履歴・保存"
              aria-haspopup="dialog"
              aria-expanded={libraryOrigin !== null}
              onClick={toggleLibrary}
            >
              <History size={16} aria-hidden="true" />
              <span className="search-page__library-label">履歴・保存</span>
            </button>
            {libraryOrigin && inputMode === 'builder' && (
              <SearchLibraryPanel
                variant="popover"
                library={library}
                onSaveCurrent={handleSaveCurrent}
                onRun={handleRunFromLibrary}
                onClose={closeLibrary}
              />
            )}
          </div>
        </div>

        <form
          className="search-form"
          onSubmit={handleSubmit}
          onInvalidCapture={handleInvalid}
        >
          {inputMode === 'raw' ? (
            <>
              <div
                ref={queryRowRef}
                className="search-form__row search-form__query-row"
                onBlur={handleLibraryBlur}
              >
                <div
                  className="search-form__keyword-box"
                  onFocus={handleKeywordFocus}
                  onKeyDown={handleKeywordKeyDown}
                >
                  <TagAutocompleteInput
                    id={KEYWORD_INPUT_ID}
                    type="search"
                    completionMode="query"
                    wrapperClassName="search-form__keyword"
                    className="search-form__keyword-input"
                    value={form.q}
                    onChange={handleKeywordChange}
                    onKeyPress={handleTagKeyPress}
                    actions={keywordActions}
                    suggest={!keywordIds && resultView !== 'user'}
                    placeholder={
                      form.targets === 'tag'
                        ? 'タグを入力（完全一致）'
                        : 'キーワードを入力'
                    }
                    ariaLabel="検索キーワード"
                  />
                  {canUndo('keyword') ? (
                    <button
                      type="button"
                      className="search-form__keyword-action search-form__undo"
                      aria-label="元に戻す"
                      onClick={undoClear}
                    >
                      <Undo2 size={16} aria-hidden="true" />
                      <span className="search-form__undo-label">元に戻す</span>
                    </button>
                  ) : (
                    form.q && (
                      <button
                        type="button"
                        className="search-form__keyword-action"
                        aria-label="入力を消す"
                        onClick={clearKeyword}
                      >
                        <X size={16} aria-hidden="true" />
                      </button>
                    )
                  )}
                </div>
                {/* 読み込み中も押せる（条件を直してすぐ検索し直せる。前の検索は止める）。無効にすると入力欄の Enter でも送れない */}
                <button
                  ref={submitRef}
                  type="submit"
                  className="search-form__submit"
                >
                  {isLoading ? '検索中…' : '検索'}
                </button>
                {libraryOrigin && (
                  <SearchLibraryPanel
                    variant="dropdown"
                    library={library}
                    onSaveCurrent={handleSaveCurrent}
                    onRun={handleRunFromLibrary}
                    onClose={closeLibrary}
                    onExitTop={() => closeLibrary(true)}
                  />
                )}
              </div>
              <details
                className={`search-form__help ${controlStyles.disclosure}`}
                hidden={resultView !== 'video'}
              >
                <summary>
                  <ChevronDown
                    size={16}
                    className={controlStyles.disclosureIcon}
                    aria-hidden="true"
                  />
                  キーワードの指定方法
                </summary>
                <p className="search-form__hint">
                  スペース区切り = すべて含む ／ <code>A OR B</code> = いずれか
                  ／ <code>-語</code> = 除外
                </p>
              </details>
            </>
          ) : (
            <KeywordConditionEditor
              conditions={conditions}
              drafts={drafts}
              targets={form.targets}
              description={describeKeywordConditions(
                committedConditions,
                form.targets,
              )}
              onConditionsChange={handleConditionsChange}
              onDraftChange={handleDraftChange}
              onSubmit={() => submitRef.current?.click()}
              animateIn={editorAnimate}
              actions={
                <>
                  {canUndo('keyword') ? (
                    <button
                      type="button"
                      className="search-form__preset search-form__undo"
                      onClick={undoClear}
                    >
                      <Undo2 size={16} aria-hidden="true" />
                      元に戻す
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="search-form__preset search-form__quiet"
                      disabled={
                        !form.q &&
                        !Object.values(drafts).some((d) => d.trim())
                      }
                      onClick={clearKeyword}
                    >
                      クリア
                    </button>
                  )}
                  <button
                    ref={submitRef}
                    type="submit"
                    className="search-form__submit"
                    disabled={keywordTooLong}
                  >
                    {isLoading ? '検索中…' : '検索'}
                  </button>
                </>
              }
            />
          )}
          {convertError && (
            <p className="search-form__error" role="status">
              {convertError}
            </p>
          )}

          <div
            className="search-form__row search-form__targets"
            hidden={resultView !== 'video'}
          >
            <div
              className="search-form__radios"
              role="radiogroup"
              aria-label="検索対象"
            >
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
            </div>
            <div className="search-form__display-actions">
              {/* 条件はフォームの送信でまとめて適用する */}
              <div
                className="search-form__types"
                role="radiogroup"
                aria-label="動画の種類"
              >
                {SEARCH_CONTENT_TYPE_OPTIONS.map((option) => {
                  const active = form.contentType === option.value
                  return (
                    <label
                      key={option.value}
                      className={`search-form__type${active ? ' search-form__type--active' : ''}`}
                    >
                      <input
                        type="radio"
                        name="contentType"
                        value={option.value}
                        checked={active}
                        onChange={() => {
                          const next = { ...form, contentType: option.value }
                          setForm(next)
                        }}
                      />
                      {option.label}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="search-form__sort-actions">
              <TagToggleButton />
              <span className={`search-form__select ${controlStyles.select}`}>
                <select
                  className={`search-form__sort ${controlStyles.selectInput}`}
                  value={form.sort}
                  onChange={(e) => handleSortChange(e.target.value)}
                  aria-label="並び順"
                >
                  {SEARCH_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className={controlStyles.chevron}
                  aria-hidden="true"
                />
              </span>
              <button
                type="button"
                className={`search-form__preset search-form__advanced-toggle ${controlStyles.withChevron}`}
                aria-expanded={advancedOpen}
                aria-controls="search-advanced"
                onClick={() => setAdvancedOpen((open) => !open)}
              >
                詳細条件
                <ChevronDown
                  size={16}
                  className={controlStyles.chevron}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <div
            ref={advancedRef}
            id="search-advanced"
            className="search-form__advanced"
            hidden={!advancedOpen || resultView !== 'video'}
          >
            <div className="search-form__section">
              <span className="search-form__section-label">投稿期間</span>
              <div className="search-form__section-controls">
                <div className="search-form__date-controls">
                  <div className="search-form__row" style={{ padding: 0 }}>
                    <input
                      type="date"
                      className="search-form__date"
                      value={form.dateFrom}
                      max={form.dateTo || undefined}
                      aria-invalid={dateRangeInvalid || undefined}
                      aria-describedby={
                        dateRangeInvalid ? 'search-date-error' : undefined
                      }
                      onChange={(e) => updateField('dateFrom', e.target.value)}
                      aria-label="投稿日時（から）"
                    />
                    〜
                    <input
                      type="date"
                      className="search-form__date"
                      value={form.dateTo}
                      min={form.dateFrom || undefined}
                      aria-invalid={dateRangeInvalid || undefined}
                      aria-describedby={
                        dateRangeInvalid ? 'search-date-error' : undefined
                      }
                      onChange={(e) => updateField('dateTo', e.target.value)}
                      aria-label="投稿日時（まで）"
                    />
                  </div>
                  <div className="search-form__presets">
                    <button
                      type="button"
                      className="search-form__preset"
                      onClick={() => applyDatePreset(2)}
                    >
                      昨日から
                    </button>
                    <button
                      type="button"
                      className="search-form__preset"
                      onClick={() => applyDatePreset(7)}
                    >
                      最近7日
                    </button>
                    <button
                      type="button"
                      className="search-form__preset"
                      onClick={() => applyDatePreset(30)}
                    >
                      最近30日
                    </button>
                    <button
                      type="button"
                      className="search-form__preset"
                      onClick={() => applyDatePreset(365)}
                    >
                      最近1年
                    </button>
                    <button
                      type="button"
                      className="search-form__preset"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          dateFrom: '',
                          dateTo: '',
                        }))
                      }
                    >
                      クリア
                    </button>
                  </div>
                </div>
                {dateRangeInvalid && (
                  <p
                    id="search-date-error"
                    className="search-form__error"
                    role="alert"
                  >
                    開始日は終了日以前の日付を指定してください。
                  </p>
                )}
              </div>
            </div>

            <div className="search-form__section">
              <span className="search-form__section-label">ジャンル</span>
              <div className="search-form__section-controls">
                <p className="search-form__hint">未選択は全ジャンル</p>
                <div className="search-form__genres">
                  {SEARCH_GENRES.map((genre) => {
                    const active = form.genres.includes(genre)
                    return (
                      <label
                        key={genre}
                        className={`search-form__genre${active ? ' search-form__genre--active' : ''}`}
                      >
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
                            setForm(next)
                          }}
                        />
                        <span className="search-form__genre-content">
                          <Check
                            className="search-form__genre-check"
                            size={16}
                            aria-hidden="true"
                          />
                          <span className="search-form__genre-label">
                            {genre}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="search-form__section">
              <span className="search-form__section-label">タグ条件</span>
              <div className="search-form__section-controls">
                <p className="search-form__hint">
                  キーワードと同時に指定可・完全一致
                </p>
                {form.tagConditions.map((condition, index) => (
                  <div key={index} className="search-form__tag-condition">
                    <span
                      className={`search-form__select ${controlStyles.select}`}
                    >
                      <select
                        className={`search-form__sort ${controlStyles.selectInput}`}
                        value={condition.operator}
                        onChange={(e) =>
                          updateField(
                            'tagConditions',
                            form.tagConditions.map((c, i) =>
                              i === index
                                ? {
                                    ...c,
                                    operator: e.target
                                      .value as SearchTagOperator,
                                  }
                                : c,
                            ),
                          )
                        }
                        aria-label={`タグ条件${index + 1}の演算子`}
                      >
                        {(
                          Object.keys(
                            TAG_OPERATOR_LABELS,
                          ) as SearchTagOperator[]
                        ).map((op) => (
                          <option key={op} value={op}>
                            {TAG_OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>
                      <ChevronDown
                        size={16}
                        className={controlStyles.chevron}
                        aria-hidden="true"
                      />
                    </span>
                    <TagAutocompleteInput
                      className="search-form__number search-form__tag-input"
                      ariaLabel={`タグ条件${index + 1}のタグ名`}
                      value={condition.tag}
                      onKeyPress={handleTagKeyPress}
                      onChange={(value) =>
                        updateField(
                          'tagConditions',
                          form.tagConditions.map((c, i) =>
                            i === index ? { ...c, tag: value } : c,
                          ),
                        )
                      }
                      placeholder="タグ名（入力で候補表示）"
                    />
                    <button
                      type="button"
                      className="search-form__preset search-form__remove-tag"
                      onClick={() =>
                        updateField(
                          'tagConditions',
                          form.tagConditions.filter((_, i) => i !== index),
                        )
                      }
                      aria-label={`タグ条件${index + 1}を削除`}
                    >
                      <X size={18} aria-hidden="true" />
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
                      <Plus size={16} aria-hidden="true" />
                      タグ条件を追加
                    </button>
                  </div>
                )}
              </div>
            </div>

            <details
              ref={detailsRef}
              className={`search-form__details ${controlStyles.disclosure}`}
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
                <ChevronDown
                  size={16}
                  className={controlStyles.disclosureIcon}
                  aria-hidden="true"
                />
                再生数・コメント数・再生時間など
                {rangeCount > 0 && (
                  <span className="search-form__details-badge">
                    {rangeCount}件指定中
                  </span>
                )}
              </summary>

              <div className="search-form__range-section">
                <span className="search-form__section-label">
                  カウンター範囲（空欄は制限なし）
                </span>
                <div className="search-form__ranges">
                  {RANGE_FIELDS.map((field) => (
                    <div key={field.name} className="search-form__range">
                      <span className="search-form__range-name">
                        {field.name}
                      </span>
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
                      step="any"
                      className="search-form__number"
                      value={form.durationMin}
                      onChange={(e) =>
                        updateField('durationMin', e.target.value)
                      }
                      placeholder="下限(分)"
                      aria-label="再生時間の下限（分）"
                    />
                    〜
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className="search-form__number"
                      value={form.durationMax}
                      onChange={(e) =>
                        updateField('durationMax', e.target.value)
                      }
                      placeholder="上限(分)"
                      aria-label="再生時間の上限（分）"
                    />
                  </div>
                </div>
              </div>
            </details>

            <div className="search-form__actions">
              {canUndo('details') ? (
                <button
                  type="button"
                  className="search-form__preset search-form__clear search-form__undo"
                  onClick={undoClear}
                >
                  <Undo2 size={16} aria-hidden="true" />
                  元に戻す
                </button>
              ) : (
                <button
                  type="button"
                  className="search-form__preset search-form__clear"
                  onClick={clearDetails}
                >
                  詳細条件をクリア
                </button>
              )}
              <button
                type="button"
                className="search-form__preset"
                onClick={handleSaveCurrent}
              >
                <Bookmark size={16} aria-hidden="true" />
                この条件を保存
              </button>
              <button
                type="submit"
                className="search-form__submit"
                disabled={isLoading}
              >
                この条件で検索
              </button>
            </div>
          </div>
        </form>

        {error && (
          <div className="search-results__status" role="alert">
            {error}
          </div>
        )}

        {!error && resultView === 'id' && (
          <div className="search-results" ref={resultsRef}>
            {lookup ? (
              <LookupResults
                data={lookup}
                visibleIds={lookupVisibleIds}
                onQuickNGAdd={handleQuickNGAdd}
                onSearchAsKeyword={showVideoResults}
                onRetry={() =>
                  void runLookup(parseVideoIdsInput(form.q) ?? lookup.ids)
                }
              />
            ) : (
              isLoading && (
                <div aria-label="動画を取得中">
                  <InitialRankingSkeleton itemCount={3} hideRank flat />
                </div>
              )
            )}
          </div>
        )}

        {!error && resultView === 'user' && (
          <div className="search-results" ref={resultsRef}>
            {userResult ? (
              <UserResults
                conditions={userResult.conditions}
                items={visibleUsers}
                totalCount={userResult.totalCount}
                onSortChange={handleUserSortChange}
                onPageChange={handleUserPageChange}
                onShowVideos={showVideoResults}
                onNG={handleUserNG}
              />
            ) : (
              isLoading && <UserResultsSkeleton />
            )}
          </div>
        )}

        {!error && resultView === 'video' && isLoading && items === null && (
          <div className="search-results" aria-label="検索中">
            <InitialRankingSkeleton itemCount={8} hideRank flat />
          </div>
        )}

        {!error && resultView === 'video' && filteredItems && (
          <div className="search-results" ref={resultsRef}>
            {notices.length > 0 && (
              <div className="search-results__notices" role="status">
                {notices.map((notice) => (
                  <p key={notice} className="search-results__notice">
                    {notice}
                  </p>
                ))}
              </div>
            )}

            {/* 上部ページネーション（ランキング画面と同じ配置） */}
            <Pagination
              className="search-results__pagination"
              showSinglePageSummary
              enableQuickNavigation
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              itemsPerPage={SEARCH_PAGE_SIZE}
              onPageChange={handlePageChangeTop}
            />

            {filteredItems.length === 0 ? (
              <div className="search-results__status">
                条件に一致する動画が見つかりませんでした。
                {resultMeta?.source !== 'merged' && (
                  <div className="search-results__hint">
                    ※
                    検索対象は検索インデックス（毎朝更新）の時点までのデータです。それ以降の新着動画は「投稿日時が新しい順」でタグのAND条件のみの検索にするとリアルタイムに含まれます。
                  </div>
                )}
              </div>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {filteredItems.map((item) => (
                  <li
                    key={item.id}
                    style={{ listStyle: 'none', padding: 0, margin: 0 }}
                  >
                    <RankingItemResponsive
                      item={item}
                      hideRank
                      flat
                      onQuickNGAdd={handleQuickNGAdd}
                    />
                  </li>
                ))}
              </ul>
            )}

            {/* 下部ページネーション（ランキングと共通の部品） */}
            <Pagination
              enableQuickNavigation
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalCount}
              itemsPerPage={SEARCH_PAGE_SIZE}
              onPageChange={handlePageChangeBottom}
            />
          </div>
        )}

        {!error && resultView === 'video' && !isLoading && items === null && (
          <div className="search-results__status">
            キーワードやタグ、詳細条件を指定して検索してください。
          </div>
        )}
      </div>
    </TagDisplayProvider>
  )
}
