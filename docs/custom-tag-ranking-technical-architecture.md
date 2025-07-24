# カスタムタグランキング - 技術アーキテクチャ詳細

## 1. システムアーキテクチャ

### 1.1 データフロー図

```
┌─────────────────────────────────────────────────────────────────┐
│                         ユーザーインターフェース                   │
├─────────────────────────────────────────────────────────────────┤
│  カスタムランキング一覧  │  タグ検索・編集  │  ランキング表示     │
└────────────┬────────────┴────────┬─────────┴──────────┬─────────┘
             │                     │                     │
             ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                        State Management                          │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ useCustom    │  │ useTagSearch    │  │ useRankingData   │  │
│  │ Rankings     │  │                 │  │ (既存)           │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
             │                     │                     │
             ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Business Logic                            │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Custom       │  │ Tag Filter      │  │ Ranking Cache    │  │
│  │ Storage      │  │ Engine          │  │ (既存)           │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
             │                     │                     │
             ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Data Layer                             │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ LocalStorage │  │ Cloudflare KV   │  │ Cloudflare R2    │  │
│  │ (設定保存)   │  │ (タグデータ)     │  │ (ランキング)      │  │
│  └──────────────┘  └─────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 コンポーネント階層

```
app/
└── custom-tags/
    ├── page.tsx (一覧画面)
    ├── layout.tsx
    ├── new/
    │   └── page.tsx (新規作成)
    └── [id]/
        ├── page.tsx (表示)
        └── edit/
            └── page.tsx (編集)

components/
└── custom-ranking/
    ├── custom-ranking-provider.tsx    # Context Provider
    ├── custom-ranking-grid.tsx        # グリッドレイアウト
    ├── custom-ranking-card.tsx        # カードコンポーネント
    ├── tag-condition-editor.tsx       # 条件エディタ
    ├── tag-search-input.tsx           # タグ検索
    ├── tag-chip.tsx                   # タグチップ
    └── empty-state.tsx                # 空状態表示

hooks/
├── use-custom-rankings.ts             # カスタムランキング管理
├── use-tag-search.ts                  # タグ検索
└── use-tag-filter.ts                  # タグフィルタリング

lib/
├── custom-ranking/
│   ├── storage.ts                     # ストレージ操作
│   ├── filter-engine.ts               # フィルタリングエンジン
│   ├── validator.ts                   # データ検証
│   └── cache.ts                       # キャッシュ管理
└── utils/
    └── tag-utils.ts                   # タグ関連ユーティリティ
```

## 2. 詳細実装設計

### 2.1 フィルタリングエンジン

```typescript
// lib/custom-ranking/filter-engine.ts

export class TagFilterEngine {
  private cache: Map<string, RankingItem[]> = new Map()
  
  /**
   * メインフィルタリング関数
   * キャッシュ機構付きで高速化
   */
  filterItems(
    items: RankingItem[],
    conditions: TagCondition[]
  ): RankingItem[] {
    const cacheKey = this.generateCacheKey(conditions)
    
    // キャッシュチェック
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }
    
    // フィルタリング実行
    const result = this.applyConditions(items, conditions)
    
    // キャッシュ保存（最大100件）
    if (this.cache.size >= 100) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(cacheKey, result)
    
    return result
  }
  
  /**
   * 条件適用ロジック
   * 最適化されたアルゴリズムで高速処理
   */
  private applyConditions(
    items: RankingItem[],
    conditions: TagCondition[]
  ): RankingItem[] {
    // 条件グループごとに分類
    const andGroups = conditions.filter(c => c.operator === 'AND')
    const orGroups = conditions.filter(c => c.operator === 'OR')
    const notGroups = conditions.filter(c => c.operator === 'NOT')
    
    return items.filter(item => {
      const itemTags = new Set(item.tags || [])
      
      // AND条件: すべてのタグが必要
      for (const group of andGroups) {
        const hasAllTags = group.tags.every(tag => itemTags.has(tag))
        if (!hasAllTags) return false
      }
      
      // OR条件: いずれかのタグが必要
      for (const group of orGroups) {
        const hasAnyTag = group.tags.some(tag => itemTags.has(tag))
        if (!hasAnyTag) return false
      }
      
      // NOT条件: いずれのタグも含まない
      for (const group of notGroups) {
        const hasNoTag = !group.tags.some(tag => itemTags.has(tag))
        if (!hasNoTag) return false
      }
      
      return true
    })
  }
  
  /**
   * キャッシュキー生成
   */
  private generateCacheKey(conditions: TagCondition[]): string {
    return JSON.stringify(
      conditions.sort((a, b) => 
        a.operator.localeCompare(b.operator)
      )
    )
  }
}
```

### 2.2 カスタムランキングストレージ

```typescript
// lib/custom-ranking/storage.ts

export class CustomRankingStorage {
  private static readonly STORAGE_KEY = 'custom-tag-rankings'
  private static readonly VERSION = 1
  private static readonly MAX_RANKINGS = 50
  
  /**
   * 全ランキング取得
   */
  static getAll(): CustomRankingList {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      if (!data) {
        return this.getDefaultData()
      }
      
      const parsed = JSON.parse(data)
      
      // バージョンチェック
      if (parsed.version !== this.VERSION) {
        return this.migrate(parsed)
      }
      
      return parsed
    } catch (error) {
      console.error('Failed to load custom rankings:', error)
      return this.getDefaultData()
    }
  }
  
  /**
   * 単一ランキング取得
   */
  static get(id: string): CustomRanking | null {
    const data = this.getAll()
    return data.rankings.find(r => r.id === id) || null
  }
  
  /**
   * 保存（作成/更新）
   */
  static save(ranking: CustomRanking): void {
    const data = this.getAll()
    
    // 既存チェック
    const index = data.rankings.findIndex(r => r.id === ranking.id)
    
    if (index >= 0) {
      // 更新
      data.rankings[index] = {
        ...ranking,
        updatedAt: new Date().toISOString()
      }
    } else {
      // 新規作成
      if (data.rankings.length >= this.MAX_RANKINGS) {
        throw new Error(`最大${this.MAX_RANKINGS}件まで保存できます`)
      }
      
      data.rankings.unshift({
        ...ranking,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      })
    }
    
    this.saveData(data)
  }
  
  /**
   * 削除
   */
  static delete(id: string): void {
    const data = this.getAll()
    data.rankings = data.rankings.filter(r => r.id !== id)
    this.saveData(data)
  }
  
  /**
   * エクスポート
   */
  static export(): string {
    const data = this.getAll()
    return JSON.stringify(data, null, 2)
  }
  
  /**
   * インポート
   */
  static import(jsonString: string): void {
    try {
      const data = JSON.parse(jsonString)
      
      // バリデーション
      if (!this.validate(data)) {
        throw new Error('無効なデータ形式です')
      }
      
      // 既存データとマージ
      const current = this.getAll()
      const merged = this.mergeData(current, data)
      
      this.saveData(merged)
    } catch (error) {
      throw new Error(`インポートに失敗しました: ${error.message}`)
    }
  }
  
  /**
   * データ保存
   */
  private static saveData(data: CustomRankingList): void {
    try {
      localStorage.setItem(
        this.STORAGE_KEY,
        JSON.stringify(data)
      )
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        throw new Error('ストレージ容量が不足しています')
      }
      throw error
    }
  }
  
  /**
   * デフォルトデータ
   */
  private static getDefaultData(): CustomRankingList {
    return {
      version: this.VERSION,
      rankings: [],
      maxRankings: this.MAX_RANKINGS
    }
  }
  
  /**
   * データ検証
   */
  private static validate(data: any): boolean {
    if (!data || typeof data !== 'object') return false
    if (!Array.isArray(data.rankings)) return false
    
    return data.rankings.every((r: any) =>
      r.id && 
      r.name && 
      r.genre && 
      r.period && 
      Array.isArray(r.conditions)
    )
  }
  
  /**
   * データマイグレーション
   */
  private static migrate(oldData: any): CustomRankingList {
    // 将来のバージョンアップ時に実装
    console.log('Migrating data from version', oldData.version)
    return this.getDefaultData()
  }
  
  /**
   * データマージ
   */
  private static mergeData(
    current: CustomRankingList,
    imported: CustomRankingList
  ): CustomRankingList {
    const existingIds = new Set(current.rankings.map(r => r.id))
    const newRankings = imported.rankings.filter(
      r => !existingIds.has(r.id)
    )
    
    return {
      ...current,
      rankings: [...current.rankings, ...newRankings].slice(0, this.MAX_RANKINGS)
    }
  }
}
```

### 2.3 React Hooks実装

```typescript
// hooks/use-custom-rankings.ts

export function useCustomRankings() {
  const [rankings, setRankings] = useState<CustomRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // 初期読み込み
  useEffect(() => {
    loadRankings()
  }, [])
  
  const loadRankings = useCallback(() => {
    try {
      setLoading(true)
      const data = CustomRankingStorage.getAll()
      setRankings(data.rankings)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])
  
  const saveRanking = useCallback(async (ranking: CustomRanking) => {
    try {
      CustomRankingStorage.save(ranking)
      await loadRankings()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [loadRankings])
  
  const deleteRanking = useCallback(async (id: string) => {
    try {
      CustomRankingStorage.delete(id)
      await loadRankings()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [loadRankings])
  
  const exportRankings = useCallback(() => {
    return CustomRankingStorage.export()
  }, [])
  
  const importRankings = useCallback(async (data: string) => {
    try {
      CustomRankingStorage.import(data)
      await loadRankings()
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [loadRankings])
  
  return {
    rankings,
    loading,
    error,
    saveRanking,
    deleteRanking,
    exportRankings,
    importRankings,
    refresh: loadRankings
  }
}
```

```typescript
// hooks/use-tag-search.ts

export function useTagSearch(genre: string = 'all') {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [popularTags, setPopularTags] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  
  // 人気タグの取得
  useEffect(() => {
    fetchPopularTags()
  }, [genre])
  
  // 検索クエリの変更時にサジェスト更新
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        searchTags(query)
      } else {
        setSuggestions([])
      }
    }, 300) // デバウンス
    
    return () => clearTimeout(timer)
  }, [query, genre])
  
  const fetchPopularTags = async () => {
    try {
      // 既存のAPIから人気タグを取得
      const response = await fetch(`/api/popular-tags?genre=${genre}`)
      const data = await response.json()
      setPopularTags(data.tags.slice(0, 20))
    } catch (error) {
      console.error('Failed to fetch popular tags:', error)
    }
  }
  
  const searchTags = async (searchQuery: string) => {
    setLoading(true)
    try {
      // ローカルでフィルタリング（全タグデータは既に取得済み）
      const allTags = await getAllTags(genre)
      const filtered = allTags.filter(tag =>
        tag.toLowerCase().includes(searchQuery.toLowerCase())
      )
      setSuggestions(filtered.slice(0, 10))
    } catch (error) {
      console.error('Failed to search tags:', error)
    } finally {
      setLoading(false)
    }
  }
  
  return {
    query,
    setQuery,
    suggestions,
    popularTags,
    loading
  }
}
```

## 3. パフォーマンス最適化

### 3.1 仮想スクロール実装
```typescript
// 大量のランキングカード表示時の最適化
import { VariableSizeGrid } from 'react-window'

export function CustomRankingGrid({ rankings }: Props) {
  const columnCount = useResponsiveColumns() // 2-5列
  
  return (
    <VariableSizeGrid
      columnCount={columnCount}
      columnWidth={() => 280}
      height={window.innerHeight - 200}
      rowCount={Math.ceil(rankings.length / columnCount)}
      rowHeight={() => 320}
      width={window.innerWidth}
    >
      {({ columnIndex, rowIndex, style }) => {
        const index = rowIndex * columnCount + columnIndex
        if (index >= rankings.length) return null
        
        return (
          <div style={style}>
            <CustomRankingCard ranking={rankings[index]} />
          </div>
        )
      }}
    </VariableSizeGrid>
  )
}
```

### 3.2 メモ化戦略
```typescript
// 重い計算のメモ化
const filteredItems = useMemo(() => {
  if (!conditions.length) return items
  return filterEngine.filterItems(items, conditions)
}, [items, conditions])

// コンポーネントのメモ化
export const CustomRankingCard = memo(({ ranking }: Props) => {
  // レンダリング最適化
}, (prevProps, nextProps) => {
  return prevProps.ranking.id === nextProps.ranking.id &&
         prevProps.ranking.updatedAt === nextProps.ranking.updatedAt
})
```

## 4. セキュリティ考慮事項

### 4.1 XSS対策
```typescript
// タグ名のサニタイゼーション
export function sanitizeTagName(tag: string): string {
  return tag
    .replace(/[<>\"'&]/g, '') // 危険な文字を除去
    .trim()
    .slice(0, 50) // 最大長制限
}
```

### 4.2 データ検証
```typescript
// インポートデータの厳密な検証
export function validateImportData(data: unknown): data is CustomRankingList {
  if (!isObject(data)) return false
  if (!hasVersion(data) || data.version !== CURRENT_VERSION) return false
  if (!hasRankings(data) || !Array.isArray(data.rankings)) return false
  
  return data.rankings.every(validateRanking)
}
```

## 5. テスト戦略

### 5.1 単体テスト
```typescript
// フィルタリングエンジンのテスト
describe('TagFilterEngine', () => {
  it('AND条件で正しくフィルタリング', () => {
    const items = [
      { id: '1', tags: ['ゲーム', '実況'] },
      { id: '2', tags: ['ゲーム'] },
      { id: '3', tags: ['実況'] }
    ]
    
    const conditions = [{
      operator: 'AND' as const,
      tags: ['ゲーム', '実況']
    }]
    
    const result = engine.filterItems(items, conditions)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })
})
```

### 5.2 E2Eテスト
```typescript
// Playwright E2Eテスト
test('カスタムランキング作成フロー', async ({ page }) => {
  // 1. カスタムタグページへ移動
  await page.goto('/custom-tags')
  
  // 2. 新規作成ボタンをクリック
  await page.click('text=新規作成')
  
  // 3. ランキング名を入力
  await page.fill('input[name="name"]', 'テストランキング')
  
  // 4. タグ条件を追加
  await page.selectOption('select[name="operator"]', 'AND')
  await page.fill('input[name="tag-search"]', 'ゲーム')
  await page.click('text=ゲーム')
  
  // 5. 保存
  await page.click('button[type="submit"]')
  
  // 6. 一覧に表示されることを確認
  await expect(page.locator('text=テストランキング')).toBeVisible()
})
```