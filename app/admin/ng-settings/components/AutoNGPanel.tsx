'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AuthorVerdict, LqngConfig, LqngRuleId, LqngVerdicts, VideoVerdict } from '@/lib/lqng/types'
import { LQNG_EVENT_KIND_LABELS, LQNG_HOLD_SIGNAL_LABELS, LQNG_RULE_LABELS } from '@/lib/lqng/labels'
import { AutoNGSettingsForm } from './AutoNGSettingsForm'
import styles from './auto-ng.module.css'

interface EventItem {
  at: string
  kind: string
  id?: string
  authorId?: string | null
  reasons?: LqngRuleId[]
  note?: string
}

interface LastRun {
  at: string
  mode: 'poll' | 'sweep'
  newVideos: number
  enriched: number
  usersChecked: number
  subrequests: number
  kvWrites: number
  note?: string
}

interface Overview {
  envEnabled: boolean
  config: LqngConfig
  verdicts: LqngVerdicts
  events: { items: EventItem[]; lastRun: LastRun | null }
  tracking: { lastPollAt: string | null; lastSweepDate: string | null; trackedAuthors: number; pendingVideos: number }
}

type Tab = 'overview' | 'authors' | 'videos' | 'holds' | 'events' | 'allowlist' | 'settings'

interface AutoNGPanelProps {
  /** 「手動NGに写す」で投稿者 ID を手動リストへ追加する */
  onCopyToManualNG: (authorId: string) => void
  /** 既に手動NGに入っている投稿者 ID（ボタンの状態表示用） */
  manualAuthorIds: readonly string[]
  /** 手動NG一覧を読み込めていないとき false（空の一覧に写して保存させない） */
  canCopyToManualNG?: boolean
}

const PAGE_SIZE = 50

const TAB_LABELS: Record<Tab, string> = {
  overview: '概要',
  authors: '投稿者NG',
  videos: '動画NG',
  holds: '保留',
  events: '履歴',
  allowlist: '許可リスト',
  settings: '設定',
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return '未実行'
  const diff = now - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return iso
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min} 分前`
  const hours = Math.round(min / 60)
  if (hours < 48) return `${hours} 時間前`
  return `${Math.round(hours / 24)} 日前`
}

function authorUrl(authorId: string): string {
  return authorId.startsWith('channel/') ? `https://ch.nicovideo.jp/${authorId.replace('channel/', '')}` : `https://www.nicovideo.jp/user/${authorId}`
}

const videoUrl = (id: string): string => `https://www.nicovideo.jp/watch/${id}`

function RuleBadges({ reasons }: { reasons: readonly LqngRuleId[] }) {
  return (
    <span className={styles.badges}>
      {reasons.map((r) => (
        <span key={r} className={`${styles.badge} ${styles.badgeRule}`} title={LQNG_RULE_LABELS[r]?.description ?? r}>
          {LQNG_RULE_LABELS[r]?.short ?? r}
        </span>
      ))}
    </span>
  )
}

function usePaged<T>(items: T[], query: string, match: (item: T, q: string) => boolean) {
  const [page, setPage] = useState(1)
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => (q ? items.filter((it) => match(it, q)) : items), [items, q, match])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  useEffect(() => setPage(1), [q])
  return { rows: filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), total: filtered.length, page: current, totalPages, setPage }
}

function Pager({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className={styles.pager}>
      <button type="button" className={styles.button} disabled={page <= 1} onClick={() => setPage(page - 1)}>
        前へ
      </button>
      <span>
        {page} / {totalPages}
      </span>
      <button type="button" className={styles.button} disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
        次へ
      </button>
    </div>
  )
}

/** 503 は KV を読めなかった（既定値を土台に保存しないよう、サーバーが書き込みを止めた） */
const KV_UNAVAILABLE_NOTE = 'KV から設定を読み取れませんでした。'

/** 409: 読み込んだあとに設定の版が進んでいた（他の画面や、同時に走った保存・許可リストの操作） */
const CONFIG_CONFLICT_MESSAGE = '他の画面で設定が更新されています。「再読み込み」で最新の設定を読み直してから、もう一度操作してください。'

export function AutoNGPanel({ onCopyToManualNG, manualAuthorIds, canCopyToManualNG = true }: AutoNGPanelProps) {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  /** 概要の読み込み失敗。表示中の内容が最新と限らないので、保存系の操作を止める */
  const [loadError, setLoadError] = useState<string | null>(null)
  /** 許可リストなど個々の操作の失敗 */
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  /** 設定を保存している最中（許可リストの操作と同時に走らせない） */
  const [savingConfig, setSavingConfig] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  /** 読み込みに成功するたびに設定フォームを作り直す（保存後の置き換えでは作り直さない） */
  const [formKey, setFormKey] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setActionError(null)
    try {
      const res = await fetch('/api/admin/lqng/overview', { credentials: 'same-origin' })
      if (!res.ok) throw new Error(`読み込みに失敗しました (${res.status})${res.status === 503 ? `。${KV_UNAVAILABLE_NOTE}` : ''}`)
      setOverview((await res.json()) as Overview)
      setFormKey((key) => key + 1)
      setNow(Date.now())
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 最新の概要を読めているときだけ保存系の操作を許す（読み込み失敗・読み込み中は止める）
  const writable = overview !== null && loadError === null && !loading

  const allowlist = overview?.config.allowlist ?? { authorIds: [], videoIds: [] }
  const allowedAuthors = useMemo(() => new Set(allowlist.authorIds), [allowlist.authorIds])
  const allowedVideos = useMemo(() => new Set(allowlist.videoIds), [allowlist.videoIds])
  const manualSet = useMemo(() => new Set(manualAuthorIds), [manualAuthorIds])
  // 読み込んだ設定の版。許可リストの操作にも付け、サーバーが現在の版と照合する
  const configVersion = overview?.config.updatedAt ?? null

  const updateAllowlist = useCallback(
    async (action: 'add' | 'remove', kind: 'author' | 'video', id: string, note?: string) => {
      setBusyId(id)
      setActionError(null)
      try {
        const res = await fetch('/api/admin/lqng/allowlist', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, kind, id, note, updatedAt: configVersion }),
        })
        if (res.status === 409) throw new Error(CONFIG_CONFLICT_MESSAGE)
        if (res.status === 400) throw new Error('許可リストの更新に失敗しました (400)。ID の形式を確認してください（投稿者: 数字か channel/ch＋数字、動画: sm・so・nm・ss＋数字）。')
        if (!res.ok) throw new Error(`許可リストの更新に失敗しました (${res.status})${res.status === 503 ? `。${KV_UNAVAILABLE_NOTE}変更は保存していません。` : ''}`)
        const body = (await res.json()) as { config: LqngConfig }
        // 許可リストだけを差し込まず、保存後の設定全体（版番号を含む）で置き換える
        setOverview((prev) => (prev ? { ...prev, config: body.config } : prev))
      } catch (e) {
        setActionError(e instanceof Error ? e.message : '許可リストの更新に失敗しました')
      } finally {
        setBusyId(null)
      }
    },
    [configVersion]
  )

  const saveConfig = useCallback(async (next: LqngConfig): Promise<LqngConfig> => {
    setSavingConfig(true)
    try {
      const res = await fetch('/api/admin/lqng/config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        // updatedAt は読み込んだ版番号（サーバーが現在の版と照合する）。許可リストは差分 API だけで変えるので送らない
        body: JSON.stringify({ ...next, allowlist: undefined }),
      })
      if (res.status === 409) throw new Error(CONFIG_CONFLICT_MESSAGE)
      if (res.status === 400) {
        const body = (await res.json().catch(() => null)) as { problems?: unknown } | null
        const problems = Array.isArray(body?.problems) ? body.problems.filter((p): p is string => typeof p === 'string') : []
        throw new Error(`設定を保存できませんでした (400)${problems.length > 0 ? `: ${problems.join(' / ')}` : ''}`)
      }
      if (!res.ok) throw new Error(`設定の保存に失敗しました (${res.status})${res.status === 503 ? `。${KV_UNAVAILABLE_NOTE}変更は保存していません。` : ''}`)
      const body = (await res.json()) as { config: LqngConfig }
      setOverview((prev) => (prev ? { ...prev, config: body.config } : prev))
      return body.config
    } finally {
      setSavingConfig(false)
    }
  }, [])

  const authors = useMemo(
    () => (overview ? Object.entries(overview.verdicts.authors).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.since.localeCompare(a.since)) : []),
    [overview]
  )
  const videos = useMemo(
    () => (overview ? Object.entries(overview.verdicts.videos).map(([id, v]) => ({ id, ...v })) : []),
    [overview]
  )
  const ngVideos = useMemo(() => videos.filter((v) => v.status === 'ng').sort((a, b) => b.since.localeCompare(a.since)), [videos])
  const holds = useMemo(() => videos.filter((v) => v.status === 'hold').sort((a, b) => (b.holdUntil ?? '').localeCompare(a.holdUntil ?? '')), [videos])

  const matchAuthor = useCallback((a: { id: string } & AuthorVerdict, q: string) => a.id.includes(q) || (a.nickname ?? '').toLowerCase().includes(q) || a.evidence.some((e) => e.title.toLowerCase().includes(q)), [])
  const matchVideo = useCallback((v: { id: string } & VideoVerdict, q: string) => v.id.includes(q) || (v.authorId ?? '').includes(q) || v.title.toLowerCase().includes(q), [])

  const authorsPaged = usePaged(authors, query, matchAuthor)
  const ngVideosPaged = usePaged(ngVideos, query, matchVideo)
  const holdsPaged = usePaged(holds, query, matchVideo)

  const effectiveEnabled = Boolean(overview?.envEnabled && overview?.config.enabled)
  // 許可リストの操作は 1 件ずつ（応答の設定全体で置き換えるため、操作中は他の行も止める）。
  // 設定の保存中も止める（同じ版から同時に書くと、あとの方が 409 になるか片方の変更が消える）
  const allowlistDisabled = !writable || busyId !== null || savingConfig

  return (
    <section className={styles.panel} aria-labelledby="auto-ng-title">
      <div className={styles.header}>
        <div>
          <h2 id="auto-ng-title" className={styles.title}>
            自動NG（粗悪コンテンツ）
          </h2>
          <p className={styles.subtitle}>ポーリング Worker が新着を判定し、投稿者 ID・動画 ID を自動で NG に登録します。手動NGが最優先、次に許可リスト、その後に自動NGが適用されます。</p>
        </div>
        <div className={styles.headerActions}>
          {overview && (
            <span className={`${styles.status} ${effectiveEnabled ? styles.statusOn : styles.statusOff}`}>
              {effectiveEnabled ? '● 稼働中' : overview.envEnabled ? '○ 設定で無効' : '○ 環境変数で無効'}
            </span>
          )}
          <button type="button" className={styles.button} onClick={() => void load()} disabled={loading}>
            {loading ? '更新中…' : '再読み込み'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className={styles.error} role="alert">
          {loadError}
          {overview && <div>表示中の内容は最新とは限らないため、最新の設定を読み込めるまで保存と許可リストの操作を止めています。「再読み込み」で読み直してください。</div>}
        </div>
      )}
      {actionError && (
        <div className={styles.error} role="alert">
          {actionError}
        </div>
      )}

      <div className={styles.tabs} role="tablist" aria-label="自動NGの表示切り替え">
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => {
          const count = key === 'authors' ? authors.length : key === 'videos' ? ngVideos.length : key === 'holds' ? holds.length : key === 'allowlist' ? allowlist.authorIds.length + allowlist.videoIds.length : null
          return (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`} onClick={() => setTab(key)}>
              {TAB_LABELS[key]}
              {count !== null && <span className={styles.tabCount}>{count}</span>}
            </button>
          )
        })}
      </div>

      {!overview && loading && <div className={styles.empty}>読み込み中…</div>}

      {overview && tab === 'overview' && (
        <div>
          <div className={styles.cards}>
            <div className={styles.card}>
              <div className={styles.cardLabel}>最終ポーリング</div>
              <div className={styles.cardValue}>{formatRelative(overview.tracking.lastPollAt, now)}</div>
              <div className={styles.cardSub}>{formatDateTime(overview.tracking.lastPollAt)}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>投稿者 NG</div>
              <div className={styles.cardValue}>{authors.length}</div>
              <div className={styles.cardSub}>恒久・許可リストで解除可</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>動画 NG</div>
              <div className={styles.cardValue}>{ngVideos.length}</div>
              <div className={styles.cardSub}>保留 {holds.length} 件</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>追跡中の投稿者</div>
              <div className={styles.cardValue}>{overview.tracking.trackedAuthors}</div>
              <div className={styles.cardSub}>補完待ち {overview.tracking.pendingVideos} 本</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>日次スイープ</div>
              <div className={styles.cardValue}>{overview.tracking.lastSweepDate ?? '—'}</div>
              <div className={styles.cardSub}>{overview.config.sweepGenre ? `ジャンル: ${overview.config.sweepGenre}` : '無効'}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardLabel}>許可リスト</div>
              <div className={styles.cardValue}>{allowlist.authorIds.length + allowlist.videoIds.length}</div>
              <div className={styles.cardSub}>投稿者 {allowlist.authorIds.length}・動画 {allowlist.videoIds.length}</div>
            </div>
          </div>
          {overview.events.lastRun && (
            <p className={styles.note}>
              直近の実行（{overview.events.lastRun.mode === 'sweep' ? 'スイープ' : 'ポーリング'}、{formatDateTime(overview.events.lastRun.at)}）: 新着 {overview.events.lastRun.newVideos} 本、補完 {overview.events.lastRun.enriched} 本、投稿者確認 {overview.events.lastRun.usersChecked} 人、外部呼び出し {overview.events.lastRun.subrequests} 回、KV 書き込み {overview.events.lastRun.kvWrites} 回
              {overview.events.lastRun.note ? `（注意: ${overview.events.lastRun.note}）` : ''}
            </p>
          )}
          {!effectiveEnabled && <p className={styles.warning}>現在は無効です。{overview.envEnabled ? '「設定」タブで有効にしてください。' : 'Vercel の環境変数 LQNG_ENABLED が false になっています。'}</p>}
          <p className={styles.note}>NG や許可リストの変更が検索・ランキングに反映されるまで、CDN キャッシュの都合で最大 3 分かかります。</p>
          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>最近のイベント</h3>
          <EventList items={overview.events.items.slice(0, 15)} />
        </div>
      )}

      {overview && (tab === 'authors' || tab === 'videos' || tab === 'holds') && (
        <div className={styles.toolbar}>
          <input type="search" className={styles.search} placeholder="ID・名前・タイトルで絞り込み" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="絞り込み" />
          <span className={styles.mono}>
            {tab === 'authors' ? authorsPaged.total : tab === 'videos' ? ngVideosPaged.total : holdsPaged.total} 件
          </span>
        </div>
      )}

      {overview && tab === 'authors' && (
        <div>
          {authorsPaged.total === 0 ? (
            <div className={styles.empty}>投稿者 NG はありません</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>投稿者</th>
                    <th>状態</th>
                    <th>理由</th>
                    <th>根拠</th>
                    <th>登録</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {authorsPaged.rows.map((a) => {
                    const allowed = allowedAuthors.has(a.id)
                    const inManual = manualSet.has(a.id)
                    return (
                      <tr key={a.id}>
                        <td>
                          <a className={styles.idLink} href={authorUrl(a.id)} target="_blank" rel="noopener noreferrer">
                            {a.nickname ?? '(名前不明)'}
                          </a>
                          <div className={styles.mono}>{a.id}</div>
                        </td>
                        <td>
                          <span className={styles.badges}>
                            {a.deletedObservedAt ? <span className={`${styles.badge} ${styles.badgeRule}`}>削除済み</span> : <span className={`${styles.badge} ${styles.badgeNeutral}`}>現存</span>}
                            {a.visibility === 'hidden' && <span className={`${styles.badge} ${styles.badgeHold}`}>非公開</span>}
                            {typeof a.followerCount === 'number' && <span className={`${styles.badge} ${styles.badgeNeutral}`}>F {a.followerCount}</span>}
                            {allowed && <span className={`${styles.badge} ${styles.badgeGood}`}>許可リスト</span>}
                            {inManual && <span className={`${styles.badge} ${styles.badgeNeutral}`}>手動NG</span>}
                          </span>
                        </td>
                        <td>
                          <RuleBadges reasons={a.reasons} />
                        </td>
                        <td>
                          <ul className={styles.evidence}>
                            {a.evidence.slice(0, 3).map((e) => (
                              <li key={e.videoId} title={e.title}>
                                <a href={videoUrl(e.videoId)} target="_blank" rel="noopener noreferrer">
                                  {e.title}
                                </a>
                              </li>
                            ))}
                            {a.evidence.length > 3 && <li>ほか {a.evidence.length - 3} 本</li>}
                          </ul>
                        </td>
                        <td className={styles.mono}>{formatDateTime(a.since)}</td>
                        <td>
                          <div className={styles.actions}>
                            {allowed ? (
                              <button type="button" className={styles.button} disabled={allowlistDisabled} onClick={() => void updateAllowlist('remove', 'author', a.id)}>
                                許可を解除
                              </button>
                            ) : (
                              <button type="button" className={`${styles.button} ${styles.buttonDanger}`} disabled={allowlistDisabled} onClick={() => void updateAllowlist('add', 'author', a.id, '管理画面で解除')}>
                                許可リストへ
                              </button>
                            )}
                            <button type="button" className={styles.button} disabled={inManual || !canCopyToManualNG} onClick={() => onCopyToManualNG(a.id)}>
                              {inManual ? '手動NG済み' : '手動NGに写す'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={authorsPaged.page} totalPages={authorsPaged.totalPages} setPage={authorsPaged.setPage} />
        </div>
      )}

      {overview && (tab === 'videos' || tab === 'holds') && (
        <div>
          {(tab === 'videos' ? ngVideosPaged : holdsPaged).total === 0 ? (
            <div className={styles.empty}>{tab === 'videos' ? '動画 NG はありません' : '保留中の動画はありません'}</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>動画</th>
                    <th>投稿者</th>
                    <th>{tab === 'videos' ? '理由' : '保留の理由'}</th>
                    <th>{tab === 'videos' ? '登録' : '期限'}</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'videos' ? ngVideosPaged : holdsPaged).rows.map((v) => {
                    const allowed = allowedVideos.has(v.id)
                    return (
                      <tr key={v.id}>
                        <td>
                          <a className={styles.idLink} href={videoUrl(v.id)} target="_blank" rel="noopener noreferrer">
                            {v.title}
                          </a>
                          <div className={styles.mono}>
                            {v.id} ／ 投稿 {formatDateTime(v.registeredAt)}
                          </div>
                        </td>
                        <td>
                          {v.authorId ? (
                            <a className={styles.idLink} href={authorUrl(v.authorId)} target="_blank" rel="noopener noreferrer">
                              {v.authorId}
                            </a>
                          ) : (
                            '—'
                          )}
                          {v.authorId && overview.verdicts.authors[v.authorId] && <div className={styles.mono}>投稿者 NG</div>}
                        </td>
                        <td>
                          {tab === 'videos' ? (
                            <RuleBadges reasons={v.reasons} />
                          ) : (
                            <span className={styles.badges}>
                              {(v.holdSignals ?? []).map((s) => (
                                <span key={s} className={`${styles.badge} ${styles.badgeHold}`}>
                                  {LQNG_HOLD_SIGNAL_LABELS[s]}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                        <td className={styles.mono}>{formatDateTime(tab === 'videos' ? v.since : v.holdUntil)}</td>
                        <td>
                          <div className={styles.actions}>
                            {allowed ? (
                              <button type="button" className={styles.button} disabled={allowlistDisabled} onClick={() => void updateAllowlist('remove', 'video', v.id)}>
                                許可を解除
                              </button>
                            ) : (
                              <button type="button" className={`${styles.button} ${styles.buttonDanger}`} disabled={allowlistDisabled} onClick={() => void updateAllowlist('add', 'video', v.id, '管理画面で解除')}>
                                許可リストへ
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager {...(tab === 'videos' ? ngVideosPaged : holdsPaged)} />
        </div>
      )}

      {overview && tab === 'events' && <EventList items={overview.events.items} />}

      {overview && tab === 'allowlist' && <AllowlistEditor allowlist={allowlist} busyId={busyId} disabled={!writable || savingConfig} onChange={updateAllowlist} />}

      {overview && tab === 'settings' && <AutoNGSettingsForm key={formKey} config={overview.config} onSave={saveConfig} readOnly={!writable || busyId !== null} />}
    </section>
  )
}

function EventList({ items }: { items: EventItem[] }) {
  if (items.length === 0) return <div className={styles.empty}>イベントはまだありません</div>
  return (
    <ul className={styles.events}>
      {items.map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <span className={styles.eventTime}>{formatDateTime(e.at)}</span>
          <span>{LQNG_EVENT_KIND_LABELS[e.kind] ?? e.kind}</span>
          <span>
            {e.authorId && (
              <a className={styles.idLink} href={authorUrl(e.authorId)} target="_blank" rel="noopener noreferrer">
                {e.authorId}
              </a>
            )}
            {e.authorId && e.id ? ' ／ ' : ''}
            {e.id && (
              <a className={styles.idLink} href={videoUrl(e.id)} target="_blank" rel="noopener noreferrer">
                {e.id}
              </a>
            )}
            {e.reasons && e.reasons.length > 0 && (
              <>
                {' '}
                <RuleBadges reasons={e.reasons} />
              </>
            )}
            {e.note && <span className={styles.mono}> {e.note}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function AllowlistEditor({
  allowlist,
  busyId,
  disabled,
  onChange,
}: {
  allowlist: LqngConfig['allowlist']
  busyId: string | null
  /** 最新の設定を読めていないときは追加・削除を止める */
  disabled: boolean
  onChange: (action: 'add' | 'remove', kind: 'author' | 'video', id: string, note?: string) => Promise<void>
}) {
  const [kind, setKind] = useState<'author' | 'video'>('author')
  const [id, setId] = useState('')
  const [note, setNote] = useState('')
  const submit = async () => {
    const trimmed = id.trim()
    if (!trimmed) return
    await onChange('add', kind, trimmed, note.trim() || undefined)
    setId('')
    setNote('')
  }
  const notes = allowlist.notes ?? {}
  const list = (ids: readonly string[], k: 'author' | 'video') =>
    ids.length === 0 ? (
      <div className={styles.empty}>登録なし</div>
    ) : (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ID</th>
              <th>メモ</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((x) => (
              <tr key={x}>
                <td>
                  <a className={styles.idLink} href={k === 'author' ? authorUrl(x) : videoUrl(x)} target="_blank" rel="noopener noreferrer">
                    {x}
                  </a>
                </td>
                <td>{notes[x] ?? ''}</td>
                <td>
                  <button type="button" className={`${styles.button} ${styles.buttonDanger}`} disabled={disabled || busyId !== null} onClick={() => void onChange('remove', k, x)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  return (
    <div>
      <p className={styles.note}>許可リストの投稿者・動画は自動NGの対象から外れ、ポーリングで再登録もされません。手動NGには影響しません（手動NGが常に優先）。</p>
      <div className={styles.addRow}>
        <select value={kind} onChange={(e) => setKind(e.target.value as 'author' | 'video')} aria-label="種別">
          <option value="author">投稿者 ID</option>
          <option value="video">動画 ID</option>
        </select>
        <input type="text" value={id} onChange={(e) => setId(e.target.value)} placeholder={kind === 'author' ? '例: 12345678 または channel/ch1234' : '例: sm12345'} aria-label="ID" onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="メモ（任意）" aria-label="メモ" onKeyDown={(e) => e.key === 'Enter' && void submit()} />
        <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} disabled={disabled || !id.trim() || busyId !== null} onClick={() => void submit()}>
          追加
        </button>
      </div>
      <div className={styles.allowGrid}>
        <div>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>投稿者（{allowlist.authorIds.length}）</h3>
          {list(allowlist.authorIds, 'author')}
        </div>
        <div>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>動画（{allowlist.videoIds.length}）</h3>
          {list(allowlist.videoIds, 'video')}
        </div>
      </div>
    </div>
  )
}
