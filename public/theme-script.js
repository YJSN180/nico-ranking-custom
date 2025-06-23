// Theme initialization script - prevents flash of unstyled content
// This file is served as a static asset to avoid CSP issues
(function() {
  try {
    // First try to read from cookie
    const cookies = document.cookie.split(';');
    const preferenceCookie = cookies.find(cookie => 
      cookie.trim().startsWith('user-preferences=')
    );
    
    if (preferenceCookie) {
      const cookieValue = preferenceCookie.split('=')[1];
      if (cookieValue) {
        const prefs = JSON.parse(decodeURIComponent(cookieValue));
        let theme = prefs.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        return;
      }
    }
    
    // Fallback to localStorage for backward compatibility
    const saved = localStorage.getItem('user-preferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      let theme = prefs.theme || 'light';
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    // Silently fail
  }
})();