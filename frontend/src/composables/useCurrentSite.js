import { computed } from 'vue'
import { useRoute } from 'vue-router'

// Trenutna lokacija (Bolnica/Dom zdravlja) živi ISKLJUČIVO u URL query param-u
// (?site=...), ne u localStorage/store - ovo je samo tanak computed nad
// route.query.site, ne perzistentno stanje. Router guard (router/index.js)
// garantuje da je site uvek prisutan i validan na svakoj zaštićenoj strani
// pre nego što se view uopšte montira.
export function useCurrentSite() {
  const route = useRoute()
  return computed(() => route.query.site)
}
