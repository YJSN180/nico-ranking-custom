import { HeaderWithSettings } from '@/components/header-with-settings'

export default function InfoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <HeaderWithSettings />
      <main>{children}</main>
    </>
  )
}