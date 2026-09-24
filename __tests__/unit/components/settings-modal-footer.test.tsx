import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SettingsModal } from '@/components/settings-modal'

// PC の設定モーダルのフッターは main と同じ（「適用」＋「閉じる」）。
// モバイル（幅 640px 以下）では右上の × に一本化し、フッターの「閉じる」は CSS で隠す。

vi.mock('@/components/settings-modal.module.css', () => ({
  default: new Proxy({}, { get: (_target, key) => (typeof key === 'string' ? key : '') }),
}))

function footerOf(): HTMLElement {
  const footer = document.querySelector('.footer')
  if (!footer) throw new Error('フッターが無い')
  return footer as HTMLElement
}

describe('SettingsModal のフッター（PC は main と同じ）', () => {
  it('フッターに「閉じる」があり、押すとモーダルを閉じる', () => {
    const onClose = vi.fn()
    render(<SettingsModal isOpen={true} onClose={onClose} />)

    const close = within(footerOf()).getByRole('button', { name: '閉じる' })
    fireEvent.click(close)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('変更があるときは「適用」を「閉じる」の左に出す', () => {
    render(<SettingsModal isOpen={true} onClose={vi.fn()} />)

    const input = screen.getAllByRole('textbox')[0]
    fireEvent.change(input, { target: { value: 'sm90000003' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.click(screen.getAllByRole('button', { name: '追加' })[0])

    const labels = within(footerOf()).getAllByRole('button').map((b) => b.textContent)
    expect(labels).toEqual(['適用', '閉じる'])
  })
})
