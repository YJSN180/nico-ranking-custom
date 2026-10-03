import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VideoStats } from '@/components/video-stats'

describe('VideoStats', () => {
  it('distinguishes stored zero counts from unavailable values', () => {
    render(
      <VideoStats
        counts={{ views: 0, comments: undefined, likes: NaN, mylists: -1 }}
      />,
    )
    expect(screen.getByTitle('再生数: 0')).toHaveTextContent('0')
    for (const label of ['コメント数', 'いいね数', 'マイリスト数']) {
      expect(screen.getByTitle(`${label}: 未取得`)).toHaveTextContent('—')
    }
  })
  it('hides loading placeholders from assistive technology', () => {
    const { container } = render(<VideoStats loading />)
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByTestId('video-stats')).not.toBeInTheDocument()
  })
})
