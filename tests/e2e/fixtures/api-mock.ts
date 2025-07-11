import { Page } from '@playwright/test'

/**
 * E2Eテスト用のAPIモックデータ
 */
const mockRankingData = {
  items: [
    {
      rank: 1,
      id: "sm12345678",
      title: "【E2Eテスト】モック動画タイトル1",
      thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/12345678/12345678.M",
      views: 10000,
      likes: 1000,
      mylists: 100,
      comments: 50,
      duration: 300,
      registeredAt: new Date().toISOString(),
      tags: ["テスト", "モック"],
      originalRank: 1
    },
    {
      rank: 2,
      id: "sm87654321",
      title: "【E2Eテスト】モック動画タイトル2",
      thumbURL: "https://nicovideo.cdn.nimg.jp/thumbnails/87654321/87654321.M",
      views: 8000,
      likes: 800,
      mylists: 80,
      comments: 40,
      duration: 240,
      registeredAt: new Date().toISOString(),
      tags: ["テスト", "モック"],
      originalRank: 2
    }
  ],
  popularTags: ["テスト", "モック", "E2E"],
  metadata: {
    version: 1,
    updatedAt: new Date().toISOString(),
    genre: "all",
    period: "24h"
  }
}

/**
 * APIレスポンスをモックする関数
 */
export async function setupAPIMocks(page: Page) {
  // APIレスポンスをインターセプトしてモックデータを返す
  await page.route('**/api/ranking*', async (route) => {
    const url = new URL(route.request().url())
    const genre = url.searchParams.get('genre') || 'all'
    const period = url.searchParams.get('period') || '24h'
    
    // ジャンルに応じてモックデータを調整
    const responseData = {
      ...mockRankingData,
      metadata: {
        ...mockRankingData.metadata,
        genre,
        period
      }
    }
    
    // ジャンル別のタイトルを設定
    if (genre !== 'all') {
      responseData.items = responseData.items.map(item => ({
        ...item,
        title: item.title.replace('モック動画', `${genre}動画`)
      }))
    }
    
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseData)
    })
  })
  
  // 画像リクエストもモック（オプション）
  await page.route('**/*.jpg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: Buffer.from('') // 空の画像
    })
  })
}

/**
 * APIモックを無効化する関数
 */
export async function disableAPIMocks(page: Page) {
  await page.unroute('**/api/ranking*')
  await page.unroute('**/*.jpg')
}