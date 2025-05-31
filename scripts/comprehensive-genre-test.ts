#!/usr/bin/env tsx

// プロキシ経由で全ジャンルと人気タグを検証するスクリプト

import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

// ニコニコ動画の全ジャンル定義
const ALL_GENRES = [
  { id: 'all', name: '総合' },
  { id: 'entertainment', name: 'エンタメ・音楽' },
  { id: 'game', name: 'ゲーム' },
  { id: 'anime', name: 'アニメ' },
  { id: 'music_sound', name: '音楽・サウンド' },
  { id: 'dance', name: 'ダンス' },
  { id: 'animal', name: '動物' },
  { id: 'nature', name: '自然' },
  { id: 'cooking', name: '料理' },
  { id: 'traveling', name: '旅行・アウトドア' },
  { id: 'vehicle', name: 'vehicle・乗り物' },
  { id: 'sports', name: 'スポーツ' },
  { id: 'society_politics_news', name: '社会・政治・時事' },
  { id: 'technology_craft', name: '技術・工作' },
  { id: 'lecture', name: '解説・講座' },
  { id: 'history', name: '歴史' },
  { id: 'science', name: '科学・技術' },
  { id: 'radio', name: 'ニコニコ動画講座' },
  { id: 'other', name: 'その他' },
  { id: 'are', name: 'R-18' }
]

interface GenreTestResult {
  genre: string
  name: string
  success: boolean
  itemCount: number
  popularTags: string[]
  error?: string
  hasSensitive: boolean
  sampleItems: any[]
}

interface TagTestResult {
  genre: string
  tag: string
  success: boolean
  itemCount: number
  hasSensitive: boolean
  sampleItems: any[]
  error?: string
}

async function testAllGenres(): Promise<void> {
  console.log('=== プロキシ経由での全ジャンル・人気タグ検証 ===')
  
  // ローカルテスト用環境変数設定
  process.env.VERCEL_URL = 'localhost:8888'
  process.env.INTERNAL_PROXY_KEY = 'test-key'
  
  console.log(`\n対象ジャンル数: ${ALL_GENRES.length}`)
  
  const genreResults: GenreTestResult[] = []
  const failedGenres: string[] = []
  
  console.log('\n=== Step 1: 全ジャンルのデータ取得テスト ===')
  
  for (const genre of ALL_GENRES) {
    process.stdout.write(`${genre.name}(${genre.id})... `)
    
    try {
      const result = await scrapeRankingViaProxy(genre.id, '24h')
      
      // センシティブコンテンツの検出
      const hasSensitive = result.items.some(item => 
        item.title?.includes('セックス') ||
        item.title?.includes('エロ') ||
        item.title?.includes('淫') ||
        item.title?.includes('sex') ||
        item.title?.includes('ASMR') ||
        item.title?.includes('おっぱい') ||
        item.title?.includes('パンツ') ||
        (item.title && /(?:下着|水着|巨乳|美女|セクシー|エッチ|18禁|機動戦士|グンダム|ガンダム|静電気|ドッキリ|タクヤ|GQuuuuuuX|ジークアクス)/i.test(item.title))
      )
      
      const genreResult: GenreTestResult = {
        genre: genre.id,
        name: genre.name,
        success: true,
        itemCount: result.items.length,
        popularTags: result.popularTags || [],
        hasSensitive,
        sampleItems: result.items.slice(0, 3)
      }
      
      genreResults.push(genreResult)
      console.log(`✓ ${result.items.length}件取得 ${hasSensitive ? '(センシティブあり)' : ''}`)
    } catch (error) {
      const genreResult: GenreTestResult = {
        genre: genre.id,
        name: genre.name,
        success: false,
        itemCount: 0,
        popularTags: [],
        error: String(error),
        hasSensitive: false,
        sampleItems: []
      }
      
      genreResults.push(genreResult)
      failedGenres.push(genre.id)
      console.log(`✗ エラー: ${error}`)
    }
    
    // レート制限回避のため少し待機
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  console.log('\n=== Step 1 結果サマリー ===')
  const successCount = genreResults.filter(r => r.success).length
  console.log(`成功: ${successCount}/${ALL_GENRES.length} (${Math.round(successCount/ALL_GENRES.length*100)}%)`)
  
  if (failedGenres.length > 0) {
    console.log(`失敗したジャンル: ${failedGenres.join(', ')}`)
  }
  
  // 成功したジャンル一覧
  console.log('\n=== 取得可能なジャンル一覧 ===')
  const successfulGenres = genreResults.filter(r => r.success)
  successfulGenres.forEach(result => {
    console.log(`✓ ${result.name}(${result.genre}): ${result.itemCount}件 ${result.hasSensitive ? '[センシティブあり]' : ''}`)
  })
  
  console.log('\n=== Step 2: 各ジャンルの人気タグ一覧 ===')
  
  // 人気タグが取得できたジャンルを表示
  successfulGenres.forEach(result => {
    if (result.popularTags.length > 0) {
      console.log(`\n【${result.name}(${result.genre})】`)
      console.log(`人気タグ(${result.popularTags.length}個): ${result.popularTags.slice(0, 10).join(', ')}${result.popularTags.length > 10 ? '...' : ''}`)
    } else {
      console.log(`\n【${result.name}(${result.genre})】`)
      console.log('人気タグ: 取得できませんでした')
    }
  })
  
  console.log('\n=== Step 3: ランダムタグでのセンシティブ動画検証 ===')
  
  // 人気タグが取得できたジャンルからランダムに選択してテスト
  const genresWithTags = successfulGenres.filter(r => r.popularTags.length > 0)
  
  if (genresWithTags.length === 0) {
    console.log('人気タグが取得できたジャンルがありません。')
    return
  }
  
  const tagTestResults: TagTestResult[] = []
  
  // 5つのジャンルからランダムタグでテスト
  for (let i = 0; i < Math.min(5, genresWithTags.length); i++) {
    const randomGenre = genresWithTags[Math.floor(Math.random() * genresWithTags.length)]
    const randomTag = randomGenre.popularTags[Math.floor(Math.random() * randomGenre.popularTags.length)]
    
    console.log(`\nテスト${i+1}: ${randomGenre.name} × "${randomTag}"タグ`)
    
    try {
      const tagResult = await scrapeRankingViaProxy(randomGenre.genre, '24h', randomTag)
      
      // センシティブコンテンツの検出
      const hasSensitive = tagResult.items.some(item => 
        item.title?.includes('セックス') ||
        item.title?.includes('エロ') ||
        item.title?.includes('淫') ||
        item.title?.includes('sex') ||
        item.title?.includes('ASMR') ||
        item.title?.includes('おっぱい') ||
        item.title?.includes('パンツ') ||
        (item.title && /(?:下着|水着|巨乳|美女|セクシー|エッチ|18禁|機動戦士|グンダム|ガンダム|静電気|ドッキリ|タクヤ|GQuuuuuuX|ジークアクス)/i.test(item.title))
      )
      
      // タグ関連性の確認
      const tagRelated = tagResult.items.some(item => 
        item.title?.toLowerCase().includes(randomTag.toLowerCase()) ||
        (item.tags && item.tags.some((tag: string) => tag.toLowerCase().includes(randomTag.toLowerCase())))
      )
      
      const testResult: TagTestResult = {
        genre: randomGenre.genre,
        tag: randomTag,
        success: true,
        itemCount: tagResult.items.length,
        hasSensitive,
        sampleItems: tagResult.items.slice(0, 3)
      }
      
      tagTestResults.push(testResult)
      
      console.log(`  ✓ ${tagResult.items.length}件取得`)
      console.log(`  センシティブ動画: ${hasSensitive ? 'あり' : 'なし'}`)
      console.log(`  タグ関連性: ${tagRelated ? 'あり' : '不明'}`)
      
      if (tagResult.items.length > 0) {
        console.log(`  上位3件:`)
        tagResult.items.slice(0, 3).forEach((item, idx) => {
          console.log(`    ${idx+1}位: ${item.title}`)
        })
      }
      
    } catch (error) {
      const testResult: TagTestResult = {
        genre: randomGenre.genre,
        tag: randomTag,
        success: false,
        itemCount: 0,
        hasSensitive: false,
        sampleItems: [],
        error: String(error)
      }
      
      tagTestResults.push(testResult)
      console.log(`  ✗ エラー: ${error}`)
    }
    
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log('\n=== 最終結果サマリー ===')
  console.log(`対象ジャンル: ${ALL_GENRES.length}`)
  console.log(`取得成功ジャンル: ${successCount}`)
  console.log(`人気タグ取得ジャンル: ${genresWithTags.length}`)
  console.log(`タグ別ランキングテスト: ${tagTestResults.length}`)
  console.log(`センシティブ動画検出ジャンル: ${successfulGenres.filter(r => r.hasSensitive).length}`)
  console.log(`センシティブ動画検出タグテスト: ${tagTestResults.filter(r => r.hasSensitive).length}`)
  
  console.log('\n=== センシティブ動画を含むジャンル ===')
  successfulGenres.filter(r => r.hasSensitive).forEach(result => {
    console.log(`✓ ${result.name}: ${result.sampleItems[0]?.title}`)
  })
}

// 実行
testAllGenres().catch(error => {
  console.error('テスト実行エラー:', error)
  process.exit(1)
})