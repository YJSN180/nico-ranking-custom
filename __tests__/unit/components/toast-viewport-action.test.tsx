import { describe, it, expect, vi } from 'vitest'
import { screen, fireEvent, act } from '@testing-library/react'
import { render } from '@/__tests__/test-utils'
import { ToastViewport } from '@/components/toast-viewport'
import { showToast } from '@/lib/toast'

// 失敗の通知から、その場で再試行できるようにする（トーストに操作ボタンを付けられる）

describe('ToastViewport: 操作ボタン付きのトースト', () => {
  it('action を渡すとボタンを出し、押すと実行してトーストを閉じる', () => {
    const onAction = vi.fn()
    render(<ToastViewport />)

    act(() => {
      showToast('101位以降を読み込めませんでした', 'error', { action: { label: '再試行', onAction } })
    })

    expect(screen.getByText('101位以降を読み込めませんでした')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(onAction).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.toast--leaving')).not.toBeNull()
  })

  it('action が無いトーストにはボタンを出さない（従来どおり）', () => {
    render(<ToastViewport />)
    act(() => {
      showToast('マイリストに追加しました')
    })
    expect(screen.getByText('マイリストに追加しました')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})
