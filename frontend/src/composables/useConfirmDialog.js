import { ref } from 'vue'

/**
 * Async potvrda umesto native confirm(). askConfirm() vraća Promise<boolean>
 * koji se razrešava kad korisnik klikne na dugme u <ConfirmDialog>.
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
