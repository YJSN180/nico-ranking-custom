// モバイル用の数値フォーマット
export function formatNumberMobile(num: number): string {
  if (num >= 10000) {
    return `${Math.floor(num / 1000) / 10}万`
  }
  return num.toLocaleString()
}

// 時間表示のフォーマット
export function formatTimeAgo(dateString?: string): string {
  if (!dateString) return ''
  
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffMinutes < 60) return `${diffMinutes}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`
  if (diffWeeks < 4) return `${diffWeeks}週間前`
  if (diffMonths < 12) return `${diffMonths}ヶ月前`
  return `${diffYears}年前`
}