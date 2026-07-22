import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// Uses <teleport to="body"> - the dialog content ends up as a real child of
// document.body, not inside wrapper.element, so assertions query the
// document directly rather than the mounted wrapper's own subtree.
describe('ConfirmDialog', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when open is false', () => {
    mount(ConfirmDialog, { props: { open: false, message: 'Obrisati?' } })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('renders the title/message when open is true', () => {
    mount(ConfirmDialog, {
      props: { open: true, title: 'Brisanje', message: 'Obrisati ovu stavku?' },
    })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog.textContent).toContain('Brisanje')
    expect(dialog.textContent).toContain('Obrisati ovu stavku?')
  })

  it('defaults title/labels when not provided', () => {
    mount(ConfirmDialog, { props: { open: true } })
    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog.textContent).toContain('Potvrda')
    expect(dialog.textContent).toContain('Potvrdi')
    expect(dialog.textContent).toContain('Otkaži')
  })

  it('emits "confirm" when the confirm button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, confirmLabel: 'Da, obriši' },
    })
    const buttons = document.querySelectorAll('button')
    const confirmBtn = Array.from(buttons).find((b) => b.textContent === 'Da, obriši')
    await confirmBtn.click()
    expect(wrapper.emitted('confirm')).toBeTruthy()
    expect(wrapper.emitted('cancel')).toBeFalsy()
  })

  it('emits "cancel" when the cancel button is clicked', async () => {
    const wrapper = mount(ConfirmDialog, {
      props: { open: true, cancelLabel: 'Ne' },
    })
    const buttons = document.querySelectorAll('button')
    const cancelBtn = Array.from(buttons).find((b) => b.textContent === 'Ne')
    await cancelBtn.click()
    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('confirm')).toBeFalsy()
  })

  it('emits "cancel" when the backdrop itself is clicked (click.self)', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true } })
    const backdrop = document.querySelector('[role="dialog"]')
    await backdrop.dispatchEvent(new Event('click', { bubbles: true }))
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('does NOT emit "cancel" when clicking inside the dialog card (click.self excludes bubbled clicks)', async () => {
    const wrapper = mount(ConfirmDialog, { props: { open: true, message: 'Obrisati?' } })
    const card = document.querySelector('[role="dialog"] > div')
    await card.dispatchEvent(new Event('click', { bubbles: true }))
    expect(wrapper.emitted('cancel')).toBeFalsy()
  })
})
