'use client'

import { useState, useEffect } from 'react'

export function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'dark-blue'>('light')

  useEffect(() => {
    // 初期テーマをlocalStorageから取得
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'dark-blue' | null
    if (savedTheme) {
      setTheme(savedTheme)
    }

    // テーマ変更を監視
    const handleThemeChange = () => {
      const newTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'dark-blue' | null
      if (newTheme) {
        setTheme(newTheme)
      }
    }

    window.addEventListener('storage', handleThemeChange)
    
    // カスタムイベントも監視（同じウィンドウ内での変更用）
    window.addEventListener('themeChange', handleThemeChange)

    return () => {
      window.removeEventListener('storage', handleThemeChange)
      window.removeEventListener('themeChange', handleThemeChange)
    }
  }, [])

  return theme
}