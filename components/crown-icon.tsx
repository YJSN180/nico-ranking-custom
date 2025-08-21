'use client'

import { memo } from 'react'

interface CrownIconProps {
  /** アイコンサイズ（px） */
  size?: number
  /** 王冠の色（1-3位で異なる色を適用） */
  rank?: 1 | 2 | 3
  /** カスタム色 */
  color?: string
  /** CSSクラス名 */
  className?: string
  /** アクセシビリティ用のラベル */
  'aria-label'?: string
}

/**
 * 王冠SVGアイコンコンポーネント
 * 1-3位の順位に応じて金、銀、銅の色を表示
 */
export const CrownIcon = memo(function CrownIcon({
  size = 16,
  rank,
  color,
  className,
  'aria-label': ariaLabel
}: CrownIconProps) {
  // ランクに基づく色の決定
  const getCrownColor = () => {
    if (color) return color
    
    switch (rank) {
      case 1:
        return 'var(--rank-gold)'
      case 2:
        return 'var(--rank-silver)'
      case 3:
        return 'var(--rank-bronze)'
      default:
        return 'var(--text-secondary)'
    }
  }

  const crownColor = getCrownColor()

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={ariaLabel || `王冠アイコン ${rank ? `${rank}位` : ''}`}
      role="img"
      style={{
        flexShrink: 0,
        display: 'inline-block',
        verticalAlign: 'middle'
      }}
    >
      {/* 王冠のメイン部分 */}
      <path
        d="M5 16L3 7l5.5 4.5L12 7l3.5 4.5L21 7l-2 9H5z"
        fill={crownColor}
        stroke={crownColor}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* 王冠の装飾（中央の宝石） */}
      <circle
        cx="12"
        cy="10"
        r="1.5"
        fill="currentColor"
        opacity="0.8"
      />
      {/* 王冠の装飾（左の宝石） */}
      <circle
        cx="8"
        cy="11"
        r="1"
        fill="currentColor"
        opacity="0.6"
      />
      {/* 王冠の装飾（右の宝石） */}
      <circle
        cx="16"
        cy="11"
        r="1"
        fill="currentColor"
        opacity="0.6"
      />
      {/* 王冠の台座 */}
      <rect
        x="5"
        y="16"
        width="14"
        height="2"
        fill={crownColor}
        rx="1"
      />
    </svg>
  )
})

export default CrownIcon