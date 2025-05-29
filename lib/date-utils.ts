// 日付フォーマット用ユーティリティ

/**
 * 投稿日時を相対表示または絶対表示でフォーマット
 * @param registeredAt - ISO 8601形式の日時文字列
 * @returns フォーマットされた日時文字列
 */
export function formatRegisteredDate(registeredAt: string | undefined): string {
  if (!registeredAt) return ''
  
  const date = new Date(registeredAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  
  // 24時間以内の場合は相対表示
  if (diffHours < 24) {
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      if (diffMinutes === 0) {
        return '今'
      }
      return `${diffMinutes}分前`
    }
    return `${diffHours}時間前`
  }
  
  // 24時間以上の場合は絶対表示（YYYY/M/D形式）
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  
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