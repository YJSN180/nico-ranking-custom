import { chromium } from 'playwright';

async function testServiceWorker() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Enable console logging
  page.on('console', msg => console.log('Browser console:', msg.text()));
  page.on('pageerror', err => console.error('Page error:', err));
  
  // Navigate to the site
  console.log('Navigating to http://localhost:3001...');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle' });
  
  // Check if service worker is available
  const hasServiceWorker = await page.evaluate(() => {
    return 'serviceWorker' in navigator;
  });
  console.log('Service Worker API available:', hasServiceWorker);
  
  // Try to access /sw.js directly
  console.log('Checking if /sw.js is accessible...');
  const swResponse = await page.goto('http://localhost:3001/sw.js');
  console.log('SW.js status:', swResponse?.status());
  
  if (swResponse?.status() === 200) {
    const swContent = await swResponse.text();
    console.log('SW.js content length:', swContent.length);
    console.log('SW.js starts with:', swContent.substring(0, 100));
  }
  
  // Go back to main page
  await page.goto('http://localhost:3001');
  
  // Wait a bit for registration
  await page.waitForTimeout(5000);
  
  // Check service worker registrations
  const registrations = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map(reg => ({
      scope: reg.scope,
      active: reg.active?.state,
      installing: reg.installing?.state,
      waiting: reg.waiting?.state,
      scriptURL: reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL
    }));
  });
  
  console.log('Service Worker Registrations:', JSON.stringify(registrations, null, 2));
  
  // Check if PWA register component is present
  const hasPwaRegister = await page.evaluate(() => {
    return document.querySelector('script')?.textContent?.includes('serviceWorker.register') || false;
  });
  console.log('PWA register script found:', hasPwaRegister);
  
  // Keep browser open for inspection
  console.log('\nTest complete. Browser will stay open for 30 seconds...');
  await page.waitForTimeout(30000);
  
  await browser.close();
}

// Run the test
testServiceWorker().catch(console.error);