import React from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { vi } from 'vitest'

// カスタムレンダラー: React concurrent mode の問題を回避
export function render(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  // テスト環境フラグを設定
  if (typeof window !== 'undefined') {
    ;(window as any).__TEST_ENV__ = true
  }

  // React 18 の concurrent features を無効化
  const originalError = console.error
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Should not already be working') ||
       args[0].includes('Warning: ReactDOM.render is no longer supported'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }

  // レンダリング実行
  const result = rtlRender(ui, {
    ...options,
    // React Testing Library のオプション
    legacyRoot: true // React 18 の createRoot を使わない
  } as any)

  // console.error を復元
  console.error = originalError

  return result
}

// re-export everything except render
export {
  screen,
  fireEvent,
  waitFor,
  waitForElementToBeRemoved,
  within,
  cleanup,
  act,
  renderHook
} from '@testing-library/react'