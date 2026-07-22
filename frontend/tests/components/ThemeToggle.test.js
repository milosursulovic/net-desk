import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

// ThemeToggle uses useTheme.js internally, which has module-level singleton
// state + a real window.matchMedia('change') listener registered at import
// time - same reasoning as useTheme.test.js: reset modules and stub
// matchMedia fresh for each test, then dynamically import the component too
// so it picks up the freshly-reset composable module.
function stubMatchMedia(matches = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  )
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the system icon and starts in "system" mode by default', async () => {
    stubMatchMedia(false)
    const { default: ThemeToggle } = await import('@/components/ThemeToggle.vue')
    const wrapper = mount(ThemeToggle)
    expect(wrapper.text()).toBe('🖥️')
    expect(wrapper.attributes('title')).toContain('prati sistem')
  })

  it('cycles system -> light -> dark -> system on repeated clicks', async () => {
    stubMatchMedia(false)
    const { default: ThemeToggle } = await import('@/components/ThemeToggle.vue')
    const wrapper = mount(ThemeToggle)

    expect(wrapper.text()).toBe('🖥️') // system
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toBe('☀️') // light
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toBe('🌙') // dark
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toBe('🖥️') // back to system
  })

  it('clicking to "dark" actually applies the .dark class to <html>', async () => {
    stubMatchMedia(false)
    const { default: ThemeToggle } = await import('@/components/ThemeToggle.vue')
    const wrapper = mount(ThemeToggle)

    await wrapper.find('button').trigger('click') // -> light
    await wrapper.find('button').trigger('click') // -> dark
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('persists the chosen theme to localStorage', async () => {
    stubMatchMedia(false)
    const { default: ThemeToggle } = await import('@/components/ThemeToggle.vue')
    const wrapper = mount(ThemeToggle)

    await wrapper.find('button').trigger('click') // -> light
    expect(localStorage.getItem('netdesk-theme')).toBe('light')
  })
})
