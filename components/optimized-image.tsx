'use client'

import Image from 'next/image'
import { useState } from 'react'

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
  fallbackSrc?: string
  onError?: () => void
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
  onClick,
  fallbackSrc = '/cantwatch.jpg',
  onError
}: OptimizedImageProps) {
  const [imgSrc, setImgSrc] = useState(src)
  const [hasError, setHasError] = useState(false)
  
  // ローカル画像の判定
  const isLocalImage = imgSrc.startsWith('/')
  
  const handleError = () => {
    if (!hasError && fallbackSrc) {
      setImgSrc(fallbackSrc)
      setHasError(true)
    }
    onError?.()
  }
  
  if (isLocalImage) {
    // ローカル画像：Next.js最適化を使用
    return (
      <Image
        src={imgSrc}
        alt={hasError ? '視聴できません' : alt}
        width={width}
        height={height}
        fill={fill}
        sizes={sizes}
        style={style}
        loading={loading}
        priority={priority}
        className={className}
        onClick={onClick}
        onError={handleError}
      />
    )
  }
  
  // 外部画像：最適化を無効化
  return (
    <Image
      src={imgSrc}
      alt={hasError ? '視聴できません' : alt}
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
      onError={handleError}
    />
  )
}