// 軽量トースト通知の発火側API
// どのクライアントコードからでも showToast() を呼べるよう、
// CustomEvent 経由で ToastViewport（layout.tsx にマウント）へ届ける

export type ToastType = 'success' | 'info' | 'error'

export interface ToastPayload {
  message: string
  type: ToastType
}

export const TOAST_EVENT = 'app:toast'

export function showToast(message: string, type: ToastType = 'success'): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, type } }))
}
