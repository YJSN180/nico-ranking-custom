import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DerivedNGList } from '@/app/admin/ng-settings/components/DerivedNGList'

// Mock fetch
global.fetch = vi.fn()

// Mock window.alert
global.alert = vi.fn()

describe('DerivedNGList', () => {
  const mockVideoIds = ['sm12345', 'sm67890', 'sm11111']
  
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock video info API response by default
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ videos: {} })
    } as Response)
  })

  describe('Basic Display', () => {
    it('should display the total count of derived NG videos', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      expect(screen.getByText('派生NGリスト（3件）')).toBeInTheDocument()
    })

    it('should display video IDs in a table format', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      mockVideoIds.forEach(videoId => {
        expect(screen.getByText(videoId)).toBeInTheDocument()
      })
    })

    it('should make video IDs clickable with correct nico video URL', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      const firstVideoLink = screen.getByRole('link', { name: 'sm12345' })
      expect(firstVideoLink).toHaveAttribute('href', 'https://www.nicovideo.jp/watch/sm12345')
      expect(firstVideoLink).toHaveAttribute('target', '_blank')
      expect(firstVideoLink).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('should show loading state when fetching video info', async () => {
      vi.mocked(global.fetch).mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )

      render(<DerivedNGList initialData={mockVideoIds} />)
      
      // Should show loading indicator
      const loadingElements = screen.getAllByText('読み込み中...')
      expect(loadingElements.length).toBeGreaterThan(0)
    })
  })

  describe('Video Information Display', () => {
    it('should fetch and display video titles and author names', async () => {
      const mockVideoInfo = {
        videos: {
          'sm12345': {
            title: 'テスト動画1',
            authorName: 'テストユーザー1'
          },
          'sm67890': {
            title: 'テスト動画2',
            authorName: 'テストユーザー2'
          },
          'sm11111': {
            title: '削除された動画',
            authorName: null,
            isDeleted: true
          }
        }
      }

      vi.mocked(global.fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => mockVideoInfo
      } as Response)

      render(<DerivedNGList initialData={mockVideoIds} />)

      await waitFor(() => {
        expect(screen.getByText('テスト動画1')).toBeInTheDocument()
        expect(screen.getByText('投稿者: テストユーザー1')).toBeInTheDocument()
        expect(screen.getByText('テスト動画2')).toBeInTheDocument()
        expect(screen.getByText('投稿者: テストユーザー2')).toBeInTheDocument()
        expect(screen.getByText('削除された動画')).toBeInTheDocument()
      })
    })

    it('should handle API errors gracefully', async () => {
      vi.mocked(global.fetch).mockRejectedValueOnce(new Error('API Error'))

      render(<DerivedNGList initialData={mockVideoIds} />)

      await waitFor(() => {
        // Should still display video IDs even if video info fetch fails
        mockVideoIds.forEach(videoId => {
          expect(screen.getByText(videoId)).toBeInTheDocument()
        })
      })
    })
  })

  describe('Individual Delete', () => {
    it('should show delete button for each video', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      const deleteButtons = screen.getAllByRole('button', { name: /削除/ })
      expect(deleteButtons).toHaveLength(mockVideoIds.length)
    })

    it('should confirm before deleting a single video', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
      
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      const firstDeleteButton = screen.getAllByRole('button', { name: /削除/ })[0]
      fireEvent.click(firstDeleteButton)
      
      expect(confirmSpy).toHaveBeenCalledWith('sm12345 をNGリストから削除しますか？')
      // Should not call delete API when not confirmed
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1) // Only video info call
    })

    it('should delete video when confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true)
      
      // Mock both API calls (video info and delete)
      vi.mocked(global.fetch)
        .mockResolvedValueOnce({ // Video info response
          ok: true,
          json: async () => ({ videos: {} })
        } as Response)
        .mockResolvedValueOnce({ // Delete response
          ok: true,
          json: async () => ({ success: true })
        } as Response)

      const onUpdate = vi.fn()
      render(<DerivedNGList initialData={mockVideoIds} onUpdate={onUpdate} />)
      
      const firstDeleteButton = screen.getAllByRole('button', { name: /削除/ })[0]
      fireEvent.click(firstDeleteButton)
      
      await waitFor(() => {
        expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
          '/api/admin/ng-list/derived/sm12345',
          expect.objectContaining({
            method: 'DELETE'
          })
        )
        
        // Should remove the video from the list (optimistic update)
        expect(screen.queryByText('sm12345')).not.toBeInTheDocument()
        expect(onUpdate).toHaveBeenCalledWith(['sm67890', 'sm11111'])
      })
    })
  })

  describe('Bulk Selection and Delete', () => {
    it('should show checkboxes for bulk selection', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      const checkboxes = screen.getAllByRole('checkbox')
      // +1 for "select all" checkbox
      expect(checkboxes).toHaveLength(mockVideoIds.length + 1)
    })

    it('should select all videos when clicking select all checkbox', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      const selectAllCheckbox = screen.getByRole('checkbox', { name: /全選択/ })
      fireEvent.click(selectAllCheckbox)
      
      const allCheckboxes = screen.getAllByRole('checkbox')
      allCheckboxes.forEach(checkbox => {
        expect(checkbox).toBeChecked()
      })
    })

    it('should show bulk delete button when videos are selected', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      // Initially, bulk delete button should not be visible
      expect(screen.queryByText(/選択した項目を削除/)).not.toBeInTheDocument()
      
      // Select first video
      const firstCheckbox = screen.getAllByRole('checkbox')[1]
      fireEvent.click(firstCheckbox)
      
      expect(screen.getByText('選択中: 1件')).toBeInTheDocument()
      expect(screen.getByText(/選択した項目を削除/)).toBeInTheDocument()
    })
  })

  describe('Search and Filter', () => {
    it('should show search input', () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      expect(screen.getByPlaceholderText('動画ID・タイトルで検索')).toBeInTheDocument()
    })

    it('should filter videos by ID when searching', async () => {
      render(<DerivedNGList initialData={mockVideoIds} />)
      
      const searchInput = screen.getByPlaceholderText('動画ID・タイトルで検索')
      fireEvent.change(searchInput, { target: { value: '12345' } })
      
      await waitFor(() => {
        expect(screen.getByText('sm12345')).toBeInTheDocument()
        expect(screen.queryByText('sm67890')).not.toBeInTheDocument()
        expect(screen.queryByText('sm11111')).not.toBeInTheDocument()
      })
    })
  })

  describe('Pagination', () => {
    it('should show pagination controls when there are many videos', () => {
      // Create 100 video IDs
      const manyVideoIds = Array.from({ length: 100 }, (_, i) => `sm${i + 1}`)
      
      render(<DerivedNGList initialData={manyVideoIds} />)
      
      expect(screen.getByText('派生NGリスト（100件）')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /次へ/ })).toBeInTheDocument()
      expect(screen.getByText('1 / 2')).toBeInTheDocument() // Page indicator
    })
  })
})