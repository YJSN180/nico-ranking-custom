// 軽量トースト通知の発火側API
// どのクライアントコードからでも showToast() を呼べるよう、
// CustomEvent 経由で ToastViewport（layout.tsx にマウント）へ届ける

export type ToastType = 'success' | 'info' | 'error'

/** トーストに付ける操作（例: 失敗時の「再試行」）。押すと実行してトーストを閉じる */
export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastPayload {
  message: string
  type: ToastType
  action?: ToastAction
}

export const TOAST_EVENT = 'app:toast'

export function showToast(
  message: string,
  type: ToastType = 'success',
  options: { action?: ToastAction } = {}
): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, type, action: options.action } })
  )
}
