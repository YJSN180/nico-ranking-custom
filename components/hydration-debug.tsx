'use client'

import { useEffect, useState } from 'react'

export function HydrationDebug({ name, value }: { name: string; value: any }) {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
    console.log(`[Hydration Debug] ${name}:`, {
      server: value,
      client: typeof window !== 'undefined' ? value : 'N/A',
      mounted: true
    })
  }, [name, value])
  
  if (!mounted) {
    console.log(`[Hydration Debug] ${name} (SSR):`, value)
  }
  
  return null
}