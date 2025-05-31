// 内部プロキシAPI - 例のソレジャンルへのアクセスを仲介

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const genre = searchParams.get('genre') || 'all'
    const term = searchParams.get('term') || 'hour'
    const tag = searchParams.get('tag')
    
    // URLを構築
    let targetUrl = `https://www.nicovideo.jp/ranking/genre/${genre}?term=${term}`
    if (tag) {
      targetUrl += `&tag=${encodeURIComponent(tag)}`
    }
    
    console.log(`[Proxy] Fetching: ${targetUrl}`)
    
    // ニコニコ動画にリクエスト
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        'Cookie': 'sensitive_material_status=accept',
        'Referer': 'https://www.nicovideo.jp/ranking',
        // プロキシ経由のヘッダー
        'X-Forwarded-For': '1.1.1.1', // 日本のIPに見せかける
        'X-Real-IP': '1.1.1.1'
      }
    })
    
    const html = await response.text()
    
    // server-responseメタタグを解析
    const serverResponseMatch = html.match(/name="server-response"\s+content="([^"]+)"/)
    
    if (!serverResponseMatch) {
      return NextResponse.json(
        { error: 'server-responseメタタグが見つかりません' },
        { status: 404 }
      )
    }
    
    // HTMLエンティティをデコード
    const decodedContent = serverResponseMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
    
    const serverData = JSON.parse(decodedContent)
    const rankingData = serverData.data?.response?.$getTeibanRanking?.data
    
    if (!rankingData) {
      return NextResponse.json(
        { error: 'ランキングデータが見つかりません' },
        { status: 404 }
      )
    }
    
    // レスポンスを整形
    const result = {
      genre: rankingData.label,
      genreId: rankingData.featuredKey,
      tag: rankingData.tag,
      requestedGenre: genre,
      isRedirected: rankingData.featuredKey !== genre,
      items: rankingData.items?.map((item: any, index: number) => ({
        rank: index + 1,
        id: item.id,
        title: item.title,
        thumbnail: item.thumbnail?.url || item.thumbnail?.middleUrl,
        views: item.count?.view || 0,
        comments: item.count?.comment || 0,
        mylists: item.count?.mylist || 0,
        likes: item.count?.like || 0,
        duration: item.duration,
        registeredAt: item.registeredAt,
        owner: {
          id: item.owner?.id,
          name: item.owner?.name,
          iconUrl: item.owner?.iconUrl
        }
      })) || []
    }
    
    // 例のソレジャンルへのアクセスがリダイレクトされたかチェック
    if (genre === 'd2um7mc4' && rankingData.featuredKey !== 'd2um7mc4') {
      console.log(`[Proxy] 警告: 例のソレジャンルが${rankingData.label}にリダイレクトされました`)
    }
    
    return NextResponse.json(result)
    
  } catch (error) {
    console.error('[Proxy] Error:', error)
    return NextResponse.json(
      { error: 'プロキシエラー', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// 代替アプローチ: タグベースでの取得
async function tryAlternativeApproach(genre: string, term: string, tag?: string) {
  console.log('[Proxy] 代替アプローチ: タグベースRSSを試行')
  
  // 例のソレジャンルの人気タグ
  const reiSoreTags = ['R-18', '紳士向け', 'MMD', 'ボイロAV']
  const targetTag = tag || reiSoreTags[0]
  
  try {
    const rssUrl = `https://www.nicovideo.jp/tag/${encodeURIComponent(targetTag)}?sort=h&rss=2.0`
    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    })
    
    if (response.ok) {
      const rssText = await response.text()
      
      // 簡易的なRSSパース
      const items: any[] = []
      const itemMatches = rssText.matchAll(/<item>([\s\S]*?)<\/item>/g)
      
      for (const match of itemMatches) {
        const itemXml = match[1]
        const title = itemXml.match(/<title>([^<]+)<\/title>/)?.[1] || ''
        const link = itemXml.match(/<link>([^<]+)<\/link>/)?.[1] || ''
        const videoId = link.match(/(sm|nm|so)\d+/)?.[0] || ''
        
        if (videoId) {
          items.push({
            rank: items.length + 1,
            id: videoId,
            title: title.replace(/<!\[CDATA\[|\]\]>/g, ''),
            views: 0,
            comments: 0,
            mylists: 0,
            likes: 0
          })
        }
        
        if (items.length >= 30) break
      }
      
      return NextResponse.json({
        genre: '例のソレ',
        genreId: 'd2um7mc4',
        tag: targetTag,
        requestedGenre: genre,
        isRedirected: false,
        items,
        source: 'tag-rss'
      })
    }
  } catch (error) {
    console.error('[Proxy] 代替アプローチエラー:', error)
  }
  
  // 最終的なフォールバック
  return NextResponse.json({
    genre: '総合',
    genreId: 'all',
    requestedGenre: genre,
    isRedirected: true,
    items: [],
    error: '例のソレジャンルのデータ取得に失敗しました'
  })
}