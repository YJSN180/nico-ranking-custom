import styles from '../mylists.module.css'

export function MylistSkeleton() {
  return (
    <>
      {/* ヘッダー骨格 */}
      <div className={styles.headerTop}>
        <div style={{
          width: '100px',
          height: '20px',
          background: 'var(--skeleton-bg, #e0e0e0)',
          borderRadius: '4px',
          animation: 'pulse 1.5s ease-in-out infinite'
        }} />
      </div>
      
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div style={{
            width: '200px',
            height: '32px',
            background: 'var(--skeleton-bg, #e0e0e0)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          <div style={{
            width: '160px',
            height: '40px',
            background: 'var(--skeleton-bg, #e0e0e0)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>
      </div>

      {/* マイリストグリッド骨格 */}
      <div className={styles.mylistGrid}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className={styles.mylistCard} style={{ cursor: 'default' }}>
            <div className={styles.mylistInfo}>
              <div style={{
                width: '40px',
                height: '40px',
                background: 'var(--skeleton-bg, #e0e0e0)',
                borderRadius: '8px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <div className={styles.mylistDetails}>
                <div style={{
                  width: '180px',
                  height: '24px',
                  background: 'var(--skeleton-bg, #e0e0e0)',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                <div style={{
                  width: '240px',
                  height: '16px',
                  background: 'var(--skeleton-bg, #e0e0e0)',
                  borderRadius: '4px',
                  marginBottom: '8px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
                <div style={{
                  width: '160px',
                  height: '14px',
                  background: 'var(--skeleton-bg, #e0e0e0)',
                  borderRadius: '4px',
                  animation: 'pulse 1.5s ease-in-out infinite'
                }} />
              </div>
            </div>
            <div className={styles.mylistActions}>
              <div style={{
                width: '60px',
                height: '32px',
                background: 'var(--skeleton-bg, #e0e0e0)',
                borderRadius: '6px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
              <div style={{
                width: '60px',
                height: '32px',
                background: 'var(--skeleton-bg, #e0e0e0)',
                borderRadius: '6px',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* データ管理セクション骨格 */}
      <div className={styles.dataManagement}>
        <div className={styles.storageInfo}>
          <div style={{
            width: '120px',
            height: '24px',
            background: 'var(--skeleton-bg, #e0e0e0)',
            borderRadius: '4px',
            marginBottom: '16px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
          <div style={{
            width: '100%',
            height: '120px',
            background: 'var(--skeleton-bg, #e0e0e0)',
            borderRadius: '8px',
            animation: 'pulse 1.5s ease-in-out infinite'
          }} />
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
          100% {
            opacity: 1;
          }
        }

        [data-theme="dark"] {
          --skeleton-bg: #333;
        }

        [data-theme="dark-blue"] {
          --skeleton-bg: #1e3a5f;
        }
      `}</style>
    </>
  )
}