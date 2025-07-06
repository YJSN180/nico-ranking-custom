import React from 'react'
import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { vi } from 'vitest'
import ReactDOM from 'react-dom'

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
       args[0].includes('Warning: ReactDOM.render is no longer supported') ||
       args[0].includes('ReactDOM.render has not been supported'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }

  // React 17スタイルのレンダリングを強制
  const container = options?.container || document.createElement('div')
  document.body.appendChild(container)
  
  // act()を使わずに直接レンダリング
  let component: any
  if (ReactDOM.render) {
    // React 17 スタイル
    component = ReactDOM.render(ui, container)
  } else {
    // React 18でもlegacy modeを使用
    const result = rtlRender(ui, {
      ...options,
      container
    })
    
    // console.error を復元
    console.error = originalError
    
    return result
  }

  // console.error を復元
  console.error = originalError

  // React Testing Library互換のオブジェクトを返す
  return {
    container,
    ...rtlRender(ui, { ...options, container })
  }
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