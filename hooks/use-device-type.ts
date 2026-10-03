'use client'

import { useState, useEffect } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

interface DeviceBreakpoints {
  mobile: number
  tablet: number
}

// ブレークポイントの定義（CSSのメディアクエリと一致させる）
const BREAKPOINTS: DeviceBreakpoints = {
  mobile: 640,   // 〜640px: モバイル
  tablet: 1024,  // 641px〜1024px: タブレット
  // 1025px〜: デスクトップ
}

function getDeviceType(width: number): DeviceType {
  if (width <= BREAKPOINTS.mobile) {
    return 'mobile'
  } else if (width <= BREAKPOINTS.tablet) {
    return 'tablet'
  }
  return 'desktop'
}

export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = useState<DeviceType>(() => {
    if (typeof window === 'undefined') {
      return 'desktop' // SSR時のデフォルト
    }
    return getDeviceType(window.innerWidth)
  })

  useEffect(() => {
    function handleResize() {
      setDeviceType(getDeviceType(window.innerWidth))
    }

    // 初期値を設定
    handleResize()

    // リサイズイベントリスナーを追加
    window.addEventListener('resize', handleResize)

    // クリーンアップ
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return deviceType
}

// デバイスタイプに応じたランキング取得件数を返すヘルパー関数
export function getDeviceBasedLimit(deviceType: DeviceType, isTagRanking: boolean): number {
  if (isTagRanking) {
    // タグ別ランキングは全デバイス300件
    return 300
  }

  // ジャンル別ランキング
  switch (deviceType) {
    case 'mobile':
      return 500  // モバイルは500件のまま
    case 'tablet':
    case 'desktop':
      return 1000 // タブレットとPCは1000件
    default:
      return 500  // デフォルトは500件
  }
}