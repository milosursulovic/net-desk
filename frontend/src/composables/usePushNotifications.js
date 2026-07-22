import { ref } from 'vue'
import { fetchWithAuth } from '@/utils/fetchWithAuth.js'

// Push subscription keys arrive base64url-encoded (VAPID public key too) -
// the browser's pushManager.subscribe() needs a raw Uint8Array instead.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const isSupported = 'serviceWorker' in navigator && 'PushManager' in window
  const isSubscribed = ref(false)
  const loading = ref(false)
  const error = ref(null)

  async function checkSubscription() {
    if (!isSupported) return
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    isSubscribed.value = !!sub
  }

  async function subscribe() {
    if (!isSupported) {
      error.value = 'Push notifikacije nisu podržane u ovom browseru'
      return
    }
    loading.value = true
    error.value = null
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        error.value = 'Dozvola za notifikacije nije data'
        return
      }

      const keyRes = await fetchWithAuth('/api/protected/push/public-key')
      if (!keyRes.ok) throw new Error(`HTTP ${keyRes.status}`)
      const { publicKey } = await keyRes.json()

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })

      const json = subscription.toJSON()
      const res = await fetchWithAuth('/api/protected/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      isSubscribed.value = true
    } catch (err) {
      console.error('Neuspešna prijava na push notifikacije:', err)
      error.value = 'Neuspešna prijava na push notifikacije'
    } finally {
      loading.value = false
    }
  }

  async function unsubscribe() {
    if (!isSupported) return
    loading.value = true
    error.value = null
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await fetchWithAuth('/api/protected/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint }),
        })
      }
      isSubscribed.value = false
    } catch (err) {
      console.error('Neuspešno gašenje push notifikacija:', err)
      error.value = 'Neuspešno gašenje push notifikacija'
    } finally {
      loading.value = false
    }
  }

  return { isSupported, isSubscribed, loading, error, checkSubscription, subscribe, unsubscribe }
}
