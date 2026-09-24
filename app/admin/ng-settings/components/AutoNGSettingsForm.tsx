'use client'

import { useMemo, useState } from 'react'
import { validateLqngConfigInput } from '@/lib/lqng/config'
import type { LqngConfig } from '@/lib/lqng/types'
import styles from './auto-ng.module.css'

interface AutoNGSettingsFormProps {
  config: LqngConfig
  /** 保存して、保存後の設定（新しい版番号つき）を返す */
  onSave: (next: LqngConfig) => Promise<LqngConfig>
  /** 最新の設定を読めていないとき true（保存させない） */
  readOnly?: boolean
}

const linesToArray = (text: string): string[] =>
  Array.from(new Set(text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s.length > 0)))

const arrayToLines = (values: readonly string[]): string => values.join('\n')

/** グループ 1 行は「タグA｜タグB」または「タグA, タグB」で OR */
const parseGroup = (text: string): string[] =>
  Array.from(new Set(text.split(/[|｜,、]/).map((s) => s.trim()).filter((s) => s.length > 0)))

const formatGroup = (group: readonly string[]): string => group.join(' ｜ ')

interface Draft {
  enabled: boolean
  pollTags: string
  sweepGenre: string
  titleNeedles: string
  keywordNeedles: string
  tagGroups: string[]
  lockGroupsMin: number
  dayCount: number
  burstCount: number
  burstMinutes: number
  followerMax: number
  holdHours: number
  trackDays: number
  deletionWindowDays: number
}

function toDraft(config: LqngConfig): Draft {
  return {
    enabled: config.enabled,
    pollTags: arrayToLines(config.pollTags),
    sweepGenre: config.sweepGenre ?? '',
    titleNeedles: arrayToLines(config.titleNeedles),
    keywordNeedles: arrayToLines(config.keywordNeedles),
    tagGroups: config.tagGroups.length > 0 ? config.tagGroups.map(formatGroup) : ['', '', ''],
    lockGroupsMin: config.lockGroupsMin,
    dayCount: config.freq.dayCount,
    burstCount: config.freq.burstCount,
    burstMinutes: config.freq.burstMinutes,
    followerMax: config.followerMax,
    holdHours: config.holdHours,
    trackDays: config.trackDays,
    deletionWindowDays: config.deletionWindowDays,
  }
}

// 数値は丸めずに渡す。範囲外・小数は validateLqngConfigInput で理由を示して保存させない（黙って丸めない）
function fromDraft(draft: Draft, base: LqngConfig): LqngConfig {
  return {
    ...base,
    enabled: draft.enabled,
    pollTags: linesToArray(draft.pollTags),
    sweepGenre: draft.sweepGenre.trim() || null,
    titleNeedles: linesToArray(draft.titleNeedles),
    keywordNeedles: linesToArray(draft.keywordNeedles),
    tagGroups: draft.tagGroups.map(parseGroup).filter((g) => g.length > 0),
    lockGroupsMin: draft.lockGroupsMin,
    freq: {
      dayCount: draft.dayCount,
      burstCount: draft.burstCount,
      burstMinutes: draft.burstMinutes,
    },
    followerMax: draft.followerMax,
    holdHours: draft.holdHours,
    trackDays: draft.trackDays,
    deletionWindowDays: draft.deletionWindowDays,
  }
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const copyField = <K extends keyof Draft>(target: Draft, source: Draft, key: K): void => {
  target[key] = source[key]
}

/**
 * 下書きを新しい版の設定に載せ替える。土台から編集した項目だけを残し、ほかは最新の値にする
 * （他の画面で変わった項目を、編集していない古い値で上書きしない）。
 * keptChanges は、残した編集が最新の値と食い違うか（利用者に知らせる）
 */
function rebaseDraft(current: Draft, base: Draft, fresh: Draft): { draft: Draft; keptChanges: boolean } {
  const next: Draft = { ...fresh }
  let keptChanges = false
  for (const key of Object.keys(fresh) as Array<keyof Draft>) {
    if (sameValue(current[key], base[key])) continue
    copyField(next, current, key)
    if (!sameValue(current[key], fresh[key])) keptChanges = true
  }
  return { draft: next, keptChanges }
}

type FormMessage = { kind: 'saved' | 'error' | 'notice'; text: string }

const MESSAGE_CLASS: Record<FormMessage['kind'], keyof typeof styles> = {
  saved: 'saved',
  error: 'error',
  notice: 'dirty',
}

// 下書きは初回の config から作り、保存後は応答の設定で作り直す。親から新しい版の設定が届いたら
// （再読み込み・許可リストの更新）、編集中の項目を残して載せ替える。「保存しました」は props の変化では消さない
export function AutoNGSettingsForm({ config, onSave, readOnly = false }: AutoNGSettingsFormProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(config))
  /** 下書きの土台（最後に読み込んだか保存した設定）と、その版 */
  const [base, setBase] = useState<{ version: string; draft: Draft }>(() => ({ version: config.updatedAt, draft: toDraft(config) }))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<FormMessage | null>(null)

  // 新しい版の設定が届いたら、描画中にその場で載せ替える（props から state を作り直すのに useEffect を使わない、
  // React の「props の変化に合わせて state を調整する」形。版がそろえば条件が偽になり 1 度で終わる）
  if (config.updatedAt !== base.version) {
    const fresh = toDraft(config)
    const rebased = rebaseDraft(draft, base.draft, fresh)
    setDraft(rebased.draft)
    setBase({ version: config.updatedAt, draft: fresh })
    if (rebased.keptChanges) {
      setMessage({ kind: 'notice', text: '最新の設定を読み込みました。編集中だった項目はそのまま残しています。内容を確かめてから保存してください。' })
    } else if (message?.kind === 'error') {
      setMessage(null)
    }
  }

  const dirty = useMemo(() => JSON.stringify(fromDraft(draft, config)) !== JSON.stringify(config), [draft, config])

  // 画面と管理 API で同じ検証を使う（上限・下限、照合語の長さ、有効化の条件など）
  const validation = useMemo(() => validateLqngConfigInput(fromDraft(draft, config)), [draft, config])

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setMessage(null)
  }

  const updateGroup = (index: number, value: string) => {
    setDraft((prev) => ({ ...prev, tagGroups: prev.tagGroups.map((g, i) => (i === index ? value : g)) }))
    setMessage(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (readOnly || validation.length > 0) return
    setSaving(true)
    try {
      const saved = await onSave(fromDraft(draft, config))
      // 保存後の設定（新しい版番号つき）で下書きと土台を作り直す。メッセージはここで出し、props の変化では消さない
      setDraft(toDraft(saved))
      setBase({ version: saved.updatedAt, draft: toDraft(saved) })
      setMessage({ kind: 'saved', text: '保存しました。反映まで最大 3 分かかります。' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-label="自動NGの設定">
      <fieldset className={styles.fieldset}>
        <legend>動作</legend>
        <label className={styles.toggle}>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => update('enabled', e.target.checked)} />
          自動NGを有効にする（オフにすると判定テーブルの合流・リクエスト時ルール・ポーリングがすべて止まります）
        </label>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>ポーリング対象</legend>
        <p className={styles.fieldHelp}>新着検索でこれらのタグを OR で取得します（1 行 1 タグ、3 つまで）。日次スイープは指定ジャンルの前日分にタイトル照合だけを掛けます。</p>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="lqng-poll-tags">対象タグ</label>
            <textarea id="lqng-poll-tags" value={draft.pollTags} onChange={(e) => update('pollTags', e.target.value)} placeholder={'タグ1\nタグ2'} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-sweep-genre">日次スイープのジャンル（空欄で無効）</label>
            <input id="lqng-sweep-genre" type="text" value={draft.sweepGenre} onChange={(e) => update('sweepGenre', e.target.value)} placeholder="例: その他" />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>タイトルの照合</legend>
        <p className={styles.fieldHelp}>
          照合語は文字種を正規化したうえで「この順に文字が現れるか」で判定します（あ/い/う/え/お のような分断表記も一致）。
          キーワードは連続一致で、投稿頻度またはロックタグ群と同時に該当したときだけ NG にします。
        </p>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="lqng-title-needles">照合語（B、1 行 1 語）</label>
            <textarea id="lqng-title-needles" value={draft.titleNeedles} onChange={(e) => update('titleNeedles', e.target.value)} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-keyword-needles">キーワード（HK、1 行 1 語）</label>
            <textarea id="lqng-keyword-needles" value={draft.keywordNeedles} onChange={(e) => update('keywordNeedles', e.target.value)} />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>ロックタグ群（D）</legend>
        <p className={styles.fieldHelp}>1 行が 1 グループ。同じ行に「｜」区切りで複数書くとどれか 1 つがロックされていれば該当（OR）。ロック済みのグループ数が閾値以上で動画 NG になります。</p>
        <div className={styles.groupRows}>
          {draft.tagGroups.map((group, index) => (
            <div key={index} className={styles.groupRow}>
              <span className={styles.groupIndex}>{index + 1}</span>
              <input type="text" value={group} onChange={(e) => updateGroup(index, e.target.value)} placeholder="タグ名 ｜ 別名" aria-label={`ロックタグ群 ${index + 1}`} />
              <button type="button" className={styles.button} onClick={() => update('tagGroups', draft.tagGroups.filter((_, i) => i !== index))} aria-label={`ロックタグ群 ${index + 1} を削除`}>
                削除
              </button>
            </div>
          ))}
        </div>
        <div className={styles.formFooter} style={{ marginTop: 10 }}>
          <button type="button" className={styles.button} onClick={() => update('tagGroups', [...draft.tagGroups, ''])}>
            グループを追加
          </button>
          <div className={styles.field} style={{ maxWidth: 220 }}>
            <label htmlFor="lqng-lock-min">閾値（この数以上のグループがロック）</label>
            <input id="lqng-lock-min" type="number" min={1} value={draft.lockGroupsMin} onChange={(e) => update('lockGroupsMin', Number(e.target.value))} />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>投稿頻度（C）と投稿者条件</legend>
        <p className={styles.fieldHelp}>投稿頻度は単独では NG にせず、削除（A∧C）・ロックタグ群（C∧D）・キーワード（HK）と組み合わせます。フォロワー上限は D の投稿者昇格と保留の判定に使います。</p>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="lqng-day-count">24 時間に何本以上</label>
            <input id="lqng-day-count" type="number" min={1} value={draft.dayCount} onChange={(e) => update('dayCount', Number(e.target.value))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-burst-count">短時間に何本以上</label>
            <input id="lqng-burst-count" type="number" min={1} value={draft.burstCount} onChange={(e) => update('burstCount', Number(e.target.value))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-burst-minutes">短時間の幅（分）</label>
            <input id="lqng-burst-minutes" type="number" min={1} value={draft.burstMinutes} onChange={(e) => update('burstMinutes', Number(e.target.value))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-follower-max">フォロワー上限（人）</label>
            <input id="lqng-follower-max" type="number" min={0} value={draft.followerMax} onChange={(e) => update('followerMax', Number(e.target.value))} />
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>期間</legend>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label htmlFor="lqng-hold-hours">保留時間（時間）</label>
            <input id="lqng-hold-hours" type="number" min={0} value={draft.holdHours} onChange={(e) => update('holdHours', Number(e.target.value))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-track-days">投稿者の追跡日数</label>
            <input id="lqng-track-days" type="number" min={1} value={draft.trackDays} onChange={(e) => update('trackDays', Number(e.target.value))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="lqng-deletion-days">削除とみなす投稿からの日数（A∧C）</label>
            <input id="lqng-deletion-days" type="number" min={1} value={draft.deletionWindowDays} onChange={(e) => update('deletionWindowDays', Number(e.target.value))} />
          </div>
        </div>
      </fieldset>

      {validation.length > 0 && (
        <div className={styles.warning}>
          {validation.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}

      <div className={styles.formFooter}>
        <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`} disabled={readOnly || saving || !dirty || validation.length > 0}>
          {saving ? '保存中…' : '設定を保存'}
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={saving || !dirty}
          onClick={() => {
            setDraft(toDraft(config))
            setMessage(null)
          }}
        >
          変更を破棄
        </button>
        {dirty && !message && <span className={styles.dirty}>未保存の変更があります</span>}
        {message && <span className={styles[MESSAGE_CLASS[message.kind]]}>{message.text}</span>}
      </div>
    </form>
  )
}
