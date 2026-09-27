import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { SettingsModal } from '@/components/settings-modal'

// 設定モーダルの未適用の NG 編集は、どの閉じ方でも確認なしに捨てない（× と Esc は確認していた）。
// データはすべて合成値。

vi.mock('@/components/settings-modal.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? key : '') }),
}))

function overlay(): HTMLElement {
  const element = document.querySelector('.overlay')
  if (!(element instanceof HTMLElement)) throw new Error('背景が無い')
  return element
}

function addDraftNG(): void {
  const input = screen.getByPlaceholderText('sm12345678')
  fireEvent.change(input, { target: { value: 'sm90000001' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByText('(未保存)')).toBeInTheDocument()
}

beforeEach(() => {
  localStorage.clear()
})

describe('設定モーダルの背景クリック', () => {
  it('未適用の NG があるとき、確認で「キャンセル」なら閉じない', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false)
    const onClose = vi.fn()
    render(<SettingsModal isOpen={true} onClose={onClose} />)
    addDraftNG()

    fireEvent.click(overlay())

    expect(window.confirm).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('sm90000001')).toBeInTheDocument()
  })

  it('変更が無ければ、確認なしで閉じる', () => {
    const onClose = vi.fn()
    render(<SettingsModal isOpen={true} onClose={onClose} />)

    fireEvent.click(overlay())

    expect(window.confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
