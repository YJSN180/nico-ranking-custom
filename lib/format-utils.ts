// 数値フォーマット
export function formatNumber(num: number): string {
  if (num < 0) {
    return '-' + formatNumber(-num)
  }
  
  if (num >= 100000000) { // 1億以上
    if (num >= 1000000000) { // 10億以上
      return Math.floor(num / 100000000) + '億'
    }
    const oku = Math.round(num / 10000000) / 10
    return oku % 1 === 0 ? `${Math.floor(oku)}億` : `${oku}億`
  }
  
  if (num >= 10000) { // 1万以上
    if (num >= 1000000) { // 100万以上
      return Math.floor(num / 10000) + '万'
    }
    const man = Math.round(num / 1000) / 10
    return man % 1 === 0 ? `${Math.floor(man)}万` : `${man}万`
  }
  
  return num.toLocaleString()
}

// モバイル用の数値フォーマット
export function formatNumberMobile(num: number): string {
  if (num >= 10000) {
    return `${Math.floor(num / 1000) / 10}万`
  }
  return num.toLocaleString()
}

// 時間のフォーマット（秒数から時:分:秒形式）
export function formatDuration(seconds: number): string {
  if (seconds < 0) return '0:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
  }
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

// 日付のフォーマット
export function formatDate(date: Date | string | null, includeTime = false): string {
  if (!date) return 'Invalid Date'
  
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 'Invalid Date'
  
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  
  let formatted = `${year}年${month}月${day}日`
  
  if (includeTime) {
    const hours = d.getHours().toString().padStart(2, '0')
    const minutes = d.getMinutes().toString().padStart(2, '0')
    formatted += ` ${hours}:${minutes}`
  }
  
  return formatted
}

// 時間表示のフォーマット（相対時間）
export function formatTimeAgo(date: Date | string | null): string {
  if (!date) return '0秒前'
  
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '0秒前'
  
  const now = Date.now()
  const diffMs = now - d.getTime()
  
  if (diffMs < 0) return '0秒前' // 未来の日付
  
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffSeconds < 60) return `${diffSeconds}秒前`
  if (diffMinutes < 60) return `${diffMinutes}分前`
  if (diffHours < 24) return `${diffHours}時間前`
  if (diffDays < 7) return `${diffDays}日前`
  if (diffDays < 30) return `${diffWeeks}週間前`  // 30日未満は週間で表示
  if (diffMonths < 12) return `${diffMonths}ヶ月前`
  return `${diffYears}年前`
}

// 時間表示をコンパクトにフォーマット（狭い画面用）
export function formatTimeCompact(timeAgo: string): string {
  return timeAgo
    .replace('分前', 'm')
    .replace('時間前', 'h')
    .replace('日前', 'd')
    .replace('週間前', 'w')
    .replace('ヶ月前', 'M')
    .replace('年前', 'y')
}