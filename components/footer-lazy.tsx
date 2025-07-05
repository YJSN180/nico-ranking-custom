'use client'

import { useEffect, useState } from 'react'
import { Footer } from './footer'

export function FooterLazy() {
  const [shouldRender, setShouldRender] = useState(false)
  
  useEffect(() => {
    // コンテンツの初期レンダリング後にFooterを表示
    // requestIdleCallbackがあれば使用、なければrequestAnimationFrame
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        setShouldRender(true)
      }, { timeout: 1000 })
    } else {
      requestAnimationFrame(() => {
        setTimeout(() => {
          setShouldRender(true)
        }, 100)
      })
    }
  }, [])
  
  if (!shouldRender) {
    // Footerのスペースを確保してレイアウトシフトを防ぐ
    return <div style={{ height: '160px' }} />
  }
  
  return <Footer />
}