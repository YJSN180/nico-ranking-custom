export default function Loading() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--background-color)'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid var(--border-color)',
        borderTopColor: 'var(--primary-color)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
    </div>
  )
}