import { HeaderWithSettings } from '@/components/header-with-settings'

export default function InfoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <HeaderWithSettings />
      <main style={{ 
        backgroundColor: 'var(--background-color)',
        color: 'var(--text-primary)',
        minHeight: 'calc(100vh - 70px)',
        paddingTop: '20px',
        paddingBottom: '40px'
      }}>
        {children}
      </main>
    </>
  )
}