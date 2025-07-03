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
  fetchPriority?: 'high' | 'low' | 'auto'
  className?: string
  onClick?: () => void
  fallbackSrc?: string
  onError?: () => void
}

/**
 * 画像最適化Imageコンポーネント
 * - ローカル画像（/で始まる）: Next.js最適化を使用（WebP/AVIF変換）
 * - 外部画像（https://で始まる）: Next.js最適化を使用（remotePatterns設定済み）
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
  fetchPriority,
  className,
  onClick,
  fallbackSrc = '/cantwatch.jpg',
  onError
}: OptimizedImageProps) {
  const [imgSrc, setImgSrc] = useState(src)
  const [hasError, setHasError] = useState(false)
  
  // 画像最適化の設定
  // Note: remotePatterns設定により外部画像も最適化可能
  
  const handleError = () => {
    if (!hasError && fallbackSrc) {
      setImgSrc(fallbackSrc)
      setHasError(true)
    }
    onError?.()
  }
  
  // すべての画像に対してNext.js最適化を使用
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
      // @ts-ignore - Next.js 14ではfetchPriorityをサポートしているが、型定義に含まれていない場合がある
      fetchPriority={fetchPriority}
      className={className}
      onClick={onClick}
      onError={handleError}
    />
  )
}