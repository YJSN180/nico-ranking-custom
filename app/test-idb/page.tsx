'use client'

import { useEffect, useState } from 'react'

export default function TestIDB() {
  const [logs, setLogs] = useState<string[]>([])
  const [dbStatus, setDbStatus] = useState<'pending' | 'success' | 'error'>('pending')

  const addLog = (message: string) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] ${message}`)
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  useEffect(() => {
    const testIndexedDB = async () => {
      addLog('=== Starting Detailed IndexedDB Test ===')
      addLog(`User Agent: ${navigator.userAgent}`)
      addLog(`Document ready state: ${document.readyState}`)
      
      try {
        // Test 1: Check basic environment
        addLog('\n--- Test 1: Environment Check ---')
        addLog(`typeof window: ${typeof window}`)
        addLog(`typeof window.indexedDB: ${typeof window.indexedDB}`)
        addLog(`React version: ${require('react').version}`)
        
        // Test 2: Native IndexedDB
        addLog('\n--- Test 2: Native IndexedDB ---')
        const nativeRequest = window.indexedDB.open('test-native', 1)
        
        await new Promise((resolve, reject) => {
          let timeoutId = setTimeout(() => {
            addLog('WARNING: Native IndexedDB request timed out after 5s')
            reject(new Error('Native IndexedDB timeout'))
          }, 5000)
          
          nativeRequest.onsuccess = () => {
            clearTimeout(timeoutId)
            addLog('Native IndexedDB opened successfully')
            nativeRequest.result.close()
            resolve(true)
          }
          
          nativeRequest.onerror = () => {
            clearTimeout(timeoutId)
            addLog(`Native IndexedDB error: ${nativeRequest.error}`)
            reject(nativeRequest.error)
          }
        })
        
        // Test 3: Dynamic import of idb
        addLog('\n--- Test 3: IDB Library Import ---')
        addLog('Before dynamic import...')
        const idbModule = await import('idb')
        addLog('After dynamic import')
        addLog(`idb module keys: ${Object.keys(idbModule).join(', ')}`)
        
        // Test 4: Simple idb open
        addLog('\n--- Test 4: Simple IDB Open ---')
        const { openDB } = idbModule
        addLog('Calling openDB...')
        
        const simpleDb = await Promise.race([
          openDB('test-simple-idb', 1),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('openDB timeout after 5s')), 5000)
          )
        ])
        
        addLog('Simple IDB opened successfully')
        if (simpleDb && typeof (simpleDb as any).close === 'function') {
          (simpleDb as any).close()
        }
        
        // Test 5: IDB with upgrade
        addLog('\n--- Test 5: IDB with Upgrade ---')
        let upgradeCallbackFired = false
        
        const dbWithUpgrade = await Promise.race([
          openDB('test-upgrade-idb', 1, {
            upgrade(db) {
              upgradeCallbackFired = true
              addLog('Upgrade callback fired!')
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('openDB with upgrade timeout after 5s')), 5000)
          )
        ])
        
        addLog(`Upgrade callback fired: ${upgradeCallbackFired}`)
        if (dbWithUpgrade && typeof (dbWithUpgrade as any).close === 'function') {
          (dbWithUpgrade as any).close()
        }
        
        // Test 6: Reproduce the exact pattern from DBManager
        addLog('\n--- Test 6: DBManager Pattern ---')
        const testDb = await Promise.race([
          openDB('nicoran-db-test', 2, {
            upgrade(db, oldVersion) {
              addLog(`DBManager pattern upgrade called: oldVersion=${oldVersion}`)
              if (!db.objectStoreNames.contains('mylists')) {
                db.createObjectStore('mylists', { keyPath: 'id' })
                addLog('Created mylists store')
              }
            }
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('DBManager pattern timeout after 5s')), 5000)
          )
        ])
        
        addLog('DBManager pattern successful')
        if (testDb && typeof (testDb as any).close === 'function') {
          (testDb as any).close()
        }
        
        setDbStatus('success')
        addLog('\n=== All tests completed successfully! ===')
        
      } catch (error) {
        setDbStatus('error')
        addLog(`\n❌ ERROR: ${error instanceof Error ? error.message : String(error)}`)
        if (error instanceof Error && error.stack) {
          addLog('Stack trace:')
          error.stack.split('\n').forEach(line => addLog(line))
        }
      }
    }

    // Run tests after a short delay
    const timer = setTimeout(() => {
      testIndexedDB()
    }, 500)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Detailed IndexedDB Test</h1>
      <p>
        Status: {' '}
        <strong style={{ 
          color: dbStatus === 'success' ? 'green' : dbStatus === 'error' ? 'red' : 'orange' 
        }}>
          {dbStatus === 'pending' ? 'Testing...' : dbStatus}
        </strong>
      </p>
      
      <div style={{ 
        backgroundColor: '#1e1e1e', 
        color: '#d4d4d4',
        padding: '15px', 
        borderRadius: '5px',
        maxHeight: '70vh',
        overflow: 'auto',
        fontSize: '12px',
        lineHeight: '1.5'
      }}>
        {logs.map((log, index) => (
          <div key={index} style={{ 
            color: log.includes('ERROR') || log.includes('❌') ? '#ff6b6b' : 
                  log.includes('WARNING') ? '#ffd43b' :
                  log.includes('===') || log.includes('---') ? '#4fc3f7' :
                  log.includes('successfully') || log.includes('✅') ? '#51cf66' : 
                  '#d4d4d4'
          }}>
            {log}
          </div>
        ))}
      </div>
      
      <div style={{ marginTop: '20px' }}>
        <button 
          onClick={() => window.location.reload()} 
          style={{ 
            padding: '10px 20px', 
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: '#4fc3f7',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Reload Page
        </button>
      </div>
    </div>
  )
}