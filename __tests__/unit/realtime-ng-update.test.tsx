import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useUserNGList } from '@/hooks/use-user-ng-list'
import type { UserNGList } from '@/hooks/use-user-ng-list'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
  length: 0,
  key: vi.fn()
}
global.localStorage = localStorageMock

// Test component that uses the hook
function TestComponent() {
  const { ngList, addVideoId } = useUserNGList()
  
  return (
    <div>
      <div data-testid="video-count">{ngList.videoIds.length}</div>
      <button onClick={() => addVideoId('test123')}>Add Video</button>
    </div>
  )
}

describe('Realtime NG List Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('should update NG list in real-time across components', async () => {
    // Render two instances of the component
    const { rerender: rerender1 } = render(<TestComponent />)
    const { container: container2 } = render(<TestComponent />)
    
    // Initially both should show 0 videos
    const count1 = screen.getAllByTestId('video-count')[0]
    const count2 = screen.getAllByTestId('video-count')[1]
    expect(count1).toHaveTextContent('0')
    expect(count2).toHaveTextContent('0')
    
    // Click add button in first component
    const addButton = screen.getAllByText('Add Video')[0]
    
    await act(async () => {
      addButton.click()
    })
    
    // Both components should now show 1 video
    expect(count1).toHaveTextContent('1')
    expect(count2).toHaveTextContent('1')
  })

  it('should fire ngListUpdated event when NG list changes', async () => {
    const eventHandler = vi.fn()
    window.addEventListener('ngListUpdated', eventHandler)
    
    render(<TestComponent />)
    const addButton = screen.getByText('Add Video')
    
    await act(async () => {
      addButton.click()
    })
    
    expect(eventHandler).toHaveBeenCalledTimes(1)
    expect(eventHandler.mock.calls[0][0].detail.ngList.videoIds).toContain('test123')
    
    window.removeEventListener('ngListUpdated', eventHandler)
  })

  it('should save to localStorage when NG list changes', async () => {
    render(<TestComponent />)
    const addButton = screen.getByText('Add Video')
    
    await act(async () => {
      addButton.click()
    })
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'user-ng-list',
      expect.stringContaining('test123')
    )
  })

  it('should handle cross-tab synchronization via events', async () => {
    render(<TestComponent />)
    
    // Simulate an update from another tab
    const mockNGList: UserNGList = {
      videoIds: ['external123'],
      videoTitles: { exact: [], partial: [] },
      authorIds: [],
      authorNames: { exact: [], partial: [] },
      version: 1,
      totalCount: 1,
      updatedAt: new Date().toISOString()
    }
    
    await act(async () => {
      window.dispatchEvent(new CustomEvent('ngListUpdated', { 
        detail: { ngList: mockNGList } 
      }))
    })
    
    const count = screen.getByTestId('video-count')
    expect(count).toHaveTextContent('1')
  })
})