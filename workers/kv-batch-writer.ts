/**
 * KV Batch Writer
 * 
 * Cloudflare KVの書き込み制限（1秒1回/キー）に対応した
 * バッチ書き込みとレート制限の実装
 */

interface WriteBatch {
  key: string
  value: string
  metadata?: any
  expirationTtl?: number
}

export class KVBatchWriter {
  private kv: KVNamespace
  private writeQueue: WriteBatch[] = []
  private isProcessing = false
  private lastWriteTime: Map<string, number> = new Map()
  
  constructor(kv: KVNamespace) {
    this.kv = kv
  }
  
  /**
   * バッチに書き込みを追加
   */
  async add(batch: WriteBatch): Promise<void> {
    this.writeQueue.push(batch)
    
    if (!this.isProcessing) {
      this.processQueue()
    }
  }
  
  /**
   * 複数の書き込みを一度に追加
   */
  async addBatch(batches: WriteBatch[]): Promise<void> {
    this.writeQueue.push(...batches)
    
    if (!this.isProcessing) {
      this.processQueue()
    }
  }
  
  /**
   * キューを処理
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.writeQueue.length === 0) {
      return
    }
    
    this.isProcessing = true
    
    try {
      while (this.writeQueue.length > 0) {
        const batch = this.writeQueue.shift()!
        
        // レート制限チェック
        await this.waitForRateLimit(batch.key)
        
        // KVに書き込み
        await this.writeToKV(batch)
        
        // 最終書き込み時刻を記録
        this.lastWriteTime.set(batch.key, Date.now())
      }
    } finally {
      this.isProcessing = false
    }
  }
  
  /**
   * レート制限を遵守して待機
   */
  private async waitForRateLimit(key: string): Promise<void> {
    const lastWrite = this.lastWriteTime.get(key)
    if (!lastWrite) return
    
    const timeSinceLastWrite = Date.now() - lastWrite
    const waitTime = Math.max(0, 1000 - timeSinceLastWrite) // 1秒間隔
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime))
    }
  }
  
  /**
   * KVに書き込み（リトライ付き）
   */
  private async writeToKV(batch: WriteBatch, retries = 3): Promise<void> {
    try {
      await this.kv.put(batch.key, batch.value, {
        metadata: batch.metadata,
        expirationTtl: batch.expirationTtl
      })
    } catch (error) {
      if (retries > 0) {
        console.warn(`KV write failed, retrying... (${retries} left)`, error)
        await new Promise(resolve => setTimeout(resolve, 1000))
        return this.writeToKV(batch, retries - 1)
      }
      throw error
    }
  }
  
  /**
   * すべての書き込みが完了するまで待機
   */
  async flush(): Promise<void> {
    while (this.writeQueue.length > 0 || this.isProcessing) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
}

/**
 * 効率的なデータ構造への変換
 */
export class DataOptimizer {
  /**
   * ランキングデータを最適化された形式に変換
   */
  static optimizeRankingData(items: any[]): any {
    return {
      // 基本データは配列で保存（キー名を省略してサイズ削減）
      i: items.map(item => [
        item.rank,
        item.id,
        item.title,
        item.thumbURL,
        item.views,
        item.comments || 0,
        item.mylists || 0,
        item.likes || 0,
        item.registeredAt || ''
      ]),
      // メタデータ
      m: {
        v: 2, // バージョン
        t: new Date().toISOString(),
        c: items.length
      }
    }
  }
  
  /**
   * 最適化されたデータを元の形式に復元
   */
  static restoreRankingData(optimized: any): any[] {
    if (!optimized.i || !Array.isArray(optimized.i)) {
      return []
    }
    
    return optimized.i.map((item: any[]) => ({
      rank: item[0],
      id: item[1],
      title: item[2],
      thumbURL: item[3],
      views: item[4],
      comments: item[5],
      mylists: item[6],
      likes: item[7],
      registeredAt: item[8]
    }))
  }
  
  /**
   * JSONを圧縮
   */
  static async compress(data: any): Promise<string> {
    const json = JSON.stringify(data)
    const encoder = new TextEncoder()
    const stream = new Response(encoder.encode(json)).body!
      .pipeThrough(new CompressionStream('gzip'))
    
    const compressed = await new Response(stream).arrayBuffer()
    return btoa(String.fromCharCode(...new Uint8Array(compressed)))
  }
  
  /**
   * 圧縮されたデータを解凍
   */
  static async decompress(compressed: string): Promise<any> {
    const binary = atob(compressed)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    
    const stream = new Response(bytes).body!
      .pipeThrough(new DecompressionStream('gzip'))
    
    const json = await new Response(stream).text()
    return JSON.parse(json)
  }
}

/**
 * インクリメンタル更新戦略
 */
export class IncrementalUpdater {
  private kv: KVNamespace
  
  constructor(kv: KVNamespace) {
    this.kv = kv
  }
  
  /**
   * 差分更新を適用
   */
  async applyDiff(key: string, updates: Map<string, any>): Promise<void> {
    // 既存データを取得
    const existing = await this.kv.get(key, { type: 'json' })
    if (!existing) {
      throw new Error('No existing data to update')
    }
    
    // 更新を適用
    const updated = { ...existing }
    for (const [field, value] of updates) {
      updated[field] = value
    }
    
    // 保存
    await this.kv.put(key, JSON.stringify(updated), {
      expirationTtl: 3600
    })
  }
  
  /**
   * 部分的なランキング更新
   */
  async updateRankingPartial(
    genre: string,
    period: string,
    startRank: number,
    items: any[]
  ): Promise<void> {
    const key = `ranking-${genre}-${period}`
    
    // 既存データを取得
    const existing = await this.kv.get(key, { type: 'json' })
    if (!existing || !existing.items) {
      // 新規作成
      await this.kv.put(key, JSON.stringify({
        items,
        updatedAt: new Date().toISOString()
      }), { expirationTtl: 3600 })
      return
    }
    
    // 部分更新
    const updatedItems = [...existing.items]
    items.forEach((item, index) => {
      const targetIndex = startRank - 1 + index
      if (targetIndex < updatedItems.length) {
        updatedItems[targetIndex] = item
      } else {
        updatedItems.push(item)
      }
    })
    
    // 保存
    await this.kv.put(key, JSON.stringify({
      ...existing,
      items: updatedItems,
      updatedAt: new Date().toISOString()
    }), { expirationTtl: 3600 })
  }
}