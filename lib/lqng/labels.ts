// 管理画面向けの表示ラベル（クライアントから import しても安全な定数のみ）
import type { HoldSignal, LqngRuleId } from './types'

export const LQNG_RULE_LABELS: Record<LqngRuleId, { short: string; description: string }> = {
  A_C: { short: 'A∧C 削除', description: '投稿から 7 日以内にアカウントが削除され、かつ投稿頻度に該当' },
  B: { short: 'B タイトル', description: 'タイトルが照合語に一致（分断表記を含む）' },
  D: { short: 'D ロックタグ群', description: '指定タグ群のうち閾値以上がロック済み' },
  C_D: { short: 'C∧D 頻度＋ロック', description: '投稿頻度に該当し、かつロックタグ群にも該当' },
  HK: { short: 'HK キーワード', description: 'キーワードを含み、かつ投稿頻度またはロックタグ群に該当' },
}

export const LQNG_HOLD_SIGNAL_LABELS: Record<HoldSignal, string> = {
  hidden_owner: '投稿者が非公開',
  low_followers: 'フォロワーが少ない',
}

export const LQNG_EVENT_KIND_LABELS: Record<string, string> = {
  poll: 'ポーリング実行',
  sweep: '日次スイープ',
  author_ng: '投稿者を NG',
  video_ng: '動画を NG',
  hold: '保留',
  released: '解放',
  author_deleted: '投稿者の削除を観測',
  author_restored: '退会扱いの投稿者の存在を再確認（投稿者 NG は維持）',
  deletion_held: '404 が多すぎるため退会判定を保留',
  access_limited: 'アクセス制限を検知',
  backfill: 'バックフィル（過去分の取り込み）',
  error: 'エラー',
}

/** 自動NG が有効なのに退会確認の対照（controlUserId）が未設定のときの警告（設定フォームと概要で共用） */
export const LQNG_CONTROL_MISSING_WARNING = '対照の投稿者 ID が未設定です。追跡中の投稿者から対照を選べないと、退会を確定できません。'
