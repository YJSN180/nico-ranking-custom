import React from 'react'
import { renderToString } from 'react-dom/server'
import { render, renderHook } from '@testing-library/react'
import { useMobileDetect } from '@/hooks/use-mobile-detect'

describe('useMobileDetect hydration test', () => {
  describe('ハイドレーションの一貫性', () => {
    beforeEach(() => {
      // window.innerWidthをモック
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
      })
    })

    it('サーバーとクライアントで同じ初期値を返すべき', () => {
      // サーバー側の処理をシミュレート
      const ServerComponent = () => {
        const isMobile = useMobileDetect()
        return <div data-testid="mobile-status">{isMobile ? 'mobile' : 'desktop'}</div>
      }

      // SSRをシミュレート（windowオブジェクトなし）
      const originalWindow = global.window
      // @ts-ignore
      delete global.window
      
      const serverHTML = renderToString(<ServerComponent />)
      
      // windowを復元
      global.window = originalWindow
      
      // クライアント側でハイドレーション
      window.innerWidth = 500 // モバイルサイズ
      const { getByTestId } = render(<ServerComponent />)
      
      // ハイドレーションエラーの検証
      // サーバー側は常にfalse、クライアント側はtrueになるはず
      expect(serverHTML).toContain('desktop') // サーバー側
      expect(getByTestId('mobile-status').textContent).toBe('mobile') // クライアント側
      
      // これはハイドレーションミスマッチを引き起こす！
    })

    it('初期レンダリングで一貫性を保つべき', () => {
      // クライアント側でのみ実行
      window.innerWidth = 500
      
      const { result, rerender } = renderHook(() => useMobileDetect())
      
      // 初期値は常にfalseであるべき（SSRとの一貫性のため）
      expect(result.current).toBe(false)
      
      // useEffectが実行された後、正しい値になるべき
      // （このテストは現在の実装では失敗する）
    })
  })

  describe('レスポンシブ動作', () => {
    it('ウィンドウサイズ変更に反応すべき', async () => {
      window.innerWidth = 800
      const { result } = renderHook(() => useMobileDetect())
      
      expect(result.current).toBe(false)
      
      // サイズ変更をシミュレート
      window.innerWidth = 500
      window.dispatchEvent(new Event('resize'))
      
      // デバウンス待機
      await new Promise(resolve => setTimeout(resolve, 200))
      
      expect(result.current).toBe(true)
    })
  })
})