import { test } from '@playwright/test'

/**
 * アプリケーションが正常に起動していることを確認するヘルパー関数
 */
export async function waitForAppReady(page: any) {
  const maxRetries = 3
  let retries = 0
  
  while (retries < maxRetries) {
    try {
      // アプリケーションのトップページにアクセス
      await page.goto('/', { waitUntil: 'networkidle' })
      
      // 重要な要素が存在することを確認
      const headerExists = await page.locator('header').count() > 0
      const mainExists = await page.locator('main').count() > 0
      
      if (headerExists && mainExists) {
        // APIエンドポイントが応答することを確認
        const response = await page.evaluate(async () => {
          try {
            const res = await fetch('/api/ranking?genre=all&period=24h')
            return res.ok
          } catch {
            return false
          }
        })
        
        if (response) {
          console.log('App is ready')
          return true
        }
      }
      
      console.log(`App not ready, retrying... (${retries + 1}/${maxRetries})`)
      await page.waitForTimeout(3000)
      retries++
    } catch (error) {
      console.log(`Error checking app readiness: ${error}`)
      retries++
      if (retries >= maxRetries) {
        throw error
      }
      await page.waitForTimeout(3000)
    }
  }
  
  throw new Error('App failed to become ready after maximum retries')
}

/**
 * APIエラーをモニタリングするヘルパー関数
 */
export function setupAPIErrorMonitoring(page: any) {
  const apiErrors: string[] = []
  
  page.on('response', (response: any) => {
    if (response.url().includes('/api/') && !response.ok()) {
      apiErrors.push(`${response.url()} - ${response.status()}`)
    }
  })
  
  page.on('console', (msg: any) => {
    if (msg.type() === 'error') {
      console.log(`Console error: ${msg.text()}`)
    }
  })
  
  return apiErrors
}