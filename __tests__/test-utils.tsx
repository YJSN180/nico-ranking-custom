import { render as rtlRender, renderHook as rtlRenderHook, RenderOptions, RenderHookOptions } from '@testing-library/react'
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

const customRenderHook = <TProps, TResult>(
  hook: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, 'wrapper'>
) => rtlRenderHook(hook, { wrapper: AllTheProviders, ...options })

// re-export everything
export * from '@testing-library/react'

// override render method
export { customRender as render, customRenderHook as renderHook }