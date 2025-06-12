/**
 * Ranking Processor Durable Object
 * 
 * 複数のWorkerインスタンス間での協調処理を管理
 * - 処理状態の管理
 * - タスクの重複防止
 * - 進行状況の追跡
 */

export class RankingProcessor implements DurableObject {
  private state: DurableObjectState
  private env: any
  
  constructor(state: DurableObjectState, env: any) {
    this.state = state
    this.env = env
  }
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const method = url.pathname.slice(1)
    
    switch (method) {
      case 'startProcessing':
        return this.startProcessing(request)
      case 'updateProgress':
        return this.updateProgress(request)
      case 'getStatus':
        return this.getStatus()
      case 'reset':
        return this.reset()
      default:
        return new Response('Not Found', { status: 404 })
    }
  }
  
  // 処理開始
  private async startProcessing(request: Request): Promise<Response> {
    const { phase, tasks } = await request.json<{
      phase: string
      tasks: Array<{ genre: string; period: string }>
    }>()
    
    // 現在の処理状態を確認
    const currentState = await this.state.storage.get('processingState')
    if (currentState && currentState.isActive) {
      return new Response(JSON.stringify({
        error: 'Processing already in progress',
        state: currentState
      }), { 
        status: 409,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // 新しい処理セッションを開始
    const sessionId = crypto.randomUUID()
    const processingState = {
      sessionId,
      phase,
      isActive: true,
      startedAt: new Date().toISOString(),
      totalTasks: tasks.length,
      completedTasks: 0,
      failedTasks: 0,
      tasks: tasks.map(t => ({
        ...t,
        status: 'pending' as const,
        attempts: 0
      }))
    }
    
    await this.state.storage.put('processingState', processingState)
    
    return new Response(JSON.stringify({
      sessionId,
      message: 'Processing started',
      state: processingState
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // 進行状況の更新
  private async updateProgress(request: Request): Promise<Response> {
    const { sessionId, taskId, status, error } = await request.json<{
      sessionId: string
      taskId: string
      status: 'completed' | 'failed'
      error?: string
    }>()
    
    const state = await this.state.storage.get('processingState')
    if (!state || state.sessionId !== sessionId) {
      return new Response('Invalid session', { status: 400 })
    }
    
    // タスクのステータスを更新
    const taskIndex = state.tasks.findIndex(
      t => `${t.genre}-${t.period}` === taskId
    )
    
    if (taskIndex === -1) {
      return new Response('Task not found', { status: 404 })
    }
    
    state.tasks[taskIndex].status = status
    if (error) {
      state.tasks[taskIndex].error = error
    }
    
    // カウンターを更新
    if (status === 'completed') {
      state.completedTasks++
    } else if (status === 'failed') {
      state.failedTasks++
    }
    
    // すべてのタスクが完了したかチェック
    if (state.completedTasks + state.failedTasks >= state.totalTasks) {
      state.isActive = false
      state.completedAt = new Date().toISOString()
      
      // 次のフェーズをトリガー
      if (state.phase === 'basic' && state.completedTasks > 0) {
        await this.triggerNextPhase('tags')
      }
    }
    
    await this.state.storage.put('processingState', state)
    
    return new Response(JSON.stringify({
      message: 'Progress updated',
      state
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // 現在のステータスを取得
  private async getStatus(): Promise<Response> {
    const state = await this.state.storage.get('processingState')
    
    if (!state) {
      return new Response(JSON.stringify({
        message: 'No active processing',
        isActive: false
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    // アクティブなタスクの統計を計算
    const stats = {
      pending: state.tasks.filter(t => t.status === 'pending').length,
      completed: state.tasks.filter(t => t.status === 'completed').length,
      failed: state.tasks.filter(t => t.status === 'failed').length,
      progress: (state.completedTasks + state.failedTasks) / state.totalTasks * 100
    }
    
    return new Response(JSON.stringify({
      state,
      stats,
      duration: state.isActive 
        ? Date.now() - new Date(state.startedAt).getTime()
        : new Date(state.completedAt || state.startedAt).getTime() - new Date(state.startedAt).getTime()
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // 状態をリセット
  private async reset(): Promise<Response> {
    await this.state.storage.delete('processingState')
    return new Response('State reset', { status: 200 })
  }
  
  // 次のフェーズをトリガー
  private async triggerNextPhase(nextPhase: string): Promise<void> {
    // Queue経由で次のフェーズのタスクを送信
    const message = {
      type: 'start_phase',
      phase: nextPhase,
      timestamp: new Date().toISOString()
    }
    
    await this.env.RANKING_QUEUE.send(message)
  }
  
  // 定期的なクリーンアップ
  async alarm(): Promise<void> {
    const state = await this.state.storage.get('processingState')
    
    if (state && state.isActive) {
      const startedAt = new Date(state.startedAt).getTime()
      const now = Date.now()
      
      // 1時間以上経過していたらタイムアウト
      if (now - startedAt > 60 * 60 * 1000) {
        state.isActive = false
        state.timedOut = true
        state.completedAt = new Date().toISOString()
        await this.state.storage.put('processingState', state)
        
        // エラー通知
        console.error('Processing timed out:', state)
      }
    }
  }
}