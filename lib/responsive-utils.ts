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
 * Tailwind CSS レスポンシブクラス（ハイドレーションエラー対応）
 * 旧mobile-only/desktop-onlyクラスをTailwindクラスに置換
 */
export const responsiveClasses = {
  // モバイルのみ表示（640px未満）
  mobileOnly: 'sm:hidden',
  // デスクトップのみ表示（640px以上）
  desktopOnly: 'hidden sm:block',
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