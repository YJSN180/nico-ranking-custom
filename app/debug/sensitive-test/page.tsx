'use client'

import { useState } from 'react'

export default function SensitiveTestPage() {
  const [results, setResults] = useState<any>({})
  const [loading, setLoading] = useState<string | null>(null)
  const [genre, setGenre] = useState('all')

  const runTest = async (testName: string, endpoint: string) => {
    setLoading(testName)
    try {
      const response = await fetch(endpoint)
      const data = await response.json()
      setResults((prev: any) => ({ ...prev, [testName]: data }))
    } catch (error) {
      setResults((prev: any) => ({ 
        ...prev, 
        [testName]: { error: error instanceof Error ? error.message : 'Unknown error' } 
      }))
    }
    setLoading(null)
  }

  const tests = [
    {
      name: 'v2Direct',
      label: 'V2 Direct Test',
      endpoint: `/api/debug/test-v2-direct?genre=${genre}`,
      description: 'Test the V2 implementation directly'
    },
    {
      name: 'compareMethods',
      label: 'Compare Methods',
      endpoint: `/api/debug/compare-methods?genre=${genre}`,
      description: 'Compare all scraping methods'
    },
    {
      name: 'saveProcess',
      label: 'Save Process',
      endpoint: `/api/debug/test-save-process?genre=${genre}&dryRun=true`,
      description: 'Test the save pipeline'
    },
    {
      name: 'diagnostic',
      label: 'Full Diagnostic',
      endpoint: `/api/debug/diagnostic?genre=${genre}`,
      description: 'Run comprehensive diagnostic'
    },
    {
      name: 'testCron',
      label: 'Test Cron',
      endpoint: `/api/debug/test-cron?genre=${genre}&simulate=true`,
      description: 'Simulate cron job update'
    }
  ]

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Sensitive Video Diagnostic Tests</h1>
      
      <div className="mb-4">
        <label className="block mb-2">Genre:</label>
        <select 
          value={genre} 
          onChange={(e) => setGenre(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="all">All</option>
          <option value="entertainment">Entertainment</option>
          <option value="anime">Anime</option>
          <option value="game">Game</option>
          <option value="r18">R18</option>
        </select>
      </div>

      <div className="space-y-4">
        {tests.map((test) => (
          <div key={test.name} className="border p-4 rounded">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h2 className="text-lg font-semibold">{test.label}</h2>
                <p className="text-sm text-gray-600">{test.description}</p>
              </div>
              <button
                onClick={() => runTest(test.name, test.endpoint)}
                disabled={loading === test.name}
                className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
              >
                {loading === test.name ? 'Running...' : 'Run Test'}
              </button>
            </div>
            
            {results[test.name] && (
              <div className="mt-4">
                <h3 className="font-semibold mb-2">Results:</h3>
                <pre className="bg-gray-100 p-4 rounded overflow-auto max-h-96 text-xs">
                  {JSON.stringify(results[test.name], null, 2)}
                </pre>
                
                {/* Special handling for specific tests */}
                {test.name === 'v2Direct' && results[test.name]?.analysis && (
                  <div className="mt-2 p-2 bg-yellow-100 rounded">
                    <p><strong>Sensitive Videos:</strong> {results[test.name].analysis.sensitiveItems} / {results[test.name].analysis.totalItems}</p>
                    {results[test.name].analysis.sensitiveVideos?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold">Sample Sensitive Videos:</p>
                        {results[test.name].analysis.sensitiveVideos.map((video: any) => (
                          <div key={video.id} className="text-sm">
                            - {video.id}: {video.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {test.name === 'compareMethods' && results[test.name]?.analysis?.diagnosis && (
                  <div className="mt-2 p-2 bg-yellow-100 rounded">
                    <p><strong>HTML Meta has sensitive:</strong> {results[test.name].analysis.diagnosis.htmlMetaHasSensitive ? 'Yes' : 'No'}</p>
                    <p><strong>Hybrid V2 preserves sensitive:</strong> {results[test.name].analysis.diagnosis.hybridV2PreservesSensitive ? 'Yes' : 'No'}</p>
                    {results[test.name].analysis.diagnosis.possibleIssues?.length > 0 && (
                      <div className="mt-2">
                        <p className="font-semibold">Issues:</p>
                        {results[test.name].analysis.diagnosis.possibleIssues.map((issue: string, i: number) => (
                          <p key={i} className="text-sm text-red-600">- {issue}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}