# ハイブリッドキャッシングの一貫性問題と解決策

## 問題の詳細

### シナリオ
1. 月曜日：「ゲーム実況」タグが人気Top10入り → 300件事前キャッシュ
2. 火曜日：人気が11位に下落 → 動的取得（100件ずつ）に切り替わる
3. ユーザー：「昨日は300件見れたのに今日は見れない」と混乱

### 影響
- **UX の不一致**: 同じタグで日によって挙動が異なる
- **期待値の裏切り**: 「もっと見る」を押し続けても300件に到達しない
- **信頼性の低下**: サービスの品質が不安定に見える

## 解決策の検討

### 案1: 一度でも事前キャッシュしたタグは維持
```typescript
// 「キャッシュ済みタグリスト」を別途管理
const CACHED_TAGS_KEY = 'cached-tags-list'

// 一度300件キャッシュしたタグは、人気度が下がっても継続
const cachedTagsList = await kv.get(CACHED_TAGS_KEY) || {}
if (cachedTagsList[genre]?.includes(tag)) {
  // 300件キャッシュを継続
}
```

**問題点**: ストレージが際限なく増加する可能性

### 案2: 全タグを動的取得に統一（推奨）
```typescript
// タグランキングは全て動的取得で統一
// ただし、人気度に応じてキャッシュTTLとページ数を調整

if (tag) {
  const popularity = await getTagPopularity(genre, tag)
  
  // 人気タグは5ページ（500件）まで許可
  const maxPages = popularity === 'high' ? 5 : 3
  
  // 人気タグは長めのTTL
  const ttl = popularity === 'high' ? 7200 : 3600
}
```

### 案3: 明示的な階層表示
```typescript
// UIで「プレミアムタグ」と「通常タグ」を区別
interface TagInfo {
  name: string
  tier: 'premium' | 'standard' // 300件 or 100件
  lastUpdated: string
}

// タグセレクターで表示
<TagSelector>
  <optgroup label="人気タグ（300件まで）">
    <option>ゲーム実況 ⭐</option>
  </optgroup>
  <optgroup label="その他のタグ">
    <option>レトロゲーム</option>
  </optgroup>
</TagSelector>
```

## 推奨実装: 統一された動的取得

### 実装方針
1. **全タグランキングを動的取得に統一**
   - 事前キャッシュは通常ランキング（ジャンル別）のみ
   - タグは全て100件ずつのページング

2. **人気度に応じた最適化**
   ```typescript
   // 人気タグは積極的にキャッシュ
   const getMaxPagesForTag = async (genre: string, tag: string) => {
     const rank = await getTagPopularityRank(genre, tag)
     if (rank <= 10) return 5  // 500件まで
     if (rank <= 20) return 3  // 300件まで
     return 2                   // 200件まで
   }
   ```

3. **バックグラウンドでの先読み**
   ```typescript
   // 人気タグは2ページ目を先読み
   if (page === 1 && rank <= 10) {
     // 非同期で2ページ目をキャッシュ
     prefetchNextPage(genre, tag, 2)
   }
   ```

### メリット
- **一貫したUX**: すべてのタグで同じ挙動
- **柔軟な拡張**: 必要に応じて何ページでも読める
- **ストレージ効率**: 必要な分だけキャッシュ

### デメリット
- **初回アクセスの遅延**: 事前キャッシュがない
- **APIコール増加**: ページごとにリクエスト

## 実装コード例

```typescript
// app/api/ranking/route.ts の改修
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tag = searchParams.get('tag')
  const page = parseInt(searchParams.get('page') || '1')
  
  if (tag) {
    // すべてのタグを動的取得で統一
    const maxPages = await getMaxPagesForTag(genre, tag)
    
    if (page > maxPages) {
      return NextResponse.json(
        { error: 'Page limit exceeded', maxPages },
        { status: 400 }
      )
    }
    
    // 通常の動的取得処理
    const items = await fetchTagRanking(genre, period, tag, page)
    
    // 人気タグは次ページを先読み
    if (page < maxPages) {
      prefetchNextPage(genre, period, tag, page + 1)
    }
    
    return NextResponse.json(items)
  }
  
  // 通常ランキングは従来通り事前キャッシュから配信
}
```

## 移行計画

### Phase 1: 現状維持で様子見
- タグ使用統計を収集
- ユーザーの行動パターンを分析

### Phase 2: UI改善
- 「もっと見る」ボタンに残り件数の目安を表示
- 「約100-300件」のような幅を持たせた表示

### Phase 3: 統一実装
- すべてのタグを動的取得に移行
- 人気度に応じた最適化を導入

## 結論

**推奨**: タグランキングは全て動的取得に統一し、人気度に応じて最適化する方が、長期的にはユーザー体験が安定する。

事前キャッシュのメリット（高速性）と動的取得のメリット（柔軟性）を両立させるには、積極的なキャッシングと先読みの組み合わせが有効。