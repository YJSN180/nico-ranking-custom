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
 * 画像最適化Imageコンポーネント
 * - ローカル画像（/で始まる）: Next.js最適化を使用（WebP/AVIF変換）
 * - ニコニコ動画サムネイル: 直接表示（CDNアクセス制限回避）
 * - その他外部画像: Next.js最適化を使用（remotePatterns設定済み）
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
  
  // ニコニコ動画CDNのサムネイル判定（現在描画している画像ソース基準）
  const nicoDomains = ['tn.smilevideo.jp', 'nicovideo.cdn.nimg.jp', 'secure-dcdn.cdn.nimg.jp']
  const isNicoThumbnail = typeof imgSrc === 'string' && nicoDomains.some(domain => imgSrc.includes(domain))
  
  const handleError = () => {
    if (!hasError && fallbackSrc) {
      setImgSrc(fallbackSrc)
      setHasError(true)
    }
    onError?.()
  }
  
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
      unoptimized={isNicoThumbnail}
    />
  )
}
