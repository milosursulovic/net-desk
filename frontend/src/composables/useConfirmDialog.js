import { ref } from 'vue'

/**
 * Async confirmation instead of the native confirm(). askConfirm() returns a Promise<boolean>
 * that resolves when the user clicks a button in <ConfirmDialog>.
 */
export function useConfirmDialog() {
  const confirmState = ref({ open: false, title: 'Potvrda', message: '' })
  let resolver = null

  function askConfirm(message, { title = 'Potvrda' } = {}) {
    confirmState.value = { open: true, title, message }
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  function resolveConfirm(result) {
    confirmState.value = { ...confirmState.value, open: false }
    resolver?.(result)
    resolver = null
  }

  return { confirmState, askConfirm, resolveConfirm }
}
