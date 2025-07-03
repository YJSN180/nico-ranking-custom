'use client'

import { useEffect, useState } from 'react'
import { useRankingProcessorWorker } from '@/hooks/use-ranking-processor-worker'

export default function TestWorker() {
  const { filterRankings, isProcessing } = useRankingProcessorWorker()
  const [result, setResult] = useState<string>('')
  
  useEffect(() => {
    // Test the Worker
    const testData = [
      { id: '1', rank: 1, title: 'Test Video 1', thumbURL: 'https://example.com/thumb1.jpg', views: 1000 },
      { id: '2', rank: 2, title: 'NG Test Video', authorName: 'Test Author', thumbURL: 'https://example.com/thumb2.jpg', views: 2000 },
      { id: '3', rank: 3, title: 'Test Video 3', thumbURL: 'https://example.com/thumb3.jpg', views: 3000 }
    ]
    
    const ngList = {
      videoIds: [],
      videoTitles: {
        exact: [],
        partial: ['NG Test']
      },
      authorIds: [],
      authorNames: {
        exact: [],
        partial: []
      }
    }
    
    filterRankings(testData, ngList).then(filtered => {
      setResult(`Filtered ${testData.length} items to ${filtered.length} items`)
    }).catch(error => {
      setResult(`Error: ${error.message}`)
    })
  }, [filterRankings])
  
  return (
    <div style={{ padding: '20px' }}>
      <h1>Web Worker Test</h1>
      <p>Processing: {isProcessing ? 'Yes' : 'No'}</p>
      <p>Result: {result}</p>
      <p>Check browser console for Worker logs</p>
    </div>
  )
}