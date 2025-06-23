import { HeaderWrapper } from '@/components/header-wrapper'

export default function InfoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <HeaderWrapper />
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