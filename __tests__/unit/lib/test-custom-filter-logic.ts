import type { RankingItem } from '@/types/ranking'
import type { TagCondition } from '@/types/custom-ranking'
import { applyCustomFilters } from './custom-ranking-filter'

// モックデータ作成
const createMockRankingItems = (): RankingItem[] => [
  {
    rank: 1,
    id: 'video1',
    title: 'ゲーム実況 RPG攻略',
    thumbURL: '',
    views: 1000,
    tags: ['ゲーム', '実況', 'RPG'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },
      { name: '実況', isLocked: false },
      { name: 'RPG', isLocked: true }
    ]
  },
  {
    rank: 2,
    id: 'video2',
    title: 'ボカロ楽曲',
    thumbURL: '',
    views: 800,
    tags: ['ボカロ', '音楽', 'オリジナル'],
    tagDetails: [
      { name: 'ボカロ', isLocked: true },
      { name: '音楽', isLocked: true },
      { name: 'オリジナル', isLocked: false }
    ]
  },
  {
    rank: 3,
    id: 'video3',
    title: 'ゲーム音楽 カバー',
    thumbURL: '',
    views: 600,
    tags: ['ゲーム', '音楽', 'カバー'],
    tagDetails: [
      { name: 'ゲーム', isLocked: true },
      { name: '音楽', isLocked: true },
      { name: 'カバー', isLocked: false }
    ]
  },
  {
    rank: 4,
    id: 'video4',
    title: '実況プレイ アクション',
    thumbURL: '',
    views: 400,
    tags: ['実況', 'アクション', 'プレイ'],
    tagDetails: [
      { name: '実況', isLocked: false },
      { name: 'アクション', isLocked: true },
      { name: 'プレイ', isLocked: false }
    ]
  },
  {
    rank: 5,
    id: 'video5',
    title: '音楽のみ タグなし',
    thumbURL: '',
    views: 300,
    tags: ['音楽'],
    tagDetails: [
      { name: '音楽', isLocked: true }
    ]
  },
  {
    rank: 6,
    id: 'video6',
    title: 'タグ詳細なし 古いデータ',
    thumbURL: '',
    views: 200,
    tags: ['古いタグ', '実況'],
    tagDetails: undefined  // 古いデータを想定
  }
]

// テストケース定義
interface TestCase {
  name: string
  conditions: TagCondition[]
  expectedResults: string[]  // 期待される動画ID
  description: string
}

const testCases: TestCase[] = [
  // AND条件のテスト
  {
    name: 'AND - ロックタグのみ',
    conditions: [
      { tag: 'ゲーム', operator: 'AND', tagType: 'lock' }
    ],
    expectedResults: ['video1', 'video3'],
    description: 'ロックタグ「ゲーム」を含む動画のみ'
  },
  {
    name: 'AND - ユーザータグのみ',
    conditions: [
      { tag: '実況', operator: 'AND', tagType: 'user' }
    ],
    expectedResults: ['video1', 'video4'],
    description: 'ユーザータグ「実況」を含む動画のみ'
  },
  {
    name: 'AND - 両方タグ',
    conditions: [
      { tag: '音楽', operator: 'AND', tagType: 'both' }
    ],
    expectedResults: ['video2', 'video3', 'video5'],
    description: 'タグ「音楽」（ロック・ユーザー問わず）を含む動画'
  },
  {
    name: 'AND - 複数条件',
    conditions: [
      { tag: 'ゲーム', operator: 'AND', tagType: 'lock' },
      { tag: '実況', operator: 'AND', tagType: 'user' }
    ],
    expectedResults: ['video1'],
    description: 'ロックタグ「ゲーム」かつユーザータグ「実況」を含む動画'
  },

  // OR条件のテスト
  {
    name: 'OR - 単一条件',
    conditions: [
      { tag: 'ボカロ', operator: 'OR', tagType: 'lock' }
    ],
    expectedResults: ['video2'],
    description: 'ロックタグ「ボカロ」を含む動画'
  },
  {
    name: 'OR - 複数条件',
    conditions: [
      { tag: 'ボカロ', operator: 'OR', tagType: 'lock' },
      { tag: 'アクション', operator: 'OR', tagType: 'lock' }
    ],
    expectedResults: ['video2', 'video4'],
    description: 'ロックタグ「ボカロ」またはロックタグ「アクション」を含む動画'
  },

  // NOT条件のテスト
  {
    name: 'NOT - 単一条件',
    conditions: [
      { tag: 'ゲーム', operator: 'NOT', tagType: 'both' }
    ],
    expectedResults: ['video2', 'video4', 'video5', 'video6'],
    description: 'タグ「ゲーム」を含まない動画'
  },

  // 複合条件のテスト
  {
    name: '複合 - AND + OR',
    conditions: [
      { tag: '音楽', operator: 'AND', tagType: 'lock' },
      { tag: 'オリジナル', operator: 'OR', tagType: 'user' },
      { tag: 'カバー', operator: 'OR', tagType: 'user' }
    ],
    expectedResults: ['video2', 'video3'],
    description: 'ロックタグ「音楽」を含み、かつ（ユーザータグ「オリジナル」またはユーザータグ「カバー」）を含む動画'
  },
  {
    name: '複合 - AND + NOT',
    conditions: [
      { tag: '実況', operator: 'AND', tagType: 'both' },
      { tag: 'RPG', operator: 'NOT', tagType: 'lock' }
    ],
    expectedResults: ['video4', 'video6'],
    description: 'タグ「実況」を含み、かつロックタグ「RPG」を含まない動画'
  },
  {
    name: '複合 - OR + NOT',
    conditions: [
      { tag: '音楽', operator: 'OR', tagType: 'lock' },
      { tag: 'アクション', operator: 'OR', tagType: 'lock' },
      { tag: 'ボカロ', operator: 'NOT', tagType: 'lock' }
    ],
    expectedResults: ['video3', 'video4', 'video5'],
    description: '（ロックタグ「音楽」またはロックタグ「アクション」）を含み、かつロックタグ「ボカロ」を含まない動画'
  },

  // エッジケース
  {
    name: 'エッジケース - 存在しないタグ',
    conditions: [
      { tag: '存在しないタグ', operator: 'AND', tagType: 'both' }
    ],
    expectedResults: [],
    description: '存在しないタグの条件では何も返さない'
  },
  {
    name: 'エッジケース - 条件なし',
    conditions: [],
    expectedResults: ['video1', 'video2', 'video3', 'video4', 'video5', 'video6'],
    description: '条件がない場合はすべての動画を返す'
  },
  {
    name: 'エッジケース - 古いデータ（tagDetails なし）',
    conditions: [
      { tag: '実況', operator: 'AND', tagType: 'lock' }
    ],
    expectedResults: [],
    description: 'tagDetailsがない場合、lock/userタイプは正確に判定できないため除外される'
  },
  {
    name: 'エッジケース - 古いデータ（tagDetails なし）with both',
    conditions: [
      { tag: '実況', operator: 'AND', tagType: 'both' }
    ],
    expectedResults: ['video1', 'video4', 'video6'],
    description: 'tagDetailsがない場合でも、bothタイプなら古いデータもマッチする'
  }
]

// テスト実行関数
export function runCustomFilterTests(): { passed: number; failed: number; details: any[] } {
  const mockData = createMockRankingItems()
  let passed = 0
  let failed = 0
  const details: any[] = []

  console.log('=== カスタムフィルタリング機能テスト開始 ===\n')

  for (const testCase of testCases) {
    console.log(`テスト: ${testCase.name}`)
    console.log(`説明: ${testCase.description}`)
    console.log(`条件:`, testCase.conditions)
    
    const result = applyCustomFilters(mockData, testCase.conditions)
    const resultIds = result.map(item => item.id).sort()
    const expectedIds = testCase.expectedResults.sort()
    
    const isPass = JSON.stringify(resultIds) === JSON.stringify(expectedIds)
    
    console.log(`期待値: [${expectedIds.join(', ')}]`)
    console.log(`実際値: [${resultIds.join(', ')}]`)
    console.log(`結果: ${isPass ? '✅ PASS' : '❌ FAIL'}`)
    
    if (!isPass) {
      console.log(`❌ 不一致詳細:`)
      console.log(`  期待されていたが含まれていない: [${expectedIds.filter(id => !resultIds.includes(id)).join(', ')}]`)
      console.log(`  期待されていないが含まれている: [${resultIds.filter(id => !expectedIds.includes(id)).join(', ')}]`)
    }
    
    console.log('')
    
    if (isPass) {
      passed++
    } else {
      failed++
    }
    
    details.push({
      testName: testCase.name,
      description: testCase.description,
      conditions: testCase.conditions,
      expected: expectedIds,
      actual: resultIds,
      passed: isPass
    })
  }
  
  console.log(`=== テスト結果サマリー ===`)
  console.log(`合格: ${passed}/${testCases.length}`)
  console.log(`不合格: ${failed}/${testCases.length}`)
  console.log(`成功率: ${Math.round((passed / testCases.length) * 100)}%`)
  
  return { passed, failed, details }
}

// デバッグ用: 特定の動画の詳細情報を表示
export function debugVideoDetails(videoId: string) {
  const mockData = createMockRankingItems()
  const video = mockData.find(item => item.id === videoId)
  
  if (video) {
    console.log(`=== ${videoId} の詳細 ===`)
    console.log(`タイトル: ${video.title}`)
    console.log(`tags:`, video.tags)
    console.log(`tagDetails:`, video.tagDetails)
  } else {
    console.log(`動画 ${videoId} が見つかりません`)
  }
}