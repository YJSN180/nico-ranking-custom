/**
 * カスタムランキング機能のE2Eテスト用モックデータ
 * 
 * このファイルは、E2Eテストでカスタムランキングのタグフィルタリング機能を
 * 安定してテストするためのモックデータを提供します。
 * 
 * 使用方法:
 * 1. E2Eテスト内でpage.route()を使用してAPIレスポンスをインターセプト
 * 2. 実際のAPIの代わりにこのモックデータを返す
 * 3. カスタムランキング作成・フィルタリングをテスト
 */

import type { RankingItem } from '@/types/ranking'

/**
 * ゲームジャンルのモックデータ
 * タグタイプ（ロック/ユーザー）の区別を含む
 */
export const gameGenreMockData: RankingItem[] = [
  {
    rank: 1,
    previousRank: 1,
    title: 'レトロゲーム実況プレイ Part1【ファミコン名作集】',
    videoId: 'sm12345001',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345001/12345001.M.jpg',
    viewCount: 5000,
    likeCount: 500,
    mylistCount: 150,
    commentCount: 300,
    lengthSeconds: 1200,
    postedAt: '2025-01-24T10:00:00Z',
    tags: ['ゲーム', 'VOICEROID実況プレイ', 'レトロゲーム', 'ファミコン'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },              // ジャンルタグ（ロック）
      { name: 'VOICEROID実況プレイ', isLocked: true }, // 運営タグ（ロック）
      { name: 'レトロゲーム', isLocked: false },        // ユーザータグ
      { name: 'ファミコン', isLocked: false }           // ユーザータグ
    ]
  },
  {
    rank: 2,
    previousRank: 3,
    title: 'モダンホラーゲーム実況 - 夜中にプレイするのは危険',
    videoId: 'sm12345002',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345002/12345002.M.jpg',
    viewCount: 8000,
    likeCount: 800,
    mylistCount: 200,
    commentCount: 450,
    lengthSeconds: 1800,
    postedAt: '2025-01-24T20:00:00Z',
    tags: ['ゲーム', '実況プレイ', 'ホラーゲーム', 'バイオハザード'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },        // ジャンルタグ（ロック）
      { name: '実況プレイ', isLocked: false },   // ユーザータグ
      { name: 'ホラーゲーム', isLocked: false }, // ユーザータグ
      { name: 'バイオハザード', isLocked: false } // ユーザータグ
    ]
  },
  {
    rank: 3,
    previousRank: 2,
    title: 'VOICEROID実況によるレトロRPG冒険記',
    videoId: 'sm12345003',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345003/12345003.M.jpg',
    viewCount: 3500,
    likeCount: 350,
    mylistCount: 120,
    commentCount: 180,
    lengthSeconds: 2400,
    postedAt: '2025-01-24T15:30:00Z',
    tags: ['ゲーム', 'VOICEROID実況プレイ', 'レトロゲーム', 'RPG', 'ドラゴンクエスト'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },              // ジャンルタグ（ロック）
      { name: 'VOICEROID実況プレイ', isLocked: true }, // 運営タグ（ロック）
      { name: 'レトロゲーム', isLocked: false },        // ユーザータグ
      { name: 'RPG', isLocked: false },                // ユーザータグ
      { name: 'ドラゴンクエスト', isLocked: false }     // ユーザータグ
    ]
  },
  {
    rank: 4,
    previousRank: 5,
    title: 'アクションゲーム実況 - スーパーマリオ縛りプレイ',
    videoId: 'sm12345004',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345004/12345004.M.jpg',
    viewCount: 2800,
    likeCount: 280,
    mylistCount: 90,
    commentCount: 120,
    lengthSeconds: 900,
    postedAt: '2025-01-24T12:00:00Z',
    tags: ['ゲーム', '実況プレイ', 'アクション', 'スーパーマリオ'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },        // ジャンルタグ（ロック）
      { name: '実況プレイ', isLocked: false },   // ユーザータグ
      { name: 'アクション', isLocked: false },   // ユーザータグ
      { name: 'スーパーマリオ', isLocked: false } // ユーザータグ
    ]
  },
  {
    rank: 5,
    previousRank: 4,
    title: 'ゆっくり実況で楽しむレトロパズルゲーム',
    videoId: 'sm12345005',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345005/12345005.M.jpg',
    viewCount: 4200,
    likeCount: 420,
    mylistCount: 130,
    commentCount: 200,
    lengthSeconds: 1500,
    postedAt: '2025-01-24T14:00:00Z',
    tags: ['ゲーム', 'ゆっくり実況プレイ', 'レトロゲーム', 'パズル'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },           // ジャンルタグ（ロック）
      { name: 'ゆっくり実況プレイ', isLocked: true }, // 運営タグ（ロック）
      { name: 'レトロゲーム', isLocked: false },     // ユーザータグ
      { name: 'パズル', isLocked: false }           // ユーザータグ
    ]
  }
]

/**
 * その他ジャンルのモックデータ
 * 「真夏の夜の淫夢」タグのテスト用
 */
export const otherGenreMockData: RankingItem[] = [
  {
    rank: 1,
    previousRank: 1,
    title: '野獣先輩BB劇場シリーズ',
    videoId: 'sm12345101',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345101/12345101.M.jpg',
    viewCount: 15000,
    likeCount: 1500,
    mylistCount: 500,
    commentCount: 800,
    lengthSeconds: 600,
    postedAt: '2025-01-24T16:00:00Z',
    tags: ['その他', '真夏の夜の淫夢', '野獣先輩', '例のアレ'],
    tagDetails: [
      { name: 'その他', isLocked: true },        // ジャンルタグ（ロック）
      { name: '真夏の夜の淫夢', isLocked: false }, // ユーザータグ
      { name: '野獣先輩', isLocked: false },     // ユーザータグ
      { name: '例のアレ', isLocked: false }      // ユーザータグ
    ]
  },
  {
    rank: 2,
    previousRank: 2,
    title: 'ホモと見るアニメシリーズ',
    videoId: 'sm12345102',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345102/12345102.M.jpg',
    viewCount: 12000,
    likeCount: 1200,
    mylistCount: 400,
    commentCount: 600,
    lengthSeconds: 1200,
    postedAt: '2025-01-24T18:00:00Z',
    tags: ['その他', '真夏の夜の淫夢', 'ホモと見る', 'アニメ'],
    tagDetails: [
      { name: 'その他', isLocked: true },        // ジャンルタグ（ロック）
      { name: '真夏の夜の淫夢', isLocked: false }, // ユーザータグ
      { name: 'ホモと見る', isLocked: false },   // ユーザータグ
      { name: 'アニメ', isLocked: false }        // ユーザータグ
    ]
  },
  {
    rank: 3,
    previousRank: 4,
    title: '一般的な雑談動画',
    videoId: 'sm12345103',
    thumbnailUrl: 'https://img.cdn.nimg.jp/s/nicovideo/thumbnails/12345103/12345103.M.jpg',
    viewCount: 800,
    likeCount: 80,
    mylistCount: 20,
    commentCount: 50,
    lengthSeconds: 900,
    postedAt: '2025-01-24T19:00:00Z',
    tags: ['その他', '雑談', '日常'],
    tagDetails: [
      { name: 'その他', isLocked: true }, // ジャンルタグ（ロック）
      { name: '雑談', isLocked: false },  // ユーザータグ
      { name: '日常', isLocked: false }   // ユーザータグ
    ]
  }
]

/**
 * カスタムランキングのテストケース定義
 */
export const customRankingTestCases = [
  {
    id: 'retro-voiceroid-gameplay',
    title: 'レトロVOICEROID実況',
    baseGenre: 'game' as const,
    conditions: [
      { tag: 'VOICEROID実況プレイ', operator: 'AND' as const, tagType: 'lock' as const },
      { tag: 'レトロゲーム', operator: 'AND' as const, tagType: 'user' as const }
    ],
    expectedResults: [
      'sm12345001', // レトロゲーム実況プレイ Part1【ファミコン名作集】
      'sm12345003'  // VOICEROID実況によるレトロRPG冒険記
    ],
    expectedCount: 2
  },
  {
    id: 'horror-user-tag',
    title: 'ホラーゲーム実況',
    baseGenre: 'game' as const,
    conditions: [
      { tag: 'ホラーゲーム', operator: 'AND' as const, tagType: 'user' as const }
    ],
    expectedResults: [
      'sm12345002' // モダンホラーゲーム実況 - 夜中にプレイするのは危険
    ],
    expectedCount: 1
  },
  {
    id: 'yaju-series',
    title: '真夏の夜の淫夢シリーズ',
    baseGenre: 'other' as const,
    conditions: [
      { tag: '真夏の夜の淫夢', operator: 'AND' as const, tagType: 'user' as const }
    ],
    expectedResults: [
      'sm12345101', // 野獣先輩BB劇場シリーズ
      'sm12345102'  // ホモと見るアニメシリーズ
    ],
    expectedCount: 2
  },
  {
    id: 'exclude-horror',
    title: 'ホラー以外のゲーム実況',
    baseGenre: 'game' as const,
    conditions: [
      { tag: '実況プレイ', operator: 'OR' as const, tagType: 'both' as const },
      { tag: 'VOICEROID実況プレイ', operator: 'OR' as const, tagType: 'both' as const },
      { tag: 'ゆっくり実況プレイ', operator: 'OR' as const, tagType: 'both' as const },
      { tag: 'ホラーゲーム', operator: 'NOT' as const, tagType: 'user' as const }
    ],
    expectedResults: [
      'sm12345001', // レトロゲーム実況プレイ Part1【ファミコン名作集】
      'sm12345003', // VOICEROID実況によるレトロRPG冒険記
      'sm12345004', // アクションゲーム実況 - スーパーマリオ縛りプレイ
      'sm12345005'  // ゆっくり実況で楽しむレトロパズルゲーム
    ],
    expectedCount: 4
  }
] as const

/**
 * E2Eテスト用のAPIモックレスポンス生成
 */
export function createMockApiResponse(genre: string): { items: RankingItem[] } {
  switch (genre) {
    case 'game':
      return { items: gameGenreMockData }
    case 'other':
      return { items: otherGenreMockData }
    default:
      return { items: [] }
  }
}

/**
 * Playwrightでのページルートセットアップ用ヘルパー
 */
export function setupMockApiRoutes(page: any) {
  // ゲームジャンルのAPIコール
  page.route('**/api/ranking?genre=game**', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockApiResponse('game'))
    })
  })

  // その他ジャンルのAPIコール
  page.route('**/api/ranking?genre=other**', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createMockApiResponse('other'))
    })
  })

  // ポピュラータグのAPIコール
  page.route('**/api/popular-tags**', (route: any) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tags: ['実況プレイ', 'VOICEROID実況プレイ', 'レトロゲーム', 'ホラーゲーム', '真夏の夜の淫夢']
      })
    })
  })
}