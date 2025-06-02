# Vercel Build Fixes

## 修正された問題

### 1. useSearchParams() Suspense Boundary エラー
**問題**: `useSearchParams() should be wrapped in a suspense boundary at page "/test-300"`

**修正内容**:
- `components/suspense-wrapper.tsx` を作成
- `app/page.tsx` で ClientPage を SuspenseWrapper でラップ
- `app/test-300/page.tsx` で ClientPage を SuspenseWrapper でラップ

```tsx
// Before
<ClientPage initialData={rankingData} />

// After
<SuspenseWrapper>
  <ClientPage initialData={rankingData} />
</SuspenseWrapper>
```

### 2. Viewport メタデータ警告
**問題**: `Unsupported metadata viewport is configured in metadata export`

**修正内容**:
- `app/layout.tsx` で viewport を別のエクスポートに分離

```tsx
// Before
export const metadata: Metadata = {
  title: 'ニコニコ24h総合ランキング',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
}

// After
export const metadata: Metadata = {
  title: 'ニコニコ24h総合ランキング',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}
```

### 3. console.error の削除
**修正内容**:
- `app/test-300/page.tsx` から console.error を削除（ESLint エラー回避）

## テスト駆動開発のアプローチ

1. **Suspense Boundary テスト** (`__tests__/unit/suspense-boundary.test.tsx`)
   - useSearchParams エラーを再現
   - Suspense でラップした場合の正常動作を確認

2. **Viewport メタデータテスト** (`__tests__/unit/viewport-metadata.test.tsx`)
   - viewport が metadata に含まれていないことを確認
   - viewport が別エクスポートとして存在することを確認

これらの修正により、Vercel でのビルドエラーが解消されます。