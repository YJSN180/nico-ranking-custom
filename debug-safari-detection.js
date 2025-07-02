// Debug script to test Safari detection in different environments

function testSafariDetection() {
  console.log('=== Safari Detection Debug ===');
  
  // Current implementation
  function isSafari() {
    if (typeof window === 'undefined') return false;
    
    const ua = navigator.userAgent.toLowerCase();
    const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');
    
    // iOS Safari detection
    const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /webkit/.test(ua) && !ua.includes('crios');
    
    return isSafariBrowser || isIOSSafari;
  }
  
  // Enhanced detection that includes webkit in test environment
  function isSafariEnhanced() {
    if (typeof window === 'undefined') return false;
    
    const ua = navigator.userAgent.toLowerCase();
    console.log('User Agent:', ua);
    
    // Original Safari detection
    const isSafariBrowser = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');
    console.log('isSafariBrowser:', isSafariBrowser);
    
    // iOS Safari detection
    const isIOSSafari = /iphone|ipad|ipod/.test(ua) && /webkit/.test(ua) && !ua.includes('crios');
    console.log('isIOSSafari:', isIOSSafari);
    
    // Enhanced: Playwright webkit detection
    const isPlaywrightWebkit = ua.includes('webkit') && ua.includes('version/') && !ua.includes('chrome');
    console.log('isPlaywrightWebkit:', isPlaywrightWebkit);
    
    // Test environment detection
    const isTestEnv = typeof window !== 'undefined' && window.__TEST_ENV__;
    const isWebkit = ua.includes('webkit');
    console.log('isTestEnv:', isTestEnv, 'isWebkit:', isWebkit);
    
    return isSafariBrowser || isIOSSafari || (isTestEnv && isWebkit) || isPlaywrightWebkit;
  }
  
  console.log('Current isSafari():', isSafari());
  console.log('Enhanced isSafari():', isSafariEnhanced());
  
  // Test various User-Agent strings
  const testUserAgents = [
    // Real Safari Desktop
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    // Real Safari iOS
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    // Playwright WebKit (likely what we're seeing)
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    // Chrome
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  
  console.log('\n=== Testing Various User Agents ===');
  testUserAgents.forEach((ua, index) => {
    console.log(`\nTest ${index + 1}: ${ua.substring(0, 60)}...`);
    
    const mockNavigator = { userAgent: ua };
    const originalNavigator = navigator;
    
    // Mock navigator temporarily
    Object.defineProperty(window, 'navigator', {
      value: mockNavigator,
      configurable: true
    });
    
    console.log('  Current detection:', isSafari());
    console.log('  Enhanced detection:', isSafariEnhanced());
    
    // Restore original navigator
    Object.defineProperty(window, 'navigator', {
      value: originalNavigator,
      configurable: true
    });
  });
}

// Run if in browser environment
if (typeof window !== 'undefined') {
  testSafariDetection();
}

module.exports = { testSafariDetection };