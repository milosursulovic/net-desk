import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { usePaginatedRoute } from '@/composables/usePaginatedRoute.js'

// usePaginatedRoute calls useRoute()/useRouter(), which requires a real
// active component + router context (Vue 3 composable rule) - a bare
// vi.mock('vue-router', ...) would test my mock's behavior, not the real
// integration, so this mounts a tiny host component under a real router
// with in-memory history instead.
async function setupWithRoute(fields, { initialPath = '/', ...options } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/other', component: { render: () => null } },
    ],
  })
  router.push(initialPath)
  await router.isReady()

  let result
  const Host = defineComponent({
    setup() {
      result = usePaginatedRoute({ fields, ...options })
      return () => h('div')
    },
  })

  const wrapper = mount(Host, { global: { plugins: [router] } })
  await nextTick()
  return { wrapper, result, router }
}

describe('usePaginatedRoute', () => {
  it('initializes refs from the URL query on mount (bookmarked/shared link)', async () => {
    const { result } = await setupWithRoute(
      {
        page: { type: 'int', default: 1 },
        search: { type: 'string', default: '', omitIfEmpty: true },
      },
      { initialPath: '/?page=3&search=dell' },
    )
    expect(result.page.value).toBe(3)
    expect(result.search.value).toBe('dell')
  })

  it('falls back to the configured default when a query param is absent', async () => {
    const { result } = await setupWithRoute({
      page: { type: 'int', default: 1 },
      status: { type: 'string', default: 'all' },
    })
    expect(result.page.value).toBe(1)
    expect(result.status.value).toBe('all')
  })

  it('an oneOf field falls back to default when the URL value is not in the allowed set', async () => {
    const { result } = await setupWithRoute(
      { status: { type: 'string', default: 'all', oneOf: ['all', 'online', 'offline'] } },
      { initialPath: '/?status=bogus' },
    )
    expect(result.status.value).toBe('all')
  })

  it('changing a ref pushes the new value into the URL query', async () => {
    const { result, router } = await setupWithRoute({
      page: { type: 'int', default: 1 },
      search: { type: 'string', default: '', omitIfEmpty: true },
    })
    result.search.value = 'printer'
    await flushPromises()
    expect(router.currentRoute.value.query.search).toBe('printer')
  })

  it('omitIfEmpty fields are left out of the URL entirely when empty, not serialized as an empty string', async () => {
    const { result, router } = await setupWithRoute({
      page: { type: 'int', default: 1 },
      search: { type: 'string', default: '', omitIfEmpty: true },
    })
    result.search.value = 'x'
    await flushPromises()
    result.search.value = ''
    await flushPromises()
    expect(router.currentRoute.value.query.search).toBeUndefined()
  })

  it('resetPageOn resets the page ref when a listed field changes', async () => {
    const { result } = await setupWithRoute(
      {
        page: { type: 'int', default: 1 },
        status: { type: 'string', default: 'all' },
      },
      { initialPath: '/?page=5', resetPageOn: ['status'] },
    )
    expect(result.page.value).toBe(5)
    result.status.value = 'online'
    await nextTick()
    expect(result.page.value).toBe(1)
  })

  it('uses router.replace instead of router.push when useReplace is true (no extra history entries)', async () => {
    const { result, router } = await setupWithRoute(
      { search: { type: 'string', default: '', omitIfEmpty: true } },
      { useReplace: true },
    )
    const pushSpy = vi.spyOn(router, 'push')
    const replaceSpy = vi.spyOn(router, 'replace')

    result.search.value = 'x'
    await flushPromises()

    expect(replaceSpy).toHaveBeenCalledTimes(1)
    expect(pushSpy).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query.search).toBe('x')
  })

  it('uses router.push (not replace) by default', async () => {
    const { result, router } = await setupWithRoute({
      search: { type: 'string', default: '', omitIfEmpty: true },
    })
    const pushSpy = vi.spyOn(router, 'push')
    const replaceSpy = vi.spyOn(router, 'replace')

    result.search.value = 'x'
    await flushPromises()

    expect(pushSpy).toHaveBeenCalledTimes(1)
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  describe('nextPage / prevPage', () => {
    it('nextPage advances while below totalPages, and stops at the last page', async () => {
      const { result } = await setupWithRoute({ page: { type: 'int', default: 1 } })
      result.nextPage({ totalPages: 2 })
      expect(result.page.value).toBe(2)
      result.nextPage({ totalPages: 2 })
      expect(result.page.value).toBe(2) // already at the last page
    })

    it('nextPage falls back to a total/limit calculation when totalPages is not given', async () => {
      const { result } = await setupWithRoute({
        page: { type: 'int', default: 1 },
        limit: { type: 'int', default: 10 },
      })
      result.nextPage({ total: 15 }) // page 1 * limit 10 = 10 < 15 -> advance
      expect(result.page.value).toBe(2)
      result.nextPage({ total: 15 }) // page 2 * limit 10 = 20, not < 15 -> stop
      expect(result.page.value).toBe(2)
    })

    it('prevPage decrements but never below 1', async () => {
      const { result } = await setupWithRoute(
        { page: { type: 'int', default: 1 } },
        { initialPath: '/?page=2' },
      )
      expect(result.page.value).toBe(2)
      result.prevPage()
      expect(result.page.value).toBe(1)
      result.prevPage()
      expect(result.page.value).toBe(1)
    })
  })

  describe('applyServerPagination', () => {
    it('updates page/limit refs to match what the server actually returned', async () => {
      const { result } = await setupWithRoute({
        page: { type: 'int', default: 1 },
        limit: { type: 'int', default: 10 },
      })
      result.applyServerPagination({ page: 3, limit: 20 })
      expect(result.page.value).toBe(3)
      expect(result.limit.value).toBe(20)
    })

    it('keeps the current ref value when the server omits a field (parseInt(undefined) is NaN)', async () => {
      const { result } = await setupWithRoute(
        {
          page: { type: 'int', default: 1 },
          limit: { type: 'int', default: 10 },
        },
        { initialPath: '/?page=4' },
      )
      result.applyServerPagination({ limit: 25 })
      expect(result.page.value).toBe(4) // unchanged
      expect(result.limit.value).toBe(25)
    })
  })
})
