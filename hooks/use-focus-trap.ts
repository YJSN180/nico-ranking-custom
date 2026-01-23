'use client'

import { useEffect, useRef, useCallback, type RefObject } from 'react'

/**
 * モーダル内でフォーカスをトラップするカスタムフック
 *
 * @param isActive フォーカストラップが有効かどうか
 * @param containerRef フォーカスをトラップするコンテナのref
 */
export function useFocusTrap<T extends HTMLElement>(
  isActive: boolean,
  containerRef: RefObject<T | null>
): void {
  // モーダルが開く前にフォーカスされていた要素を保存
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // フォーカス可能な要素を取得
  const getFocusableElements = useCallback((): HTMLElement[] => {
    if (!containerRef.current) return []

    const focusableSelectors = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(focusableSelectors)
    ).filter(el => el.offsetParent !== null) // 表示されている要素のみ
  }, [containerRef])

  useEffect(() => {
    if (!isActive || !containerRef.current) return

    // 現在フォーカスされている要素を保存
    previousActiveElementRef.current = document.activeElement as HTMLElement

    // モーダル内の最初のフォーカス可能な要素にフォーカス
    const focusableElements = getFocusableElements()
    if (focusableElements.length > 0) {
      focusableElements[0].focus()
    }

    // Tabキーでのフォーカス移動をトラップ
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey) {
        // Shift+Tab: 最初の要素から最後の要素へ
        if (document.activeElement === firstElement) {
          event.preventDefault()
          lastElement.focus()
        }
      } else {
        // Tab: 最後の要素から最初の要素へ
        if (document.activeElement === lastElement) {
          event.preventDefault()
          firstElement.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    // クリーンアップ: モーダルが閉じたら元の要素にフォーカスを戻す
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus()
      }
    }
  }, [isActive, containerRef, getFocusableElements])
}
