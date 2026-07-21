import { onBeforeUnmount } from 'vue'

export function useAbortableFetch() {
  let controller = new AbortController()

  function getSignal() {
    // Abort whatever is still in flight from the previous call before
    // minting a new controller - this is what cancels a stale request
    // (e.g. a slow response to an old search term) so it can't overwrite a
    // newer one, not just cleanup on unmount.
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
