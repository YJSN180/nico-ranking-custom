import React from 'react'

export interface TagIconProps {
  type: 'locked' | 'user' | 'both'
  size?: number
  className?: string
  color?: string
}

/**
 * 統一されたタグアイコンコンポーネント
 * ランキングページとNG設定画面で一貫したアイコンを表示
 */
export const TagIcon: React.FC<TagIconProps> = ({ 
  type, 
  size = 14, 
  className = '',
  color
}) => {
  // デフォルトカラー設定
  const defaultColors = {
    locked: '#FFD700', // 金色
    user: '#C0C0C0',   // 銀色
    both: '#9370DB'    // 紫色（ロックとユーザーの中間色）
  }

  const fillColor = color || defaultColors[type]

  switch (type) {
    case 'locked':
      // 鍵アイコン（ロックされたタグ）
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill={fillColor}
          className={className}
          aria-label="ロックタグ"
        >
          <path d="M8 1.5A2.5 2.5 0 0 0 5.5 4v2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2.5V4A2.5 2.5 0 0 0 8 1.5zM6.5 4a1.5 1.5 0 0 1 3 0v2h-3V4zm2.5 6.5v2a1 1 0 1 1-2 0v-2a1 1 0 1 1 2 0z"/>
        </svg>
      )
    
    case 'user':
      // タグアイコン（ユーザータグ）
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill={fillColor}
          className={className}
          aria-label="ユーザータグ"
        >
          <path d="M2 2v4.586l7 7L13.586 9l-7-7H2zM1 2a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 1 6.586V2z"/>
          <circle cx="4.5" cy="4.5" r="1.5"/>
        </svg>
      )
    
    case 'both':
      // 並列アイコン（ロックタグとユーザータグを並べて表示）
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 20 16"
          className={className}
          aria-label="両方のタグ"
        >
          {/* 左側：ロックアイコン（金色） */}
          <g transform="scale(0.7) translate(0, 1)" fill="#FFD700">
            <path d="M8 1.5A2.5 2.5 0 0 0 5.5 4v2H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2.5V4A2.5 2.5 0 0 0 8 1.5zM6.5 4a1.5 1.5 0 0 1 3 0v2h-3V4zm2.5 6.5v2a1 1 0 1 1-2 0v-2a1 1 0 1 1 2 0z"/>
          </g>
          {/* 右側：ユーザータグアイコン（銀色） */}
          <g transform="scale(0.7) translate(12, 1)" fill="#C0C0C0">
            <path d="M2 2v4.586l7 7L13.586 9l-7-7H2zM1 2a1 1 0 0 1 1-1h4.586a1 1 0 0 1 .707.293l7 7a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0l-7-7A1 1 0 0 1 1 6.586V2z"/>
            <circle cx="4.5" cy="4.5" r="1.5"/>
          </g>
        </svg>
      )
  }
}

// タグタイプのラベルを取得するヘルパー関数
export const getTagTypeLabel = (type: 'locked' | 'user' | 'both'): string => {
  switch (type) {
    case 'locked':
      return 'ロックタグ'
    case 'user':
      return 'ユーザータグ'
    case 'both':
      return '両方'
    default:
      return ''
  }
}

// タグタイプの説明を取得するヘルパー関数
export const getTagTypeDescription = (type: 'locked' | 'user' | 'both'): string => {
  switch (type) {
    case 'locked':
      return '公式に設定された固定タグ'
    case 'user':
      return 'ユーザーが追加したタグ'
    case 'both':
      return 'ロックタグとユーザータグの両方'
    default:
      return ''
  }
}