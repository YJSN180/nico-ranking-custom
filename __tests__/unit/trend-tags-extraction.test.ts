import { describe, it, expect } from 'vitest'
import { extractTrendTagsFromServerResponse } from '../../lib/complete-hybrid-scraper'

describe('extractTrendTagsFromServerResponse', () => {
  it('should extract trend tags from server response JSON', () => {
    const serverResponseData = {
      data: {
        response: {
          $getTeibanRankingFeaturedKeyAndTrendTags: {
            data: {
              featuredKey: 'oxzi6bje',
              label: 'ラジオ',
              isTopLevel: false,
              isImmoral: false,
              trendTags: [
                'ラジオ',
                '声優',
                '男性声優',
                '文化放送',
                'ラジオドラマ',
                'ボイロラジオ',
                'アニメ'
              ]
            }
          }
        }
      }
    }

    const result = extractTrendTagsFromServerResponse(serverResponseData)
    
    expect(result).toEqual([
      'ラジオ',
      '声優',
      '男性声優',
      '文化放送',
      'ラジオドラマ',
      'ボイロラジオ',
      'アニメ'
    ])
  })

  it('should return empty array when no trend tags found', () => {
    const serverResponseData = {
      data: {
        response: {
          $getTeibanRankingFeaturedKeyAndTrendTags: {
            data: {
              featuredKey: 'test',
              label: 'テスト'
            }
          }
        }
      }
    }

    const result = extractTrendTagsFromServerResponse(serverResponseData)
    
    expect(result).toEqual([])
  })

  it('should handle missing response structure gracefully', () => {
    const serverResponseData = {
      data: {}
    }

    const result = extractTrendTagsFromServerResponse(serverResponseData)
    
    expect(result).toEqual([])
  })

  it('should filter out invalid tags', () => {
    const serverResponseData = {
      data: {
        response: {
          $getTeibanRankingFeaturedKeyAndTrendTags: {
            data: {
              trendTags: [
                'ゲーム',
                '',  // 空文字列
                null, // null
                undefined, // undefined
                'アニメ',
                '   ', // 空白のみ
                'VOCALOID'
              ]
            }
          }
        }
      }
    }

    const result = extractTrendTagsFromServerResponse(serverResponseData)
    
    expect(result).toEqual(['ゲーム', 'アニメ', 'VOCALOID'])
  })
})