// Imported into the auto-generated service worker via vite.config.js's
// workbox.importScripts - handles push events and notification clicks,
// separate from the precaching logic vite-plugin-pwa generates on its own.

self.addEventListener('push', (event) => {
  let data = { title: 'Netdesk', body: '' }
  try {
    data = event.data.json()
  } catch {
    if (event.data) data.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Netdesk', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
