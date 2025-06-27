'use client'

import { useState, useEffect } from 'react'
import { DBManager } from '@/lib/storage/db-manager'
import { MylistManager } from '@/lib/storage/mylists'

export default function TestDBPage() {
  const [status, setStatus] = useState<string[]>(['Starting test...'])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const test = async () => {
      const logs: string[] = []
      
      try {
        logs.push('Creating DBManager...')
        setStatus([...logs])
        
        const dbManager = new DBManager()
        
        logs.push('Initializing DBManager...')
        setStatus([...logs])
        
        await dbManager.init()
        
        logs.push('DBManager initialized successfully!')
        logs.push(`DB Version: ${dbManager.getVersion()}`)
        
        const stores = await dbManager.getStoreNames()
        logs.push(`Object stores: ${stores.join(', ')}`)
        setStatus([...logs])
        
        logs.push('Creating MylistManager...')
        setStatus([...logs])
        
        const mylistManager = new MylistManager(dbManager)
        
        logs.push('Getting or creating default mylist...')
        setStatus([...logs])
        
        const defaultMylist = await mylistManager.getOrCreateDefaultMylist()
        logs.push(`Default mylist created: ${JSON.stringify(defaultMylist, null, 2)}`)
        setStatus([...logs])
        
        logs.push('Getting all mylists...')
        setStatus([...logs])
        
        const allMylists = await mylistManager.getAllMylists()
        logs.push(`Total mylists: ${allMylists.length}`)
        setStatus([...logs])
        
        logs.push('✅ All tests passed!')
        setStatus([...logs])
        
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        logs.push(`❌ Error: ${errorMsg}`)
        setStatus([...logs])
        setError(errorMsg)
        // eslint-disable-next-line no-console
        console.error('Test error:', err)
      }
    }
    
    test()
  }, [])

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>IndexedDB Test Page</h1>
      
      <div style={{ 
        background: '#f5f5f5', 
        padding: '20px', 
        borderRadius: '8px',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap'
      }}>
        {status.map((log, index) => (
          <div key={index}>{log}</div>
        ))}
      </div>
      
      {error && (
        <div style={{ 
          marginTop: '20px',
          padding: '10px',
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '4px',
          color: '#c00'
        }}>
          Error: {error}
        </div>
      )}
    </div>
  )
}