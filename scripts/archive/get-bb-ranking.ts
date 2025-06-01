#!/usr/bin/env tsx

// 「その他」ジャンル × 「BB先輩シリーズ」タグの人気ランキング上位10位を取得

import { scrapeRankingViaProxy } from '../lib/proxy-scraper'

async function getBBRanking(): Promise<void> {
  console.log('=== 「その他」ジャンル × 「BB先輩シリーズ」タグ ランキング ===')
  
  // ローカルテスト用環境変数設定
  process.env.VERCEL_URL = 'localhost:8888'
  process.env.INTERNAL_PROXY_KEY = 'test-key'
  
  try {
    console.log('データ取得中...')
    const result = await scrapeRankingViaProxy('other', '24h', 'BB先輩シリーズ')
    
    console.log(`\n✅ 取得成功: ${result.items.length}件`)
    console.log('📅 期間: 24時間ランキング')
    console.log('🏷️ タグ: BB先輩シリーズ')
    console.log('📂 ジャンル: その他')
    
    console.log('\n=== 📊 TOP 10 ランキング ===')
    
    result.items.slice(0, 10).forEach((item, index) => {
      const rank = index + 1
      console.log(`\n${rank}位: ${item.title}`)
      console.log(`     動画ID: ${item.id}`)
      console.log(`     再生数: ${item.views?.toLocaleString() || '不明'}回`)
      
      if (item.comments) {
        console.log(`     コメント: ${item.comments.toLocaleString()}件`)
      }
      if (item.mylists) {
        console.log(`     マイリスト: ${item.mylists.toLocaleString()}件`)
      }
      if (item.likes) {
        console.log(`     いいね: ${item.likes.toLocaleString()}件`)
      }
      if (item.authorName) {
        console.log(`     投稿者: ${item.authorName}`)
      }
      if (item.registeredAt) {
        console.log(`     投稿日時: ${item.registeredAt}`)
      }
    })
    
    // BB先輩関連の動画を特別に表示
    const bbRelatedVideos = result.items.filter(item => 
      item.title && /(?:BB|先輩|ホモ|淫夢|例のアレ)/i.test(item.title)
    )
    
    if (bbRelatedVideos.length > 0) {
      console.log(`\n=== 🎯 BB先輩・淫夢関連動画 (${bbRelatedVideos.length}件検出) ===`)
      bbRelatedVideos.slice(0, 5).forEach((item, index) => {
        const originalRank = result.items.findIndex(rankItem => rankItem.id === item.id) + 1
        console.log(`${originalRank}位: ${item.title}`)
      })
    }
    
    // センシティブ動画の検出
    const sensitiveVideos = result.items.filter(item => 
      item.title?.includes('セックス') ||
      item.title?.includes('エロ') ||
      item.title?.includes('淫') ||
      item.title?.includes('sex') ||
      (item.title && /(?:下着|水着|巨乳|美女|セクシー|エッチ|18禁)/i.test(item.title))
    )
    
    if (sensitiveVideos.length > 0) {
      console.log(`\n=== 🔞 センシティブコンテンツ (${sensitiveVideos.length}件検出) ===`)
      sensitiveVideos.slice(0, 3).forEach((item, index) => {
        const originalRank = result.items.findIndex(rankItem => rankItem.id === item.id) + 1
        console.log(`${originalRank}位: ${item.title}`)
      })
    }
    
    // 統計情報
    const totalViews = result.items.reduce((sum, item) => sum + (item.views || 0), 0)
    const avgViews = Math.round(totalViews / result.items.length)
    
    console.log('\n=== 📈 統計情報 ===')
    console.log(`総再生数: ${totalViews.toLocaleString()}回`)
    console.log(`平均再生数: ${avgViews.toLocaleString()}回`)
    console.log(`最高再生数: ${Math.max(...result.items.map(item => item.views || 0)).toLocaleString()}回`)
    console.log(`最低再生数: ${Math.min(...result.items.map(item => item.views || 0)).toLocaleString()}回`)
    
  } catch (error) {
    console.error('❌ エラーが発生しました:', error)
  }
}

getBBRanking().catch(console.error)