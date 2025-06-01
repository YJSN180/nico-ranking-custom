// 例のソレジャンルのランキング実装（Supabase使用）

import { createClient } from '@supabase/supabase-js'

// Supabaseクライアントの初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Supabase設定の検証
function isSupabaseConfigured(): boolean {
  return !!(supabaseUrl && supabaseAnonKey)
}

// データベース型定義
interface VideoData {
  id: string
  content_id: string
  title: string
  view_count: number
  comment_count: number
  mylist_count: number
  like_count: number
  upload_time: string
  thumbnail_url?: string
  owner_name?: string
  owner_id?: string
  genre: string
  tags: string[]
  updated_at: string
}

interface RankingScore {
  video_id: string
  score: number
  rank_type: 'hourly' | 'daily'
  calculated_at: string
}

// ランキングスコア計算
export function calculateRankingScore(
  video: VideoData,
  rankingType: 'hourly' | 'daily' = 'daily'
): number {
  // 基本スコア（いいねを最重視）
  const baseScore = 
    video.view_count +
    (video.comment_count * 15) +    // コメントの重み
    (video.mylist_count * 25) +     // マイリストの重み
    (video.like_count * 40);        // いいねの重み（最重要）
  
  // エンゲージメント率ボーナス
  const likeRate = video.like_count / Math.max(video.view_count, 1);
  const commentRate = video.comment_count / Math.max(video.view_count, 1);
  const engagementBonus = 1 + (likeRate * 15) + (commentRate * 5);
  
  // 時間要素
  const hoursOld = (Date.now() - new Date(video.upload_time).getTime()) / (1000 * 60 * 60);
  
  // 毎時ランキング：新着ブースト重視（最大30日前まで）
  if (rankingType === 'hourly') {
    const freshnessBoost = hoursOld < 24 ? 3.0 : hoursOld < 168 ? 1.5 : 1.0;
    const timeDecay = hoursOld > 720 ? 0.1 : Math.pow(0.95, Math.min(hoursOld / 24, 30)); // 30日以上前は大幅減衰
    return baseScore * engagementBonus * freshnessBoost * timeDecay;
  }
  
  // 24時間ランキング：バランス型（最大90日前まで）
  else {
    const timeDecay = hoursOld > 2160 ? 0.05 : Math.pow(0.98, Math.min(hoursOld / 168, 12)); // 90日以上前は大幅減衰
    return baseScore * engagementBonus * timeDecay;
  }
}

// スナップショットAPIから例のソレ動画を取得
export async function fetchReiSoreVideos(): Promise<VideoData[]> {
  const reisoreTags = ['R-18', 'ボイロAV', '紳士向け', 'MMD', 'エロゲ', '巨乳']
  const allVideos: VideoData[] = []
  
  for (const tag of reisoreTags) {
    const url = `https://snapshot.search.nicovideo.jp/api/v2/snapshot/video/contents/search?` +
      `q=${encodeURIComponent(tag)}&` +
      `targets=tagsExact&` +
      `fields=contentId,title,viewCounter,commentCounter,mylistCounter,likeCounter,thumbnailUrl,startTime,genre,tags,userId&` +
      `_sort=-viewCounter&` +
      `_limit=100`
    
    try {
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.data) {
        // 例のソレジャンルの動画のみフィルター
        const reisoreVideos = data.data
          .filter((video: any) => video.genre === '例のソレ')
          .map((video: any) => ({
            id: video.contentId,
            content_id: video.contentId,
            title: video.title,
            view_count: video.viewCounter || 0,
            comment_count: video.commentCounter || 0,
            mylist_count: video.mylistCounter || 0,
            like_count: video.likeCounter || 0,
            upload_time: video.startTime,
            thumbnail_url: video.thumbnailUrl,
            owner_name: video.userId,  // userNicknameは利用不可
            owner_id: video.userId,
            genre: '例のソレ',
            tags: video.tags ? video.tags.split(' ') : [],
            updated_at: new Date().toISOString()
          }))
        
        allVideos.push(...reisoreVideos)
      }
    } catch (error) {
    }
  }
  
  // 重複を除去
  const uniqueVideos = Array.from(
    new Map(allVideos.map(v => [v.content_id, v])).values()
  )
  
  return uniqueVideos
}

// Supabaseへのデータ保存と更新
export async function updateReiSoreRanking() {
  if (!isSupabaseConfigured()) {
    return
  }
  
  const supabase = createClient(supabaseUrl!, supabaseAnonKey!)
  
  
  // 1. 最新の動画データを取得
  const videos = await fetchReiSoreVideos()
  
  if (videos.length === 0) {
    return
  }
  
  // 2. Supabaseに動画データを保存/更新
  const { error: videoError } = await supabase
    .from('rei_sore_videos')
    .upsert(videos, { 
      onConflict: 'content_id',
      ignoreDuplicates: false 
    })
  
  if (videoError) {
    return
  }
  
  // 3. ランキングスコアを計算
  const hourlyScores: RankingScore[] = []
  const dailyScores: RankingScore[] = []
  
  videos.forEach(video => {
    hourlyScores.push({
      video_id: video.content_id,
      score: calculateRankingScore(video, 'hourly'),
      rank_type: 'hourly',
      calculated_at: new Date().toISOString()
    })
    
    dailyScores.push({
      video_id: video.content_id,
      score: calculateRankingScore(video, 'daily'),
      rank_type: 'daily',
      calculated_at: new Date().toISOString()
    })
  })
  
  // 4. ランキングスコアを保存
  const { error: scoreError } = await supabase
    .from('rei_sore_ranking_scores')
    .upsert([...hourlyScores, ...dailyScores], {
      onConflict: 'video_id,rank_type'
    })
  
  if (scoreError) {
    return
  }
  
}

// ランキングの取得
export async function getReiSoreRanking(
  rankingType: 'hourly' | 'daily' = 'daily',
  limit: number = 100
) {
  if (!isSupabaseConfigured()) {
    // フォールバック: Snapshot APIから直接取得
    const videos = await fetchReiSoreVideos()
    const rankedVideos = videos
      .map(video => ({
        video,
        score: calculateRankingScore(video, rankingType)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    
    return rankedVideos.map((item, index) => ({
      rank: index + 1,
      id: item.video.content_id,
      title: item.video.title,
      thumbnail: item.video.thumbnail_url,
      views: item.video.view_count,
      comments: item.video.comment_count,
      mylists: item.video.mylist_count,
      likes: item.video.like_count,
      owner: item.video.owner_name,
      tags: item.video.tags,
      score: Math.floor(item.score)
    }))
  }
  
  const supabase = createClient(supabaseUrl!, supabaseAnonKey!)
  
  // スコアと動画情報を結合して取得
  const { data, error } = await supabase
    .from('rei_sore_ranking_scores')
    .select(`
      score,
      rei_sore_videos!inner (
        content_id,
        title,
        view_count,
        comment_count,
        mylist_count,
        like_count,
        upload_time,
        thumbnail_url,
        owner_name,
        tags
      )
    `)
    .eq('rank_type', rankingType)
    .order('score', { ascending: false })
    .limit(limit)
  
  if (error) {
    // エラー時はフォールバック
    const videos = await fetchReiSoreVideos()
    const rankedVideos = videos
      .map(video => ({
        video,
        score: calculateRankingScore(video, rankingType)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
    
    return rankedVideos.map((item, index) => ({
      rank: index + 1,
      id: item.video.content_id,
      title: item.video.title,
      thumbnail: item.video.thumbnail_url,
      views: item.video.view_count,
      comments: item.video.comment_count,
      mylists: item.video.mylist_count,
      likes: item.video.like_count,
      owner: item.video.owner_name,
      tags: item.video.tags,
      score: Math.floor(item.score)
    }))
  }
  
  // ランキング形式に整形
  // @ts-ignore - Supabaseの型定義の問題
  return (data as any[]).map((item: any, index: number) => ({
    rank: index + 1,
    id: item.rei_sore_videos.content_id,
    title: item.rei_sore_videos.title,
    thumbnail: item.rei_sore_videos.thumbnail_url,
    views: item.rei_sore_videos.view_count,
    comments: item.rei_sore_videos.comment_count,
    mylists: item.rei_sore_videos.mylist_count,
    likes: item.rei_sore_videos.like_count,
    owner: item.rei_sore_videos.owner_name,
    tags: item.rei_sore_videos.tags,
    score: Math.floor(item.score)
  }))
}

// 定期更新のためのcron関数
export async function cronUpdateReiSoreRanking() {
  try {
    await updateReiSoreRanking()
    return { success: true }
  } catch (error) {
    return { success: false, error }
  }
}