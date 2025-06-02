# ランキングデータ取得戦略

## 現状の実装

### 1. 通常ランキング（事前キャッシュ方式）
- **対象**: all, game, entertainment, music, other, tech, anime, animal, d2um7mc4
- **仕組み**: 30分ごとのcronジョブで300件を事前取得してKVに保存
- **クライアント側**: 全データを受け取り、100件ずつ表示

### 2. タグ別ランキング（動的取得方式）
- **対象**: 任意のタグ
- **仕組み**: ユーザーアクセス時に100件ずつオンデマンド取得
- **クライアント側**: 「もっと見る」で追加ページをAPIから取得

## Vercel無料プランでの推奨

数千人規模での利用を考慮すると、**通常ランキングの事前キャッシュ方式が望ましい**：

### メリット
1. **APIコール数削減**
   - ユーザーリクエスト時: 0回
   - cronジョブ時のみ: 90回/30分

2. **Vercel Functions実行時間節約**
   - キャッシュから即座に返却
   - 実行時間制限に余裕

3. **高速レスポンス**
   - CDNキャッシュが効果的
   - 初回アクセスも高速

### デメリット
1. **KVストレージ使用量**
   - 約6.75MB（18データセット）
   - 無料プラン上限との兼ね合い

2. **データの鮮度**
   - 最大30分の遅延
   - リアルタイム性に欠ける

## スケーラビリティ比較

### タグ別ランキングのリスク
```
1000人が同時アクセス × 3ページ = 3000 APIコール
→ Vercel無料プランの制限を超える可能性
```

### 通常ランキングの安定性
```
1000人が同時アクセス = 0 APIコール（KVから配信）
→ スケールしても安定
```

## ブラウザバック問題の解決

### 問題
- 150位まで表示 → 動画視聴 → ブラウザバック → 100位に戻る

### 原因
1. スクロール位置復元がDOM更新前に実行
2. displayCount復元とDOM描画のタイミングずれ

### 解決策（実装済み）
```typescript
// 1. スクロール復元フラグとref管理
const [shouldRestoreScroll, setShouldRestoreScroll] = useState(false)
const scrollPositionRef = useRef<number>(0)

// 2. DOM更新を確実に待つ
useEffect(() => {
  if (shouldRestoreScroll) {
    const checkAndRestore = () => {
      const items = document.querySelectorAll('[data-testid="ranking-item"]')
      if (items.length >= displayCount) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo(0, scrollPositionRef.current)
          }, 0)
        })
      } else {
        requestAnimationFrame(checkAndRestore)
      }
    }
    checkAndRestore()
  }
}, [shouldRestoreScroll, displayCount])

// 3. ページ離脱時も確実に保存
window.addEventListener('beforeunload', saveStateToStorage)
```

## 最適化の提案

### 1. ハイブリッドアプローチ
- 人気上位20タグを事前キャッシュ
- それ以外は動的取得
- アクセス頻度を監視して調整

### 2. Edge Caching
- Vercel Edge Configで人気タグリストを管理
- Edge Functionsでキャッシュ戦略を最適化

### 3. Progressive Enhancement
- 最初の100件は即座に表示
- 追加データはバックグラウンドで先読み
- スムーズなユーザー体験を提供