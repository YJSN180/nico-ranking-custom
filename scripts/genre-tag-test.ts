#!/usr/bin/env tsx

// 各ジャンルの代表的なタグを使ってプロキシ経由でのセンシティブ動画確認

import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

// 各ジャンルの代表的なタグ（ニコニコ動画でよく使われるもの）
const GENRE_TAGS = {
  'all': ['ゲーム', 'VOCALOID', 'アニメ', '実況プレイ動画', '音楽', 'ゆっくり実況プレイ'],
  'entertainment': ['歌ってみた', 'バラエティ', 'エンターテイメント', 'お笑い', 'コメディ', 'パフォーマンス'],
  'game': ['マインクラフト', 'ポケモン', 'ゆっくり実況', 'ゲーム実況', 'Steam', 'RPG'],
  'anime': ['アニメ', 'MAD', 'AMV', 'アニソン', 'オープニング', 'エンディング'],
  'music_sound': ['VOCALOID', '初音ミク', '歌ってみた', 'ボカロオリジナル曲', '音楽', 'オリジナル曲'],
  'dance': ['踊ってみた', 'ダンス', 'MMD', 'ボカロダンス', 'カバーダンス', 'K-POP'],
  'animal': ['猫', '犬', 'ペット', '動物', 'かわいい', '癒し'],
  'nature': ['自然', '風景', '動物', '植物', 'ドキュメンタリー', '野生動物'],
  'cooking': ['料理', 'レシピ', 'グルメ', 'お菓子作り', 'クッキング', '食べ物'],
  'traveling': ['旅行', '観光', '海外', '温泉', 'ドライブ', '風景'],
  'vehicle': ['車', 'バイク', '電車', '飛行機', '自動車', '乗り物'],
  'sports': ['野球', 'サッカー', 'スポーツ', 'オリンピック', 'プロ野球', 'Jリーグ'],
  'society_politics_news': ['ニュース', '政治', '経済', '社会', '時事', '報道'],
  'technology_craft': ['技術', '工作', 'DIY', 'プログラミング', '電子工作', '科学'],
  'lecture': ['講座', '解説', '教育', '授業', '学習', 'チュートリアル'],
  'history': ['歴史', '戦国', '幕末', '世界史', '日本史', '古代'],
  'science': ['科学', '実験', '物理', '化学', '生物', 'テクノロジー'],
  'radio': ['ラジオ', '音声', 'トーク', '朗読', 'ASMR', 'ボイス'],
  'other': ['その他', '雑談', 'VLOG', '日記', 'ライフスタイル', '趣味'],
  'are': ['R-18', 'アダルト', 'セクシー', '18禁', '大人向け', 'エロ']
}

interface TagTestResult {
  genre: string
  genreName: string
  tag: string
  success: boolean
  itemCount: number
  hasSensitive: boolean
  hasTargetSensitive: boolean
  sampleTitles: string[]
  error?: string
  responseTime: number
}

async function testGenreTagCombinations(): Promise<void> {
  console.log('=== ジャンル × タグの組み合わせテスト ===')
  
  // ローカルテスト用環境変数設定
  process.env.VERCEL_URL = 'localhost:8888'
  process.env.INTERNAL_PROXY_KEY = 'test-key'
  
  const results: TagTestResult[] = []
  
  // 各ジャンルから1つのタグをランダムに選択してテスト
  const genreNames = {
    'all': '総合',
    'entertainment': 'エンタメ・音楽', 
    'game': 'ゲーム',
    'anime': 'アニメ',
    'music_sound': '音楽・サウンド',
    'dance': 'ダンス',
    'animal': '動物',
    'nature': '自然',
    'cooking': '料理',
    'traveling': '旅行・アウトドア',
    'vehicle': 'vehicle・乗り物',
    'sports': 'スポーツ',
    'society_politics_news': '社会・政治・時事',
    'technology_craft': '技術・工作',
    'lecture': '解説・講座',
    'history': '歴史',
    'science': '科学・技術',
    'radio': 'ニコニコ動画講座',
    'other': 'その他',
    'are': 'R-18'
  }
  
  console.log(`テスト対象: ${Object.keys(GENRE_TAGS).length}ジャンル`)
  
  for (const [genre, tags] of Object.entries(GENRE_TAGS)) {
    // ランダムにタグを選択
    const randomTag = tags[Math.floor(Math.random() * tags.length)]
    const genreName = genreNames[genre as keyof typeof genreNames] || genre
    
    console.log(`\n${genreName}(${genre}) × "${randomTag}"タグ`)
    
    const startTime = Date.now()
    
    try {
      const result = await scrapeRankingViaProxy(genre, '24h', randomTag)
      const responseTime = Date.now() - startTime
      
      // センシティブコンテンツの検出
      const hasSensitive = result.items.some(item => 
        item.title?.includes('セックス') ||
        item.title?.includes('エロ') ||
        item.title?.includes('淫') ||
        item.title?.includes('sex') ||
        item.title?.includes('ASMR') ||
        item.title?.includes('おっぱい') ||
        item.title?.includes('パンツ') ||
        (item.title && /(?:下着|水着|巨乳|美女|セクシー|エッチ|18禁)/i.test(item.title))
      )
      
      // 特定のセンシティブ動画（機動戦士ガンダム、静電気ドッキリ）の検出
      const hasTargetSensitive = result.items.some(item => 
        (item.title && /(?:機動戦士|グンダム|ガンダム|GQuuuuuuX|ジークアクス|静電気|ドッキリ|タクヤ)/i.test(item.title))
      )
      
      // タグ関連性の確認
      const tagRelated = result.items.some(item => 
        item.title?.toLowerCase().includes(randomTag.toLowerCase())
      )
      
      const testResult: TagTestResult = {
        genre,
        genreName,
        tag: randomTag,
        success: true,
        itemCount: result.items.length,
        hasSensitive,
        hasTargetSensitive,
        sampleTitles: result.items.slice(0, 3).map(item => item.title || ''),
        responseTime
      }
      
      results.push(testResult)
      
      console.log(`  ✓ ${result.items.length}件取得 (${responseTime}ms)`)
      console.log(`  タグ関連性: ${tagRelated ? 'あり' : '不明'}`)
      console.log(`  センシティブ動画: ${hasSensitive ? 'あり' : 'なし'}`)
      console.log(`  ターゲット動画: ${hasTargetSensitive ? 'あり' : 'なし'}`)
      
      if (result.items.length > 0) {
        console.log(`  上位3件:`)
        result.items.slice(0, 3).forEach((item, idx) => {
          console.log(`    ${idx+1}位: ${item.title}`)
        })
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime
      const testResult: TagTestResult = {
        genre,
        genreName,
        tag: randomTag,
        success: false,
        itemCount: 0,
        hasSensitive: false,
        hasTargetSensitive: false,
        sampleTitles: [],
        error: String(error),
        responseTime
      }
      
      results.push(testResult)
      console.log(`  ✗ エラー: ${error}`)
    }
    
    // レート制限回避
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  
  console.log('\n=== 結果サマリー ===')
  const successCount = results.filter(r => r.success).length
  const sensitiveCount = results.filter(r => r.hasSensitive).length
  const targetSensitiveCount = results.filter(r => r.hasTargetSensitive).length
  const avgResponseTime = results.reduce((sum, r) => sum + r.responseTime, 0) / results.length
  
  console.log(`成功率: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`)
  console.log(`センシティブ動画検出: ${sensitiveCount}/${successCount} (${successCount > 0 ? Math.round(sensitiveCount/successCount*100) : 0}%)`)
  console.log(`ターゲット動画検出: ${targetSensitiveCount}/${successCount} (${successCount > 0 ? Math.round(targetSensitiveCount/successCount*100) : 0}%)`)
  console.log(`平均応答時間: ${Math.round(avgResponseTime)}ms`)
  
  console.log('\n=== センシティブ動画を含むテスト ===')
  results.filter(r => r.hasSensitive).forEach(result => {
    console.log(`✓ ${result.genreName} × ${result.tag}: ${result.sampleTitles[0]}`)
  })
  
  if (targetSensitiveCount > 0) {
    console.log('\n=== ターゲット動画を含むテスト ===')
    results.filter(r => r.hasTargetSensitive).forEach(result => {
      const targetTitles = result.sampleTitles.filter(title => 
        /(?:機動戦士|グンダム|ガンダム|GQuuuuuuX|ジークアクス|静電気|ドッキリ|タクヤ)/i.test(title)
      )
      console.log(`✓ ${result.genreName} × ${result.tag}: ${targetTitles[0] || result.sampleTitles[0]}`)
    })
  }
  
  console.log('\n=== 失敗したテスト ===')
  const failedResults = results.filter(r => !r.success)
  if (failedResults.length > 0) {
    failedResults.forEach(result => {
      console.log(`✗ ${result.genreName} × ${result.tag}: ${result.error}`)
    })
  } else {
    console.log('すべてのテストが成功しました！')
  }
}

testGenreTagCombinations().catch(console.error)