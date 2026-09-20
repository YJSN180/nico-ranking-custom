// 粗悪コンテンツ自動NG（lqng = low-quality NG）の型定義
// 判定ロジックは lib/lqng/ に閉じた純粋関数で、Next.js（検索・SSR・パイプライン）と
// Cloudflare Worker（workers/lqng-poller）の両方から使う。ここには外部 I/O を置かない。
// 方針: 特定のユーザー ID や名前を含む設定はソースに書かず、KV の設定（LqngConfig）に置く。
import type { TagDetail } from '../../types/ranking'

/** 適用したルールの識別子 */
export type LqngRuleId =
  /** 投稿から一定日数以内にアカウント削除 ∧ 投稿頻度該当（投稿者 NG） */
  | 'A_C'
  /** タイトルが照合語（順序付き部分列一致）に該当 */
  | 'B'
  /** ロックタグ群のうち閾値以上がロック済み */
  | 'D'
  /** 投稿頻度該当 ∧ ロックタグ群該当 */
  | 'C_D'
  /** キーワード（部分一致）∧（投稿頻度 または ロックタグ群） */
  | 'HK'

export interface LqngFrequencyConfig {
  /** 24 時間以内にこの本数以上 */
  dayCount: number
  /** burstMinutes 以内にこの本数以上 */
  burstCount: number
  burstMinutes: number
}

export interface LqngAllowlist {
  authorIds: string[]
  videoIds: string[]
  /** ID → メモ（管理画面の表示用。判定には使わない） */
  notes?: Record<string, string>
}

export interface LqngConfig {
  version: 1
  /** false なら合流もリクエスト時ルールも行わない（環境変数 LQNG_ENABLED とは独立） */
  enabled: boolean
  /** ポーリングで新着を取るタグ（nvapi の tag パラメータで OR 結合） */
  pollTags: string[]
  /** 日次スイープで前日分を取る Snapshot のジャンル名（null で無効） */
  sweepGenre: string | null
  /** タイトルの照合語。正規化後に順序付き部分列一致（挿入文字の数・種類は問わない） */
  titleNeedles: string[]
  /** タイトルのキーワード。正規化後の部分一致。C または D と AND で使う（HK） */
  keywordNeedles: string[]
  /** ロックタグ群。外側は AND で数え、内側（各グループ）は OR */
  tagGroups: string[][]
  /** ロック済みグループがこの数以上で D 該当 */
  lockGroupsMin: number
  freq: LqngFrequencyConfig
  /** D の投稿者昇格（現存投稿者）と保留信号に使うフォロワー上限 */
  followerMax: number
  /** 保留の期間（時間） */
  holdHours: number
  /** 投稿者を追跡する日数 */
  trackDays: number
  /** A∧C: 投稿からこの日数以内の削除を「投稿直後の削除」とみなす */
  deletionWindowDays: number
  allowlist: LqngAllowlist
  updatedAt: string
}

/** 設定の既定値。ID・名前・タグ名は含めない（管理画面から投入する） */
export const DEFAULT_LQNG_CONFIG: LqngConfig = {
  version: 1,
  enabled: false,
  pollTags: [],
  sweepGenre: null,
  titleNeedles: [],
  keywordNeedles: [],
  tagGroups: [],
  lockGroupsMin: 3,
  freq: { dayCount: 5, burstCount: 3, burstMinutes: 30 },
  followerMax: 10,
  holdHours: 6,
  trackDays: 7,
  deletionWindowDays: 7,
  allowlist: { authorIds: [], videoIds: [] },
  updatedAt: '1970-01-01T00:00:00.000Z',
}

export type OwnerVisibility = 'visible' | 'hidden'

/** 判定に渡す動画 1 件の観測値（取得元は問わない） */
export interface VideoObservation {
  id: string
  title: string
  /** ユーザー ID（数字文字列）または channel/chNNN。不明なら null */
  authorId: string | null
  /** ISO 8601 */
  registeredAt: string
  /** ロック状態付きタグ。未取得なら null（D は判定しない） */
  tagDetails?: TagDetail[] | null
  /** 投稿者の可視性（nvapi / getthumbinfo で投稿者が空なら hidden） */
  ownerVisibility?: OwnerVisibility | null
}

export type AuthorStatus = 'existing' | 'deleted' | 'unknown'

/** 判定に渡す投稿者の観測値（ポーリングの追跡情報から組み立てる） */
export interface AuthorObservation {
  authorId: string
  status: AuthorStatus
  followerCount?: number | null
  visibility?: OwnerVisibility | null
  /** 追跡期間内に観測した投稿時刻（ISO 8601）。評価対象の動画自身も含めてよい */
  postTimes: string[]
  /** 404 を初めて観測した時刻（ISO 8601）。削除済みでなければ null */
  deletedObservedAt?: string | null
}

export type HoldSignal = 'hidden_owner' | 'low_followers'

export interface VideoEvaluation {
  /** 動画 ID を NG にするか */
  ng: boolean
  reasons: LqngRuleId[]
  /** 投稿者 ID に昇格するか */
  escalate: boolean
  escalateReasons: LqngRuleId[]
  /** 参考値 */
  lockedGroups: number
  frequent: boolean
}

export interface HoldDecision {
  hold: boolean
  signals: HoldSignal[]
  /** 保留の期限（ISO 8601）。hold=false なら null */
  until: string | null
}

export interface DeletionEvaluation {
  ng: boolean
  reason: 'A_C' | null
}

export interface LqngEvidence {
  videoId: string
  title: string
  registeredAt: string
  rules: LqngRuleId[]
}

export interface AuthorVerdict {
  status: 'ng'
  reasons: LqngRuleId[]
  since: string
  evidence: LqngEvidence[]
  nickname?: string | null
  followerCount?: number | null
  visibility?: OwnerVisibility | null
  deletedObservedAt?: string | null
}

export type VideoVerdictStatus = 'ng' | 'hold' | 'released'

export interface VideoVerdict {
  status: VideoVerdictStatus
  reasons: LqngRuleId[]
  /** 保留の信号（status=hold のとき） */
  holdSignals?: HoldSignal[]
  authorId: string | null
  title: string
  registeredAt: string
  since: string
  /** status=hold のときの期限 */
  holdUntil?: string | null
}

/** Worker が書き、Next.js が読む判定テーブル */
export interface LqngVerdicts {
  version: 1
  authors: Record<string, AuthorVerdict>
  videos: Record<string, VideoVerdict>
  updatedAt: string
}

export const EMPTY_LQNG_VERDICTS: LqngVerdicts = {
  version: 1,
  authors: {},
  videos: {},
  updatedAt: '1970-01-01T00:00:00.000Z',
}

/** 合流後に NG リストへ渡す自動 NG（許可リスト適用済み） */
export interface AutoNgSets {
  authorIds: string[]
  videoIds: string[]
}
