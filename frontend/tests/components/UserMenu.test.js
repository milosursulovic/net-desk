import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { i18n } from '@/i18n/index.js'
import UserMenu from '@/components/UserMenu.vue'

// The dropdown itself is <teleport to="body"> (needed so it isn't clipped by
// the sticky header's overflow-x-auto) - its content ends up as a real child
// of document.body, not inside wrapper.element, so assertions on the menu
// query the document directly, same pattern as ConfirmDialog.test.js.
let activeWrapper = null

async function mountWithRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { render: () => null } },
      { path: '/login', component: { render: () => null } },
    ],
  })
  router.push('/')
  await router.isReady()
  const wrapper = mount(UserMenu, { global: { plugins: [router, i18n] } })
  activeWrapper = wrapper
  return { wrapper, router }
}

describe('UserMenu', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(async () => {
    // Unmount BEFORE wiping document.body - the dropdown is teleported there,
    // and an in-flight router navigation (logout() calls router.push) can
    // still resolve after the test returns; if the teleport target is gone
    // by then (wiped below) but the component isn't torn down, Vue tries to
    // patch a DOM node that no longer exists and throws an unhandled
    // rejection that bleeds into whichever test runs next.
    activeWrapper?.unmount()
    activeWrapper = null
    await flushPromises()
    document.body.innerHTML = ''
  })

  it('does not render the dropdown until the trigger is clicked', async () => {
    await mountWithRouter()
    expect(document.body.textContent).not.toContain('Odjavi se')
  })

  it('opens the dropdown on trigger click and shows the menu items', async () => {
    const { wrapper } = await mountWithRouter()
    await wrapper.find('button[aria-expanded]').trigger('click')

    expect(document.body.textContent).toContain('Promeni lozinku')
    expect(document.body.textContent).toContain('Odjavi se')
  })

  it('clicking "Odjavi se" removes the token and navigates to /login', async () => {
    localStorage.setItem('token', 'fake-jwt')
    const { wrapper, router } = await mountWithRouter()

    await wrapper.find('button[aria-expanded]').trigger('click')
    const logoutButton = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent.includes('Odjavi se'),
    )
    await logoutButton.click()
    await flushPromises()

    expect(localStorage.getItem('token')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
