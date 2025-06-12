/**
 * Cloudflare Workers Cron - ランキングデータ取得ワーカー
 * 
 * 30秒のCPU時間制限に対応するための段階的な処理を実装
 * Phase 1: 基本ランキングの取得（タグなし）
 * Phase 2: 人気タグの集計
 * Phase 3: 重要なタグランキングの取得
 */

import type { RankingItem } from '@/types/ranking'

// Worker環境の型定義
interface Env {
  RANKING_DATA: KVNamespace
  RANKING_QUEUE: Queue<RankingTask>
  RANKING_PROCESSOR: DurableObjectNamespace
  CRON_SECRET: string
  GITHUB_TOKEN?: string
}

// タスクの型定義
interface RankingTask {
  type: 'fetch_basic' | 'fetch_tags' | 'aggregate_tags'
  genre: string
  period: '24h' | 'hour'
  page?: number
  retryCount?: number
}

// フェーズ管理用の型
interface ProcessingPhase {
  phase: 'basic' | 'tags' | 'complete'
  startedAt: string
  completedGenres: string[]
  failedGenres: string[]
}

// Cronトリガーのハンドラー
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // 処理開始時刻を記録
    const startTime = Date.now()
    const executionId = `cron-${startTime}`
    
    console.log(`[${executionId}] Starting ranking update cron job`)
    
    try {
      // 現在の処理フェーズを確認
      const phaseKey = 'processing-phase'
      const currentPhase = await env.RANKING_DATA.get<ProcessingPhase>(phaseKey, { type: 'json' })
      
      if (currentPhase && isPhaseActive(currentPhase)) {
        console.log(`[${executionId}] Previous phase still active, skipping`)
        return
      }
      
      // Phase 1: 基本ランキングの取得を開始
      await startPhase1(env, ctx, executionId)
      
    } catch (error) {
      console.error(`[${executionId}] Cron job failed:`, error)
      
      // エラー時はGitHub Actionsへフォールバック通知
      if (env.GITHUB_TOKEN) {
        await notifyGitHubActions(env.GITHUB_TOKEN, 'cron_failed', { error: String(error) })
      }
    }
  },
  
  // Queueハンドラー（非同期タスク処理）
  async queue(batch: MessageBatch<RankingTask>, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      try {
        await processRankingTask(message.body, env, ctx)
        message.ack()
      } catch (error) {
        console.error('Task processing failed:', error)
        
        // リトライ処理
        if ((message.body.retryCount || 0) < 3) {
          await env.RANKING_QUEUE.send({
            ...message.body,
            retryCount: (message.body.retryCount || 0) + 1
          }, { delaySeconds: 60 })
        }
        
        message.retry()
      }
    }
  }
}

// Phase 1: 基本ランキングの取得（タグなし、高速）
async function startPhase1(env: Env, ctx: ExecutionContext, executionId: string) {
  const genres = ['all', 'game', 'entertainment', 'other', 'technology', 'anime', 'voicesynthesis']
  const periods: ('24h' | 'hour')[] = ['24h', 'hour']
  
  // フェーズ情報を保存
  const phase: ProcessingPhase = {
    phase: 'basic',
    startedAt: new Date().toISOString(),
    completedGenres: [],
    failedGenres: []
  }
  
  await env.RANKING_DATA.put('processing-phase', JSON.stringify(phase), {
    expirationTtl: 3600 // 1時間後に自動削除
  })
  
  // 各ジャンル・期間のタスクをキューに追加
  const tasks: RankingTask[] = []
  for (const genre of genres) {
    for (const period of periods) {
      tasks.push({
        type: 'fetch_basic',
        genre,
        period
      })
    }
  }
  
  // バッチでキューに送信
  await env.RANKING_QUEUE.sendBatch(tasks.map(task => ({ body: task })))
  
  console.log(`[${executionId}] Phase 1 started: ${tasks.length} tasks queued`)
}

// ランキングタスクの処理
async function processRankingTask(task: RankingTask, env: Env, ctx: ExecutionContext) {
  const startTime = Date.now()
  
  switch (task.type) {
    case 'fetch_basic':
      await fetchBasicRanking(task, env)
      break
    case 'fetch_tags':
      await fetchTagRanking(task, env)
      break
    case 'aggregate_tags':
      await aggregatePopularTags(task, env)
      break
  }
  
  const duration = Date.now() - startTime
  console.log(`Task completed in ${duration}ms:`, task)
}

// 基本ランキングの取得（軽量版）
async function fetchBasicRanking(task: RankingTask, env: Env) {
  const { genre, period } = task
  const url = `https://www.nicovideo.jp/ranking/genre/${getGenreId(genre)}?term=${period}`
  
  // Googlebot UAでフェッチ
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ja'
    }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to fetch ranking: ${response.status}`)
  }
  
  const html = await response.text()
  const items = parseBasicRankingItems(html)
  
  // KVに保存（圧縮して保存）
  const key = `ranking-${genre}-${period}`
  const data = {
    items: items.slice(0, 100), // 最初の100件のみ
    popularTags: [], // Phase 2で追加
    updatedAt: new Date().toISOString()
  }
  
  // 圧縮してサイズを削減
  const compressed = await compressData(JSON.stringify(data))
  await env.RANKING_DATA.put(key, compressed, {
    expirationTtl: 3600, // 1時間
    metadata: {
      compressed: true,
      size: compressed.length
    }
  })
  
  // フェーズ進行状況を更新
  await updatePhaseProgress(env, 'basic', genre, period, true)
}

// 基本的なランキングアイテムのパース（高速版）
function parseBasicRankingItems(html: string): RankingItem[] {
  const items: RankingItem[] = []
  
  // server-responseメタタグからJSON抽出
  const metaMatch = html.match(/<meta name="server-response" content="([^"]+)"/)
  if (!metaMatch) return items
  
  try {
    const encodedData = metaMatch[1]!
    const decodedData = encodedData
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
    
    const serverData = JSON.parse(decodedData)
    const rankingItems = serverData.data?.response?.$getTeibanRanking?.data?.items || []
    
    return rankingItems.map((item: any, index: number) => ({
      rank: index + 1,
      id: item.id,
      title: item.title,
      thumbURL: item.thumbnail?.url || '',
      views: item.count?.view || 0,
      comments: item.count?.comment || 0,
      mylists: item.count?.mylist || 0,
      likes: item.count?.like || 0,
      tags: [], // Phase 2で追加
      registeredAt: item.registeredAt
    }))
  } catch (error) {
    console.error('Failed to parse ranking items:', error)
    return items
  }
}

// データ圧縮（gzip）
async function compressData(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const stream = new Response(encoder.encode(data)).body!
    .pipeThrough(new CompressionStream('gzip'))
  
  const compressed = await new Response(stream).arrayBuffer()
  return btoa(String.fromCharCode(...new Uint8Array(compressed)))
}

// データ解凍
async function decompressData(compressed: string): Promise<string> {
  const binary = atob(compressed)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  
  const stream = new Response(bytes).body!
    .pipeThrough(new DecompressionStream('gzip'))
  
  const decompressed = await new Response(stream).text()
  return decompressed
}

// フェーズ進行状況の更新
async function updatePhaseProgress(
  env: Env, 
  phase: 'basic' | 'tags' | 'complete',
  genre: string,
  period: string,
  success: boolean
) {
  const phaseData = await env.RANKING_DATA.get<ProcessingPhase>('processing-phase', { type: 'json' })
  if (!phaseData) return
  
  const key = `${genre}-${period}`
  
  if (success) {
    if (!phaseData.completedGenres.includes(key)) {
      phaseData.completedGenres.push(key)
    }
  } else {
    if (!phaseData.failedGenres.includes(key)) {
      phaseData.failedGenres.push(key)
    }
  }
  
  await env.RANKING_DATA.put('processing-phase', JSON.stringify(phaseData), {
    expirationTtl: 3600
  })
  
  // すべて完了したら次のフェーズへ
  const totalExpected = 7 * 2 // 7ジャンル × 2期間
  if (phaseData.completedGenres.length + phaseData.failedGenres.length >= totalExpected) {
    await startNextPhase(env, phase)
  }
}

// 次のフェーズを開始
async function startNextPhase(env: Env, currentPhase: 'basic' | 'tags' | 'complete') {
  if (currentPhase === 'basic') {
    // Phase 2: 人気タグの集計
    await env.RANKING_QUEUE.send({
      type: 'aggregate_tags',
      genre: 'all',
      period: '24h'
    })
  } else if (currentPhase === 'tags') {
    // 完了通知
    await env.RANKING_DATA.delete('processing-phase')
    console.log('All phases completed successfully')
  }
}

// フェーズがアクティブかチェック
function isPhaseActive(phase: ProcessingPhase): boolean {
  const startedAt = new Date(phase.startedAt).getTime()
  const now = Date.now()
  const elapsed = now - startedAt
  
  // 30分以上経過していたら非アクティブとみなす
  return elapsed < 30 * 60 * 1000
}

// ジャンルIDのマッピング
function getGenreId(genre: string): string {
  const mapping: Record<string, string> = {
    'all': 'all',
    'entertainment': 'ent',
    'game': 'game',
    'other': 'other',
    'technology': 'tech',
    'anime': 'anime',
    'voicesynthesis': 'vocaloid'
  }
  return mapping[genre] || genre
}

// GitHub Actions通知
async function notifyGitHubActions(token: string, event: string, data: any) {
  try {
    await fetch('https://api.github.com/repos/YJSN180/nico-ranking-custom/dispatches', {
      method: 'POST',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: event,
        client_payload: data
      })
    })
  } catch (error) {
    console.error('Failed to notify GitHub Actions:', error)
  }
}