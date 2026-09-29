import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/**
 * 日本語入力（IME）で変換中のキー操作か。
 * 変換の確定（Enter）や取り消し（Esc）を、追加・送信・閉じる操作として扱わないために使う。
 * Safari は変換確定の Enter を isComposing=false・keyCode=229 で送ることがあるため両方を見る
 */
export function isImeComposing(event: KeyboardEvent | ReactKeyboardEvent): boolean {
  const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event
  return nativeEvent.isComposing || nativeEvent.keyCode === 229
}
