import { vi } from 'vitest'

// Next.js navigation モックはvitest.setup.tsで設定済み
// このファイルは互換性のために残しています

// window.scrollTo モック
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
  window.scrollY = 0
}