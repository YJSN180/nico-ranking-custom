export function SiteFeatures() {
  return (
    <div style={{
      padding: '20px',
      margin: '20px auto',
      maxWidth: '800px',
      background: 'var(--surface-color)',
      borderRadius: '12px',
      border: '1px solid var(--border-color)'
    }}>
      <h2 style={{ 
        fontSize: '1.2rem', 
        marginBottom: '16px',
        color: 'var(--text-primary)'
      }}>
        ニコラン(Re:turn)の特徴
      </h2>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px'
      }}>
        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--primary-color)' }}>⚡ 高速表示</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            30分ごとの自動更新で常に最新ランキング
          </p>
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--primary-color)' }}>🚫 NGフィルター</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            見たくない動画を自由にフィルタリング
          </p>
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--primary-color)' }}>🏷️ タグ別ランキング</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            人気タグごとの詳細ランキング表示
          </p>
        </div>
        <div>
          <h3 style={{ fontSize: '1rem', color: 'var(--primary-color)' }}>📱 モバイル対応</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            スマホでも快適に閲覧可能
          </p>
        </div>
      </div>
    </div>
  )
}