import { describe, it, expect } from 'vitest'

describe('Edge Tag API Integration Test', () => {
  it('should fetch real tags from the API', async () => {
    const videoId = 'sm43785088' // テスト用動画ID
    
    // tag-apiモジュールの実際の関数をテスト
    const { fetchVideoTags } = await import('@/lib/tag-api')
    
    const tags = await fetchVideoTags([videoId])
    
    console.log(`Tags for ${videoId}:`, tags[videoId])
    
    expect(tags[videoId]).toBeDefined()
    expect(Array.isArray(tags[videoId])).toBe(true)
    expect(tags[videoId].length).toBeGreaterThan(0)
    
    // BB先輩劇場タグが含まれていることを確認（先ほどのテストで確認済み）
    expect(tags[videoId]).toContain('BB先輩劇場')
  }, 30000) // タイムアウトを30秒に設定

  it('should handle multiple video IDs', async () => {
    const videoIds = ['sm43785088', 'sm2959233'] // 複数の動画ID
    
    const { fetchVideoTags } = await import('@/lib/tag-api')
    
    const tags = await fetchVideoTags(videoIds)
    
    console.log('Multiple video tags:', tags)
    
    expect(Object.keys(tags).length).toBeGreaterThan(0)
    
    // 少なくとも1つの動画のタグが取得できていることを確認
    const hasAnyTags = Object.values(tags).some(tagList => tagList && tagList.length > 0)
    expect(hasAnyTags).toBe(true)
  }, 30000)

  it('should handle invalid video ID gracefully', async () => {
    const videoIds = ['invalid_id_12345']
    
    const { fetchVideoTags } = await import('@/lib/tag-api')
    
    const tags = await fetchVideoTags(videoIds)
    
    console.log('Invalid ID result:', tags)
    
    // 無効なIDの場合、結果に含まれないことを確認
    expect(Object.keys(tags).length).toBe(0)
  })
})