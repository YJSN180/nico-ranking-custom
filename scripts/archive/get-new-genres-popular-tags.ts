#!/usr/bin/env tsx

// 新しく追加したラジオ、動物、スポーツジャンルの人気タグを取得

import { fetchRanking } from '../lib/complete-hybrid-scraper'

async function getPopularTagsForNewGenres() {
  const newGenres = [
    { id: 'oxzi6bje', name: 'ラジオ' },
    { id: 'ne72lua2', name: '動物' },
    { id: '4w3p65pf', name: 'スポーツ' }
  ]

  for (const genre of newGenres) {
    console.log(`\n=== ${genre.name}ジャンルの人気タグ取得 ===`)
    
    try {
      // ランキングデータを取得
      const data = await fetchRanking(genre.id, null, '24h')
      
      console.log(`取得成功: ${data.items.length}件の動画`)
      console.log(`ジャンルラベル: ${data.label}`)
      
      // HTML抽出による人気タグ
      if (data.popularTags && data.popularTags.length > 0) {
        console.log('\n人気タグ（HTML抽出）:')
        data.popularTags.forEach((tag, idx) => {
          console.log(`  ${idx + 1}. ${tag}`)
        })
      } else {
        console.log('\n人気タグ（HTML抽出）: 見つかりませんでした')
      }
      
      // 動画のタグを集計して人気タグを推測
      const tagCounts: Record<string, number> = {}
      
      // 各動画のタイトルから頻出ワードを抽出（簡易的なタグ推測）
      data.items.forEach(item => {
        // タイトルから2文字以上の単語を抽出
        const words = item.title.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]{2,}|[a-zA-Z0-9]{3,}/g) || []
        
        words.forEach(word => {
          // 一般的すぎる単語は除外
          if (!['です', 'ます', 'した', 'する', 'なる', 'ある', 'いる', 'くる', 'いく'].includes(word)) {
            tagCounts[word] = (tagCounts[word] || 0) + 1
          }
        })
      })
      
      // 出現回数順にソート
      const sortedTags = Object.entries(tagCounts)
        .filter(([_, count]) => count >= 3) // 3回以上出現
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
      
      console.log('\n推測される人気タグ（タイトル分析）:')
      sortedTags.forEach(([tag, count], idx) => {
        console.log(`  ${idx + 1}. ${tag} (${count}回)`)
      })
      
      // サンプル動画タイトルを表示
      console.log('\nサンプル動画（上位5件）:')
      data.items.slice(0, 5).forEach(item => {
        console.log(`  ${item.rank}位: ${item.title}`)
      })
      
    } catch (error) {
      console.error(`エラー: ${error}`)
    }
    
    // レート制限対策
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
}

// 実行
console.log('新ジャンル（ラジオ、動物、スポーツ）の人気タグを取得します...')
getPopularTagsForNewGenres().catch(console.error)