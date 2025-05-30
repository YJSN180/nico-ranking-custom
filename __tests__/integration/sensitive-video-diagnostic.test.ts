import { describe, it, expect } from 'vitest'

describe('Sensitive Video Diagnostic Tests', () => {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  
  describe('Direct V2 Implementation Test', () => {
    it('should return sensitive videos from completeHybridScrapeV2', async () => {
      const response = await fetch(`${baseUrl}/api/debug/test-v2-direct?genre=all`)
      const data = await response.json()
      
      expect(response.ok).toBe(true)
      expect(data.success).toBe(true)
      expect(data.analysis.totalItems).toBeGreaterThan(0)
      
      // Log sensitive video information
      console.log('V2 Direct Test Results:')
      console.log(`- Total items: ${data.analysis.totalItems}`)
      console.log(`- Sensitive items: ${data.analysis.sensitiveItems}`)
      console.log(`- Sample sensitive videos:`, data.analysis.sensitiveVideos)
      
      // Check if sensitive videos are being detected
      if (data.analysis.sensitiveItems > 0) {
        console.log('✓ Sensitive videos ARE being detected by V2')
      } else {
        console.log('✗ NO sensitive videos detected by V2')
      }
    })
  })
  
  describe('Compare Methods Test', () => {
    it('should compare all scraping methods', async () => {
      const response = await fetch(`${baseUrl}/api/debug/compare-methods?genre=all`)
      const data = await response.json()
      
      expect(response.ok).toBe(true)
      
      console.log('\nMethod Comparison Results:')
      Object.entries(data.methods).forEach(([method, result]: [string, any]) => {
        if (result.status === 'success') {
          console.log(`\n${method}:`)
          console.log(`  - Total: ${result.totalItems}`)
          console.log(`  - Sensitive: ${result.sensitiveItems || 0}`)
          if (result.sampleSensitive?.length > 0) {
            console.log(`  - Sample:`, result.sampleSensitive[0])
          }
        }
      })
      
      if (data.analysis?.diagnosis) {
        console.log('\nDiagnosis:')
        console.log(`- HTML Meta has sensitive: ${data.analysis.diagnosis.htmlMetaHasSensitive}`)
        console.log(`- Hybrid V2 preserves sensitive: ${data.analysis.diagnosis.hybridV2PreservesSensitive}`)
        console.log(`- Issues:`, data.analysis.diagnosis.possibleIssues)
      }
    })
  })
  
  describe('Save Process Test', () => {
    it('should track sensitive videos through save pipeline', async () => {
      const response = await fetch(`${baseUrl}/api/debug/test-save-process?genre=all&dryRun=true`)
      const data = await response.json()
      
      expect(response.ok).toBe(true)
      
      console.log('\nSave Process Pipeline:')
      if (data.analysis?.sensitiveVideoTracking) {
        const tracking = data.analysis.sensitiveVideoTracking
        console.log(`- After scraping: ${tracking.afterScraping} sensitive videos`)
        console.log(`- After destructuring: ${tracking.afterDestructuring} sensitive videos`)
        console.log(`- In prepared data: ${tracking.inPreparedData} sensitive videos`)
        console.log(`- In KV: ${tracking.inKV} sensitive videos`)
        console.log(`- Preserved: ${tracking.preserved}`)
      }
      
      if (data.analysis?.issues?.length > 0) {
        console.log('\nIssues found:')
        data.analysis.issues.forEach((issue: string) => console.log(`- ${issue}`))
      }
    })
  })
  
  describe('Comprehensive Diagnostic', () => {
    it('should run full diagnostic', async () => {
      const response = await fetch(`${baseUrl}/api/debug/diagnostic?genre=all`)
      const data = await response.json()
      
      expect(response.ok).toBe(true)
      
      console.log('\nComprehensive Diagnostic Results:')
      console.log(`Environment: ${data.environment.isVercel ? 'Vercel' : 'Local'}`)
      
      // Check each test result
      if (data.results?.htmlFetch?.status === 'success') {
        console.log(`\nHTML Fetch:`)
        console.log(`- Total items: ${data.results.htmlFetch.totalItems}`)
        console.log(`- Sensitive items: ${data.results.htmlFetch.sensitiveItems}`)
      }
      
      if (data.results?.hybridScrape?.status === 'success') {
        console.log(`\nHybrid Scrape (${data.results.hybridScrape.version}):`)
        console.log(`- Total items: ${data.results.hybridScrape.totalItems}`)
        console.log(`- Sensitive items: ${data.results.hybridScrape.sensitiveItems}`)
      }
      
      if (data.results?.sensitiveCheck) {
        console.log(`\nSensitive Video Analysis:`)
        console.log(`- Is sensitive filtered: ${data.results.sensitiveCheck.isSensitiveFiltered}`)
        if (data.results.sensitiveCheck.comparison?.hybridVsHtml) {
          const comp = data.results.sensitiveCheck.comparison.hybridVsHtml
          console.log(`- Hybrid vs HTML sensitive difference: ${comp.sensitiveDifference}`)
        }
      }
    })
  })
})