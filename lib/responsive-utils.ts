/**
 * レスポンシブデザインのためのユーティリティ
 * CSS Media Queriesと連携して使用
 */

export const BREAKPOINTS = {
  mobile: 640,
  narrow: 375,
  veryNarrow: 320,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS

/**
 * CSS Media Query用のクラス名を生成
 */
export const responsiveClasses = {
  // モバイルのみ表示
  mobileOnly: 'mobile-only',
  // デスクトップのみ表示
  desktopOnly: 'desktop-only',
  // モバイル時のスタイル
  mobile: 'is-mobile',
  // デスクトップ時のスタイル
  desktop: 'is-desktop',
} as const

/**
 * 条件付きクラス名を生成するヘルパー
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}