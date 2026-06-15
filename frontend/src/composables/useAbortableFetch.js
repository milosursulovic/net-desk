import { onBeforeUnmount } from 'vue'

export function useAbortableFetch() {
  let controller = new AbortController()

  function getSignal() {
    controller.abort()
    controller = new AbortController()
    return controller.signal
  }

  function abort() {
    controller.abort()
  }

  onBeforeUnmount(abort)

  return { getSignal, abort }
}
