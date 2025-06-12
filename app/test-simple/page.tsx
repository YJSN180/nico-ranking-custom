export default function TestSimple() {
  return (
    <main style={{ 
      padding: '40px',
      minHeight: '100vh',
      background: 'var(--background-color)'
    }}>
      <h1>Simple Test Page</h1>
      <p>This is a simple test page to verify routing works.</p>
      <p>Environment: {process.env.NODE_ENV}</p>
      <p>Vercel Environment: {process.env.VERCEL_ENV}</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </main>
  )
}