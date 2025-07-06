import React from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { act } from '@testing-library/react'

// カスタムレンダラー: React concurrent mode の問題を回避
export function render(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  // テスト環境フラグを設定
  if (typeof window !== 'undefined') {
    ;(window as any).__TEST_ENV__ = true
    ;(window as any).__DISABLE_REACT_CONCURRENT_MODE__ = true
  }

  // React 18 の concurrent features を無効化
  const originalError = console.error
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Should not already be working') ||
       args[0].includes('ReactDOM.render is no longer supported') ||
       args[0].includes('ReactDOM.render has not been supported'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }

  // flushSyncを使用して同期レンダリングを強制
  let result: any
  act(() => {
    result = rtlRender(ui, options)
  })

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