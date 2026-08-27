import { ref } from 'vue'

export function useToast() {
  const toast = ref(null)
  let timer = null

  const showToast = (text, { kind = 'success', duration = 2000 } = {}) => {
    toast.value = { text, kind }
    clearTimeout(timer)
    timer = setTimeout(() => {
      toast.value = null
    }, duration)
  }

  const copyToClipboard = async (text, label = 'Kopirano!') => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(label)
    } catch {
      showToast('Neuspešno kopiranje', { kind: 'error' })
    }
  }

  const clearToast = () => {
    clearTimeout(timer)
    toast.value = null
  }

  return { toast, showToast, copyToClipboard, clearToast }
}
