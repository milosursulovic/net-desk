import { describe, it, expect } from 'vitest'
import { useConfirmDialog } from '@/composables/useConfirmDialog.js'

describe('useConfirmDialog', () => {
  it('starts closed', () => {
    const { confirmState } = useConfirmDialog()
    expect(confirmState.value.open).toBe(false)
  })

  it('askConfirm opens the dialog with the given message/title', () => {
    const { confirmState, askConfirm } = useConfirmDialog()
    askConfirm('Obrisati stavku?', { title: 'Brisanje' })
    expect(confirmState.value).toMatchObject({
      open: true,
      title: 'Brisanje',
      message: 'Obrisati stavku?',
    })
  })

  it('defaults the title to "Potvrda" when none is given', () => {
    const { confirmState, askConfirm } = useConfirmDialog()
    askConfirm('Da li si siguran?')
    expect(confirmState.value.title).toBe('Potvrda')
  })

  it('resolveConfirm(true) resolves the pending promise and closes the dialog', async () => {
    const { confirmState, askConfirm, resolveConfirm } = useConfirmDialog()
    const pending = askConfirm('Obrisati?')
    resolveConfirm(true)
    await expect(pending).resolves.toBe(true)
    expect(confirmState.value.open).toBe(false)
  })

  it('resolveConfirm(false) resolves to false (user cancelled)', async () => {
    const { askConfirm, resolveConfirm } = useConfirmDialog()
    const pending = askConfirm('Obrisati?')
    resolveConfirm(false)
    await expect(pending).resolves.toBe(false)
  })

  it('a second askConfirm/resolveConfirm cycle works independently of the first', async () => {
    const { askConfirm, resolveConfirm } = useConfirmDialog()
    const first = askConfirm('Prva?')
    resolveConfirm(true)
    await expect(first).resolves.toBe(true)

    const second = askConfirm('Druga?')
    resolveConfirm(false)
    await expect(second).resolves.toBe(false)
  })
})
