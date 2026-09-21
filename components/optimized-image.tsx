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

// ニコニコ系 CDN（*.nimg.jp / *.smilevideo.jp）はアクセス制限があるため最適化を通さず直接表示する。
// ホストを列挙していた頃、ユーザーアイコンの配信元が img.nicoprofile.nimg.jp に変わり、
// remotePatterns に無いホストとして /_next/image が 400 を返し、フォールバック画像（黒）が
// 出る回帰があった（2026-09-21）。以後はドメイン単位で判定する
const NICO_CDN_IMAGE = /^https?:\/\/([a-z0-9-]+\.)*(nimg\.jp|smilevideo\.jp)(\/|$)/i

export function isNicoCdnImage(src: string | undefined | null): boolean {
  return typeof src === 'string' && NICO_CDN_IMAGE.test(src)
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
  
  // ニコニコ系 CDN の画像判定（サムネイル・投稿者アイコン）
  const isNicoThumbnail = isNicoCdnImage(src)
  
  const handleError = () => {
    if (!hasError && fallbackSrc) {
      setImgSrc(fallbackSrc)
      setHasError(true)
    }
    onError?.()
  }
  
  // ニコニコ動画サムネイルは直接表示（Next.js最適化バイパス）
  if (isNicoThumbnail) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imgSrc}
        alt={hasError ? '視聴できません' : alt}
        width={width}
        height={height}
        style={style}
        loading={loading}
        className={className}
        onClick={onClick}
        onError={handleError}
      />
    )
  }
  
  // その他の画像は Next.js最適化を使用
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