#!/usr/bin/env tsx

// デプロイされたサイトや実際のニコニコ動画から人気タグを取得

import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

async function getPopularTagsForGenre(genre: string): Promise<void> {
  console.log(`=== 「${genre}」ジャンルの人気タグ取得 ===`)
  
  // ローカルプロキシサーバー設定
  process.env.VERCEL_URL = 'localhost:8888'
  process.env.INTERNAL_PROXY_KEY = 'test-key'
  
  try {
    // プロキシ経由でデータ取得
    const result = await scrapeRankingViaProxy(genre, '24h')
    
    console.log(`取得アイテム数: ${result.items.length}`)
    console.log(`人気タグ数: ${result.popularTags?.length || 0}`)
    
    if (result.popularTags && result.popularTags.length > 0) {
      console.log('\n=== 人気タグ一覧 ===')
      result.popularTags.forEach((tag, index) => {
        console.log(`${index + 1}. ${tag}`)
      })
    } else {
      console.log('\n人気タグが取得できませんでした。')
    }
    
    // 直接HTMLを解析して人気タグを探す
    console.log('\n=== 直接HTML解析による人気タグ検索 ===')
    
    const response = await fetch('http://localhost:8888/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': 'test-key',
      },
      body: JSON.stringify({
        url: `https://www.nicovideo.jp/ranking/genre/${genre}?term=24h`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'ja',
          'Cookie': 'sensitive_material_status=accept',
        }
      }),
    })

    const proxyData = await response.json()
    const html = proxyData.body
    
    // HTMLからタグらしき文字列を広範囲に検索
    const possibleTags: string[] = []
    
    // 動画タイトルから一般的なタグを抽出
    const videoTitles = result.items.map(item => item.title).filter(Boolean)
    const commonWords = extractCommonWords(videoTitles)
    
    console.log('\n=== 動画タイトルから抽出した共通ワード ===')
    commonWords.slice(0, 20).forEach((word, index) => {
      console.log(`${index + 1}. ${word}`)
    })
    
    // ニコニコ動画の既知の人気タグ（その他ジャンル用）
    if (genre === 'other') {
      const knownOtherTags = [
        'その他', 'VLOG', '日記', 'ライフスタイル', '趣味', '雑談',
        'ペット', '日常', 'レビュー', 'unboxing', '開封',
        'DIY', '手作り', 'ハンドメイド', 'クラフト',
        'ガジェット', 'レトロ', 'コレクション', 'フィギュア',
        '鉄道', '模型', 'プラモデル', 'ドール',
        'ASMR', '癒し', 'リラックス', '睡眠',
        '投稿者コメント', 'ゆっくり解説', 'ボイロ解説',
        'VTuber', 'バーチャルYouTuber', 'ホロライブ', 'にじさんじ'
      ]
      
      console.log('\n=== その他ジャンルの既知の人気タグ ===')
      knownOtherTags.forEach((tag, index) => {
        console.log(`${index + 1}. ${tag}`)
      })
    }
    
  } catch (error) {
    console.error('エラー:', error)
  }
}

// 動画タイトルから共通ワードを抽出
function extractCommonWords(titles: string[]): string[] {
  const wordCounts: Record<string, number> = {}
  
  titles.forEach(title => {
    // 日本語の単語を抽出（簡易版）
    const words = title.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]+|[a-zA-Z]+/g) || []
    
    words.forEach(word => {
      if (word.length >= 2 && word.length <= 20) {
        wordCounts[word] = (wordCounts[word] || 0) + 1
      }
    })
  })
  
  // 出現回数でソート
  return Object.entries(wordCounts)
    .filter(([word, count]) => count >= 2) // 2回以上出現
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
}

// 実行
const genre = process.argv[2] || 'other'
getPopularTagsForGenre(genre).catch(console.error)