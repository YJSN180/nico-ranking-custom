import { render, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MylistModal } from '@/components/mylist-modal'

describe('MylistModal - タッチイベント伝播防止', () => {
  const mockMylists = [
    { id: '1', name: 'マイリスト1', videoCount: 5, videos: [], createdAt: new Date().toISOString() },
    { id: '2', name: 'マイリスト2', videoCount: 3, videos: [], createdAt: new Date().toISOString() }
  ]

  it('オーバーレイのタッチイベントが伝播しないこと', () => {
    const onClose = vi.fn()
    const onAddToMylist = vi.fn()
    const { getByTestId } = render(
      <MylistModal
        mylists={mockMylists}
        selectedMylistIds={[]}
        onAddToMylist={onAddToMylist}
        onClose={onClose}
      />
    )

    const overlay = getByTestId('modal-overlay')
    
    // タッチイベントのモック
    const touchStartEvent = new TouchEvent('touchstart', { bubbles: true, cancelable: true })
    const touchMoveEvent = new TouchEvent('touchmove', { bubbles: true, cancelable: true })
    const touchEndEvent = new TouchEvent('touchend', { bubbles: true, cancelable: true })

    // stopPropagationをスパイ
    const stopPropagationSpy = vi.fn()
    Object.defineProperty(touchStartEvent, 'stopPropagation', { value: stopPropagationSpy })
    Object.defineProperty(touchMoveEvent, 'stopPropagation', { value: stopPropagationSpy })
    Object.defineProperty(touchEndEvent, 'stopPropagation', { value: stopPropagationSpy })

    // タッチイベントを発火
    fireEvent(overlay, touchStartEvent)
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1)

    fireEvent(overlay, touchMoveEvent)
    expect(stopPropagationSpy).toHaveBeenCalledTimes(2)

    fireEvent(overlay, touchEndEvent)
    expect(stopPropagationSpy).toHaveBeenCalledTimes(3)
    expect(onClose).toHaveBeenCalled()
  })

  it('モーダル本体のタッチイベントが伝播しないこと', () => {
    const onClose = vi.fn()
    const onAddToMylist = vi.fn()
    const { getByTestId } = render(
      <MylistModal
        mylists={mockMylists}
        selectedMylistIds={[]}
        onAddToMylist={onAddToMylist}
        onClose={onClose}
      />
    )

    const modal = getByTestId('mylist-modal')
    
    // タッチイベントのモック
    const touchStartEvent = new TouchEvent('touchstart', { bubbles: true, cancelable: true })
    const stopPropagationSpy = vi.fn()
    Object.defineProperty(touchStartEvent, 'stopPropagation', { value: stopPropagationSpy })

    // タッチイベントを発火
    fireEvent(modal, touchStartEvent)
    expect(stopPropagationSpy).toHaveBeenCalled()
  })

  it('クローズボタンのタッチイベントが伝播しないこと', () => {
    const onClose = vi.fn()
    const onAddToMylist = vi.fn()
    const { getByTestId } = render(
      <MylistModal
        mylists={mockMylists}
        selectedMylistIds={[]}
        onAddToMylist={onAddToMylist}
        onClose={onClose}
      />
    )

    const closeButton = getByTestId('mylist-modal-close')
    
    // タッチイベントのモック
    const touchStartEvent = new TouchEvent('touchstart', { bubbles: true, cancelable: true })
    const touchEndEvent = new TouchEvent('touchend', { bubbles: true, cancelable: true })
    const stopPropagationSpy = vi.fn()
    Object.defineProperty(touchStartEvent, 'stopPropagation', { value: stopPropagationSpy })
    Object.defineProperty(touchEndEvent, 'stopPropagation', { value: stopPropagationSpy })

    // タッチイベントを発火
    fireEvent(closeButton, touchStartEvent)
    expect(stopPropagationSpy).toHaveBeenCalledTimes(1)

    fireEvent(closeButton, touchEndEvent)
    expect(stopPropagationSpy).toHaveBeenCalledTimes(2)
  })
})