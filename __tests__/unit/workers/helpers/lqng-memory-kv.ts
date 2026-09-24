// lqng-poller のテスト用メモリ KV。操作の順番を記録し、put / delete を数えられるようにする
import type { KvLike } from '@/workers/lqng-poller/src/state'

export interface MemoryKv {
  kv: KvLike
  store: Map<string, string>
  /** 実行した操作（例: 'put lqng:tracking'）を順に記録する */
  ops: string[]
  /** put したキー（順番どおり） */
  puts: string[]
  deletes: string[]
  read: <T>(key: string) => T | null
  reset: () => void
}

export function memoryKv(initial: Record<string, unknown> = {}): MemoryKv {
  const store = new Map<string, string>()
  for (const [k, v] of Object.entries(initial)) store.set(k, JSON.stringify(v))
  const ops: string[] = []
  const puts: string[] = []
  const deletes: string[] = []
  const kv: KvLike = {
    get: async (key) => {
      ops.push(`get ${key}`)
      return store.get(key) ?? null
    },
    put: async (key, value) => {
      ops.push(`put ${key}`)
      puts.push(key)
      store.set(key, value)
    },
    delete: async (key) => {
      ops.push(`delete ${key}`)
      deletes.push(key)
      store.delete(key)
    },
  }
  const read = <T,>(key: string): T | null => {
    const raw = store.get(key)
    return raw ? (JSON.parse(raw) as T) : null
  }
  const reset = (): void => {
    ops.length = 0
    puts.length = 0
    deletes.length = 0
  }
  return { kv, store, ops, puts, deletes, read, reset }
}
