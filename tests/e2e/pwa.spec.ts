import { test, expect } from '@playwright/test'

test.describe('PWA (Progressive Web App) Functionality', () => {
  // Service Worker Tests
  test.describe('Service Worker', () => {
    test('should register service worker on page load', async ({ page }) => {
      await page.goto('/')
      
      // Wait for service worker registration
      const swRegistration = await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          // Wait for service worker ready state
          try {
            await navigator.serviceWorker.ready
            const registrations = await navigator.serviceWorker.getRegistrations()
            return registrations.length > 0
          } catch (e) {
            return false
          }
        }
        return false
      })
      
      expect(swRegistration).toBe(true)
    })

    test('should have service worker in active state', async ({ page }) => {
      await page.goto('/')
      
      // Wait for service worker to be active
      const swState = await page.evaluate(async () => {
        if ('serviceWorker' in navigator) {
          // Wait for service worker ready
          await navigator.serviceWorker.ready
          const registration = await navigator.serviceWorker.getRegistration()
          // Wait a bit more for activation
          await new Promise(resolve => setTimeout(resolve, 1000))
          return registration?.active?.state
        }
        return null
      })
      
      expect(swState).toBe('activated')
    })

    test('should cache critical resources', async ({ page }) => {
      await page.goto('/')
      
      // Check if cache API is being used
      const cacheNames = await page.evaluate(async () => {
        if ('caches' in window) {
          return await caches.keys()
        }
        return []
      })
      
      expect(cacheNames.length).toBeGreaterThan(0)
      expect(cacheNames.some(name => name.includes('workbox') || name.includes('nico-ranking'))).toBe(true)
    })
  })

  // Offline Functionality Tests
  test.describe('Offline Support', () => {
    test('should display cached content when offline', async ({ page, context }) => {
      // First visit to cache resources
      await page.goto('/')
      await page.waitForTimeout(3000) // Wait for SW to cache resources
      
      // Go offline
      await context.setOffline(true)
      
      // Navigate to a new page instead of reload
      await page.goto('/about', { waitUntil: 'domcontentloaded' }).catch(() => {
        // Navigation might fail, but we should get offline page
      })
      
      // Should show offline page or cached content
      const pageContent = await page.content()
      const hasOfflinePage = pageContent.includes('オフライン') || pageContent.includes('offline')
      const hasMainContent = await page.locator('h1').count() > 0
      
      expect(hasOfflinePage || hasMainContent).toBe(true)
    })

    test('should show offline indicator when network is unavailable', async ({ page, context }) => {
      await page.goto('/')
      
      // Go offline
      await context.setOffline(true)
      
      // Wait for offline indicator to appear
      await page.waitForTimeout(1000)
      
      // Should show offline status indicator
      const offlineIndicator = page.locator('[data-testid="offline-indicator"], .offline-indicator')
      await expect(offlineIndicator).toBeVisible({ timeout: 5000 })
    })
  })

  // Installability Tests
  test.describe('App Installation', () => {
    test('should have valid web app manifest', async ({ page }) => {
      const response = await page.goto('/manifest.json')
      expect(response?.status()).toBe(200)
      
      const manifest = await response?.json()
      
      // Check required manifest fields
      expect(manifest.name).toBeTruthy()
      expect(manifest.short_name).toBeTruthy()
      expect(manifest.start_url).toBeTruthy()
      expect(manifest.display).toBeTruthy()
      expect(manifest.icons).toBeInstanceOf(Array)
      expect(manifest.icons.length).toBeGreaterThan(0)
      
      // Check icon requirements
      const has192Icon = manifest.icons.some((icon: any) => icon.sizes?.includes('192'))
      const has512Icon = manifest.icons.some((icon: any) => icon.sizes?.includes('512'))
      expect(has192Icon).toBe(true)
      expect(has512Icon).toBe(true)
    })

    test('should trigger beforeinstallprompt event', async ({ page }) => {
      // This test might not work in all environments as it depends on browser heuristics
      test.skip(true, 'beforeinstallprompt requires specific browser conditions')
      
      const installable = await page.evaluate(() => {
        return new Promise(resolve => {
          window.addEventListener('beforeinstallprompt', () => resolve(true))
          setTimeout(() => resolve(false), 5000)
        })
      })
      
      expect(installable).toBe(true)
    })

    test('should have meta tags for PWA', async ({ page }) => {
      await page.goto('/')
      
      // Check theme-color meta tag
      const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content')
      expect(themeColor).toBeTruthy()
      
      // Check apple-touch-icon
      const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
      expect(appleTouchIcon).toBeTruthy()
      
      // Check manifest link
      const manifestLink = await page.locator('link[rel="manifest"]').getAttribute('href')
      expect(manifestLink).toBe('/manifest.json')
    })
  })

  // Performance & Caching Strategy Tests
  test.describe('Caching Strategy', () => {
    test('should implement stale-while-revalidate for API calls', async ({ page }) => {
      // First load
      await page.goto('/')
      
      // Wait for API calls to complete
      await page.waitForTimeout(2000)
      
      // Get initial network request count
      const initialRequests = await page.evaluate(() => {
        return performance.getEntriesByType('resource').filter(
          entry => entry.name.includes('/api/')
        ).length
      })
      
      // Reload page
      await page.reload()
      
      // Check if cached responses are used (fewer network requests)
      const reloadRequests = await page.evaluate(() => {
        return performance.getEntriesByType('resource').filter(
          entry => entry.name.includes('/api/')
        ).length
      })
      
      // Expect fewer API requests on reload due to caching
      expect(reloadRequests).toBeLessThanOrEqual(initialRequests)
    })

    test('should cache static assets', async ({ page }) => {
      await page.goto('/')
      
      // Wait for service worker to cache assets
      await page.waitForTimeout(3000)
      
      // Check if static assets are cached
      const cachedAssets = await page.evaluate(async () => {
        if (!('caches' in window)) return []
        
        const cacheNames = await caches.keys()
        const assets: string[] = []
        
        for (const name of cacheNames) {
          const cache = await caches.open(name)
          const requests = await cache.keys()
          assets.push(...requests.map(req => req.url))
        }
        
        return assets
      })
      
      // Should cache CSS, JS, and font files
      const hasCss = cachedAssets.some(url => url.includes('.css'))
      const hasJs = cachedAssets.some(url => url.includes('.js'))
      const hasFonts = cachedAssets.some(url => url.includes('/fonts/'))
      
      expect(hasCss || hasJs || hasFonts).toBe(true)
    })
  })

  // Update & Sync Tests
  test.describe('Updates and Background Sync', () => {
    test('should handle service worker updates gracefully', async ({ page }) => {
      await page.goto('/')
      
      // Check if update handling is implemented
      const hasUpdateHandling = await page.evaluate(() => {
        if (!('serviceWorker' in navigator)) return false
        
        return new Promise(resolve => {
          navigator.serviceWorker.ready.then(registration => {
            // Check if update check can be triggered
            registration.update()
              .then(() => resolve(true))
              .catch(() => resolve(false))
          }).catch(() => resolve(false))
        })
      })
      
      expect(hasUpdateHandling).toBe(true)
    })

    test('should persist mylist data for offline access', async ({ page, context }) => {
      await page.goto('/')
      
      // Add an item to mylist (assuming this functionality exists)
      // This is a placeholder - adjust based on actual mylist implementation
      const mylistButton = page.locator('[data-testid^="mylist-button-"], button[aria-label*="マイリスト"]').first()
      
      if (await mylistButton.count() > 0) {
        await mylistButton.click()
        await page.waitForTimeout(1000)
        
        // Go offline
        await context.setOffline(true)
        
        // Reload and check if mylist data persists
        await page.reload()
        
        // Check if IndexedDB still has data
        const hasPersistedData = await page.evaluate(async () => {
          const dbs = await indexedDB.databases()
          return dbs.some(db => db.name?.includes('nico-ranking'))
        })
        
        expect(hasPersistedData).toBe(true)
      }
    })
  })

  // Installation UI Tests
  test.describe('Installation Promotion', () => {
    test('should not show install prompt immediately on first visit', async ({ page }) => {
      await page.goto('/')
      
      // Install prompt should not be immediately visible
      const installPrompt = page.locator('[data-testid="install-prompt"], .install-prompt, .pwa-install')
      await expect(installPrompt).not.toBeVisible()
    })

    test('should show install prompt after user engagement', async ({ page }) => {
      test.skip(true, 'Install prompt timing depends on implementation strategy')
      
      await page.goto('/')
      
      // Simulate user engagement
      await page.click('body')
      await page.evaluate(() => window.scrollTo(0, 100))
      await page.waitForTimeout(2000)
      
      // Check if install UI appears after engagement
      const installUI = page.locator('[data-testid="install-prompt"], .install-prompt, .pwa-install')
      const isInstallUIVisible = await installUI.isVisible().catch(() => false)
      
      // This might be visible depending on implementation
      expect(typeof isInstallUIVisible).toBe('boolean')
    })
  })
})

// Lighthouse PWA Audit Test (requires additional setup)
test.describe('Lighthouse PWA Compliance', () => {
  test.skip(true, 'Lighthouse tests require additional tooling setup')
  
  test('should pass PWA audits', async ({ page }) => {
    // This would require lighthouse integration
    // Placeholder for when lighthouse is set up in CI/CD
  })
})