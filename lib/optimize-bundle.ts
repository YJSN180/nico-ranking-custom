// Bundle optimization utilities
export const CRITICAL_MODULES = [
  'react',
  'react-dom',
  'next/navigation',
  'next/link',
  'next/image'
]

export const DEFER_MODULES = [
  'web-vitals',
  'pako',
  'qrcode',
  'idb'
]

// Resource hints for critical resources
export function generateResourceHints() {
  return `
    <link rel="preload" href="/_next/static/chunks/react.js" as="script" crossorigin="anonymous" />
    <link rel="preload" href="/_next/static/chunks/react-dom.js" as="script" crossorigin="anonymous" />
    <link rel="preload" href="/_next/static/chunks/framework.js" as="script" crossorigin="anonymous" />
    <link rel="modulepreload" href="/_next/static/chunks/main-app.js" crossorigin="anonymous" />
    <link rel="prefetch" href="/_next/static/chunks/vendor-misc.js" as="script" crossorigin="anonymous" />
  `
}

// Progressive Enhancement Script
export function getProgressiveEnhancementScript() {
  return `
    // Progressive enhancement for non-critical features
    (function() {
      'use strict';
      
      // Defer non-critical module loading
      if ('requestIdleCallback' in window) {
        requestIdleCallback(function() {
          // Load Web Vitals monitoring
          import('/web-vitals').then(function(module) {
            module.onCLS(console.log);
            module.onFID(console.log);
            module.onFCP(console.log);
            module.onLCP(console.log);
            module.onTTFB(console.log);
          }).catch(function() {
            // Silently fail if module not found
          });
          
          // Load PWA registration
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js', { scope: '/' });
          }
        }, { timeout: 2000 });
      }
      
      // Intersection Observer for lazy loading
      if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              const img = entry.target;
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
                imageObserver.unobserve(img);
              }
            }
          });
        }, {
          rootMargin: '50px 0px',
          threshold: 0.01
        });
        
        // Observe all images with data-src
        document.addEventListener('DOMContentLoaded', function() {
          const lazyImages = document.querySelectorAll('img[data-src]');
          lazyImages.forEach(function(img) {
            imageObserver.observe(img);
          });
        });
      }
    })();
  `
}

// Script Loading Strategy
export function getScriptLoadingStrategy() {
  return `
    <script>
      // Prioritize critical scripts
      (function() {
        var criticalScripts = [
          '/_next/static/chunks/react.js',
          '/_next/static/chunks/react-dom.js',
          '/_next/static/chunks/framework.js'
        ];
        
        var head = document.head || document.getElementsByTagName('head')[0];
        
        criticalScripts.forEach(function(src) {
          var link = document.createElement('link');
          link.rel = 'preload';
          link.as = 'script';
          link.href = src;
          link.crossOrigin = 'anonymous';
          head.appendChild(link);
        });
        
        // Defer non-critical scripts
        window.addEventListener('load', function() {
          setTimeout(function() {
            var deferredScripts = document.querySelectorAll('script[data-defer]');
            deferredScripts.forEach(function(script) {
              var newScript = document.createElement('script');
              newScript.src = script.dataset.src;
              newScript.async = true;
              document.body.appendChild(newScript);
            });
          }, 100);
        });
      })();
    </script>
  `
}