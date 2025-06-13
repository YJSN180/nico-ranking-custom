// Theme initialization script - prevents flash of unstyled content
// This file is served as a static asset to avoid CSP issues
(function() {
  try {
    const saved = localStorage.getItem('user-preferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      const theme = prefs.theme || 'light';
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    // Silently fail
  }
})();