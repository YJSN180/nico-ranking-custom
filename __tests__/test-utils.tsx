import { render as rtlRender, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import { MylistOperationsProvider } from '@/context/mylist-operations-context'

interface WrapperProps {
  children: React.ReactNode
}

function AllTheProviders({ children }: WrapperProps) {
  return (
    <MylistOperationsProvider>
      {children}
    </MylistOperationsProvider>
  )
}

const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) => rtlRender(ui, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react'

// override render method
export { customRender as render }