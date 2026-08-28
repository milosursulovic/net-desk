// Dark is the only supported theme now (light mode retired) - applied
// synchronously, before first paint, so there's never a flash of the
// browser's default light styling while main.js is still loading. External
// file (not inline) because production serves this through Express/helmet,
// whose default CSP (script-src 'self') blocks inline scripts.
document.documentElement.classList.add('dark')
