// Theme initialization script - prevents flash of unstyled content
// This file is served as a static asset to avoid CSP issues
(function() {
  try {
    const saved = localStorage.getItem('user-preferences');
    if (saved) {
      const prefs = JSON.parse(saved);
      let theme = prefs.theme || 'light';
      // Handle 'darkblue' to 'dark-blue' conversion
      if (theme === 'darkblue') {
        theme = 'dark-blue';
      }
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (e) {
    // Silently fail
  }
})();