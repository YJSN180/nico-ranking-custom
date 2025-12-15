import { useCallback, useRef, useEffect } from 'react'

/**
 * デバウンスされたコールバックを作成するカスタムフック
 * 連続した呼び出しを制御し、最後の呼び出しのみを実行
 * @param callback 実行する関数
 * @param delay デバウンス遅延時間（ミリ秒）
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const callbackRef = useRef(callback)
  
  // callbackが変更されても参照を保持
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])
  
  return useCallback(
    (...args: Parameters<T>) => {
      // 既存のタイマーをクリア
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      
      // 新しいタイマーを設定
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args)
        timeoutRef.current = null
      }, delay)
    },
    [delay]
  )
}