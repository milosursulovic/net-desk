import { computed } from 'vue'
import { useRoute } from 'vue-router'

// The current site (Bolnica/Dom zdravlja) lives EXCLUSIVELY in the URL query param
// (?site=...), not in localStorage/store - this is just a thin computed over
// route.query.site, not persistent state. The router guard (router/index.js)
// guarantees site is always present and valid on every protected page
// before the view is even mounted.
export function useCurrentSite() {
  const route = useRoute()
  return computed(() => route.query.site)
}
