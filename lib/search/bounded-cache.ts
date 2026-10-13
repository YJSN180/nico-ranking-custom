/** 上限件数つきの期限つきキャッシュ。上限を超えたら、入れた順に古いものから捨てる */
export class BoundedTtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>()

  constructor(private readonly maxEntries: number) {}

  get size(): number {
    return this.entries.size
  }

  get(key: string, now: number): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt <= now) {
      this.entries.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T, expiresAt: number): void {
    // 入れ直したものは新しい扱いにする（Map は入れた順を保つ）
    this.entries.delete(key)
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expiresAt })
  }

  clear(): void {
    this.entries.clear()
  }
}
