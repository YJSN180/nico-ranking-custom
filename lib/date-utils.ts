// 日付フォーマット用ユーティリティ

/**
 * 投稿日時を相対表示または絶対表示でフォーマット
 * @param registeredAt - ISO 8601形式の日時文字列
 * @param currentTime - 現在時刻（オプション、主にテスト用）
 * @returns フォーマットされた日時文字列
 */
export function formatRegisteredDate(registeredAt: string | undefined, currentTime?: Date): string {
  if (!registeredAt) return '未設定'
  
  const date = new Date(registeredAt)
  
  // SSR/CSRで一貫性を保つため、日付のみの絶対表示を使用
  // 相対時間表示（〜分前、〜時間前）はハイドレーションエラーの原因となるため避ける
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  
  // 現在時刻が提供されていない場合は絶対表示のみを返す（SSR安全）
  if (!currentTime) {
    return `${year}/${month}/${day}`
  }
  
  // クライアントサイドでのみ相対時間を計算（オプショナル）
  const diffMs = currentTime.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  
  // 24時間以内の場合でも、SSRでは絶対表示を使用
  if (diffHours < 24 && typeof window !== 'undefined') {
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      if (diffMinutes === 0) {
        return '今'
      }
      return `${diffMinutes}分前`
    }
    return `${diffHours}時間前`
  }
  
  return `${year}/${month}/${day}`
}

/**
 * 24時間以内かどうかを判定
 */
export function isWithin24Hours(registeredAt: string | undefined): boolean {
  if (!registeredAt) return false
  
  const date = new Date(registeredAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  
  return diffHours < 24
}