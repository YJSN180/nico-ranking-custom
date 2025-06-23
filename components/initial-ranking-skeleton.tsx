// 初期表示用のスケルトンスクリーン
// 実際のコンテンツと同じレイアウトで、CLSを防ぐ

export function InitialRankingSkeleton() {
  return (
    <>
      {/* セレクター領域の高さを確保 */}
      <div className="selectors-container" style={{ minHeight: '200px' }} />
      
      {/* ランキングアイテムのスケルトン */}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {[...Array(5)].map((_, i) => (
          <li key={i} style={{
            background: 'var(--surface-color)',
            borderRadius: '8px',
            marginBottom: '8px',
            padding: '4px',
            minHeight: '90px',
            border: '1px solid var(--border-color)',
          }}>
            <div style={{
              display: 'grid',
              gap: '12px',
              gridTemplateColumns: 'auto auto 1fr',
              alignItems: 'start',
            }}>
              {/* ランク */}
              <div style={{
                width: '44px',
                height: '44px',
                background: 'var(--surface-secondary)',
                borderRadius: '6px',
              }} />
              
              {/* サムネイル */}
              <div style={{
                width: '160px',
                height: '90px',
                background: 'var(--surface-secondary)',
                borderRadius: '4px',
              }} />
              
              {/* 詳細 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {/* タイトル */}
                <div style={{
                  height: '22px',
                  background: 'var(--surface-secondary)',
                  borderRadius: '4px',
                  width: '80%',
                }} />
                
                {/* 投稿者 */}
                <div style={{
                  height: '20px',
                  background: 'var(--surface-secondary)',
                  borderRadius: '4px',
                  width: '200px',
                }} />
                
                {/* 統計 */}
                <div style={{
                  height: '20px',
                  background: 'var(--surface-secondary)',
                  borderRadius: '4px',
                  width: '300px',
                }} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}