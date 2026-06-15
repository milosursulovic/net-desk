import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

function parseField(raw, config) {
  if (config.type === 'int') {
    return parseInt(raw) || config.default
  }
  if (config.oneOf) {
    const val = raw ?? config.default
    return config.oneOf.includes(val) ? val : config.default
  }
  return raw ?? config.default
}

function serializeField(val, config) {
  if (config.type === 'int') {
    return String(val ?? config.default)
  }
  const s = val ?? config.default
  if (config.omitIfEmpty && !s) return undefined
  return String(s)
}

function queryValue(routeQuery, key, config) {
  const queryKey = config.queryKey || key
  const raw = routeQuery[queryKey]
  if (config.omitIfEmpty) {
    return raw ?? ''
  }
  return raw ?? String(config.default ?? '')
}

/**
 * Sync pagination and filter refs with route query params.
 */
export function usePaginatedRoute({ fields, resetPageOn = [], useReplace = false }) {
  const route = useRoute()
  const router = useRouter()

  const refs = {}
  for (const [key, config] of Object.entries(fields)) {
    const queryKey = config.queryKey || key
    refs[key] = ref(parseField(route.query[queryKey], config))
  }

  function buildQuery() {
    const query = {}
    for (const [key, config] of Object.entries(fields)) {
      const queryKey = config.queryKey || key
      query[queryKey] = serializeField(refs[key].value, config)
    }
    return query
  }

  function isQuerySynced() {
    for (const [key, config] of Object.entries(fields)) {
      const queryKey = config.queryKey || key
      const current = queryValue(route.query, key, config)
      const next = serializeField(refs[key].value, config) ?? ''
      if (String(current) !== String(next)) return false
    }
    return true
  }

  if (resetPageOn.length && refs.page) {
    watch(
      resetPageOn.map((key) => refs[key]),
      () => {
        refs.page.value = fields.page.default
      }
    )
  }

  watch(
    Object.values(refs),
    () => {
      if (isQuerySynced()) return
      const navigate = useReplace ? router.replace : router.push
      navigate({ query: buildQuery() })
    }
  )

  watch(
    () => route.query,
    (q) => {
      for (const [key, config] of Object.entries(fields)) {
        const queryKey = config.queryKey || key
        const parsed = parseField(q[queryKey], config)
        if (refs[key].value !== parsed) refs[key].value = parsed
      }
    },
    { immediate: true }
  )

  function nextPage({ total, totalPages } = {}) {
    if (totalPages !== undefined) {
      if (refs.page.value < totalPages) refs.page.value++
      return
    }
    if (total !== undefined && refs.page.value * refs.limit.value < total) {
      refs.page.value++
    }
  }

  function prevPage() {
    if (refs.page.value > 1) refs.page.value--
  }

  function applyServerPagination({ page: serverPage, limit: serverLimit }) {
    const nextPage = parseInt(serverPage) || refs.page.value
    const nextLimit = parseInt(serverLimit) || refs.limit.value
    if (nextPage !== refs.page.value) refs.page.value = nextPage
    if (nextLimit !== refs.limit.value) refs.limit.value = nextLimit
  }

  return { ...refs, nextPage, prevPage, applyServerPagination }
}
