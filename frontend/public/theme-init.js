// Applied synchronously, before first paint, so the page doesn't flash
// light-then-dark (or vice versa) while main.js is still loading - must
// stay in sync with useTheme.js's own logic. External file (not inline)
// because production serves this through Express/helmet, whose default CSP
// (script-src 'self') blocks inline scripts.
(function () {
  var stored = localStorage.getItem('netdesk-theme') || 'system'
  var isDark = stored === 'dark' || (stored === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (isDark) document.documentElement.classList.add('dark')
})()
