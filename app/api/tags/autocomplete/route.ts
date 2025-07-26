import { NextRequest, NextResponse } from 'next/server'

/**
 * タグオートコンプリートAPI（Next.js版）
 * ローカル開発環境用のAPIエンドポイント
 */

// モックタグデータ（開発・テスト用）
const MOCK_TAGS = [
  'ゲーム', 'ゲーム実況', 'ゲーム音楽', 'ゲームPV', 'ゲーム紹介',
  'アニメ', 'アニメOP', 'アニメED', 'アニメMAD', 'アニメソング',
  'VOCALOID', 'VOCALOID-Original', 'VOCALOID-Cover', 'VOCALOID新曲リンク',
  '音楽', '音楽・サウンド', '音ゲー', '音MAD',
  '歌ってみた', '歌い手', '歌', '歌謡曲',
  '踊ってみた', 'ダンス', 'ダンスロボットダンス',
  '実況プレイ', '実況プレイPart1リンク', '実況プレイ動画',
  '料理', '料理動画', '料理実況', '料理レシピ',
  'MMD', 'MMDドラマ', 'MMDアクション', 'MMD艦これ', 'MMD刀剣乱舞',
  '東方', '東方アレンジ', '東方手書き劇場', '東方MMD', '東方Project',
  'アイドルマスター', 'im@s架空戦記', 'iM@SノーマルPV', 'アイマス',
  '艦隊これくしょん', '艦これ', '艦これMMD', '艦これMAD',
  '刀剣乱舞', '刀剣乱舞MMD', '刀剣乱舞手描き', '刀剣乱舞MAD',
  'FGO', 'Fate/Grand_Order', 'Fate', 'FateMMD',
  'ポケモン', 'ポケットモンスター', 'ポケモン実況', 'ポケモンBGM',
  'マインクラフト', 'Minecraft', 'マイクラ', 'マイクラ実況',
  'スプラトゥーン', 'スプラトゥーン2', 'スプラトゥーン3', 'Splatoon',
  '技術', '技術・工学', 'ニコニコ技術部', 'プログラミング',
  '描いてみた', 'お絵かき', 'イラスト', 'デジタルアート',
  '作ってみた', 'ニコニコ手芸部', '手作り', 'DIY',
  'RTA', 'RTA in Japan', 'TAS', 'TAS動画',
  'バーチャルYouTuber', 'VTuber', 'にじさんじ', 'ホロライブ',
  'レトロゲーム', 'FC', 'SFC', 'PS', 'PS2', 'ゲームボーイ',
  'Nintendo_Switch', 'ニンテンドースイッチ', 'Switch', 'スイッチ'
]

interface TagAccumulationData {
  tags: string[]
  metadata: {
    version: number
    lastUpdated: string
    totalUniqueTags: number
    lastAccumulationSource: string
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const limit = parseInt(searchParams.get('limit') || '10')

    // クエリが空または2文字未満の場合は空の結果を返す
    if (!query || query.trim().length < 2) {
      return NextResponse.json({
        query,
        suggestions: [],
        metadata: {
          total: 0,
          source: 'query-too-short'
        }
      })
    }

    // プレフィックス検索を実行
    const lowerQuery = query.toLowerCase()
    const suggestions = MOCK_TAGS
      .filter(tag => tag.toLowerCase().startsWith(lowerQuery))
      .slice(0, limit)

    // レスポンスを構築
    const response = {
      query,
      suggestions,
      metadata: {
        total: suggestions.length,
        maxResults: limit,
        source: 'next-api-mock',
        lastUpdated: new Date().toISOString(),
        totalUniqueTags: MOCK_TAGS.length
      }
    }

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300' // 5分キャッシュ
      }
    })

  } catch (error) {
    console.error('Tag autocomplete error:', error)
    return NextResponse.json({
      query: '',
      suggestions: [],
      metadata: {
        total: 0,
        source: 'error',
        error: 'Internal server error'
      }
    }, {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      }
    })
  }
}