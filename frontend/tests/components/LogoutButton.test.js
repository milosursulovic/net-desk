import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import LogoutButton from '@/components/LogoutButton.vue'

// Note: this only verifies the logout *logic* (token removal, navigation,
// both buttons present). Which of the two buttons is actually visible at a
// given screen width is a real-CSS/cascade concern (see the comment in the
// component about the .app-btn vs .hidden specificity bug found live) -
// jsdom doesn't apply the compiled stylesheet, so that part can't be
// verified by a unit test; it needs a real browser.
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
  const wrapper = mount(LogoutButton, { global: { plugins: [router] } })
  return { wrapper, router }
}

describe('LogoutButton', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders both the mobile icon button and the desktop text button', async () => {
    const { wrapper } = await mountWithRouter()
    const buttons = wrapper.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(wrapper.text()).toContain('🚪')
    expect(wrapper.text()).toContain('Odjavi se')
  })

  it('clicking the mobile icon button removes the token and navigates to /login', async () => {
    localStorage.setItem('token', 'fake-jwt')
    const { wrapper, router } = await mountWithRouter()

    const iconButton = wrapper.findAll('button')[0]
    await iconButton.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('token')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
  })

  it('clicking the desktop text button also removes the token and navigates to /login', async () => {
    localStorage.setItem('token', 'fake-jwt')
    const { wrapper, router } = await mountWithRouter()

    const textButton = wrapper.findAll('button')[1]
    await textButton.trigger('click')
    await flushPromises()

    expect(localStorage.getItem('token')).toBeNull()
    expect(router.currentRoute.value.path).toBe('/login')
  })
})
