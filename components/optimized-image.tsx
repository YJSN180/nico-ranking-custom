'use client'

import Image from 'next/image'

interface OptimizedImageProps {
  src: string
  alt: string
  width?: number
  height?: number
  fill?: boolean
  sizes?: string
  style?: React.CSSProperties
  loading?: 'lazy' | 'eager'
  priority?: boolean
  className?: string
  onClick?: () => void
}

/**
 * 画像最適化の有無を自動判定するImageコンポーネント
 * - ローカル画像（/で始まる）: Next.js最適化を使用（WebP/AVIF変換）
 * - 外部画像（https://で始まる）: 最適化を無効化（CORS対応）
 */
export function OptimizedImage({
  src,
  alt,
  width,
  height,
  fill,
  sizes,
  style,
  loading,
  priority,
  className,
  onClick
}: OptimizedImageProps) {
  // ローカル画像の判定
  const isLocalImage = src.startsWith('/')
  
  if (isLocalImage) {
    // ローカル画像：Next.js最適化を使用
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        fill={fill}
        sizes={sizes}
        style={style}
        loading={loading}
        priority={priority}
        className={className}
        onClick={onClick}
      />
    )
  }
  
  // 外部画像：最適化を無効化
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      fill={fill}
      sizes={sizes}
      style={style}
      loading={loading}
      priority={priority}
      className={className}
      onClick={onClick}
      unoptimized
    />
  )
}