import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import AppButton from '@/components/AppButton.vue'

describe('AppButton', () => {
  it('renders a <button> by default (no "to" prop)', () => {
    const wrapper = mount(AppButton, { slots: { default: 'Sačuvaj' } })
    expect(wrapper.find('button').exists()).toBe(true)
    expect(wrapper.find('a').exists()).toBe(false)
    expect(wrapper.text()).toBe('Sačuvaj')
  })

  it('applies the primary variant class by default', () => {
    const wrapper = mount(AppButton)
    expect(wrapper.find('button').classes()).toContain('app-btn-primary')
  })

  it('applies the requested variant class', () => {
    const wrapper = mount(AppButton, { props: { variant: 'danger' } })
    expect(wrapper.find('button').classes()).toContain('app-btn-danger')
  })

  it('forwards the type prop to the underlying <button>', () => {
    const wrapper = mount(AppButton, { props: { type: 'submit' } })
    expect(wrapper.find('button').attributes('type')).toBe('submit')
  })

  it('disables the button when disabled is true', () => {
    const wrapper = mount(AppButton, { props: { disabled: true } })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('emits a native click event when clicked', async () => {
    const wrapper = mount(AppButton)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('renders as a RouterLink (real <a> tag) when the "to" prop is given', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { render: () => null } },
        { path: '/agents', component: { render: () => null } },
      ],
    })
    router.push('/')
    await router.isReady()

    const wrapper = mount(AppButton, {
      props: { to: '/agents', variant: 'secondary' },
      slots: { default: 'Agenti' },
      global: { plugins: [router] },
    })

    expect(wrapper.find('button').exists()).toBe(false)
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.classes()).toContain('app-btn-secondary')
    expect(link.attributes('href')).toBe('/agents')
  })
})
