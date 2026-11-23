import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { createBackup } from '../../src/db/backup'
import { approveReceipt, changeItem, fileItem, ITEM_FOR_SETTING, ITEM_KINDS_SETTING, rememberItemKind } from '../../src/db/receiptItems'
import { rememberedKey, rememberedKindsOf, rememberedNamesOf } from '../../src/domain/shopping'
import type { Entry } from '../../src/db/types'
import { areaEntry } from '../fixtures/areas'

// Fictional receipts only.

describe('changeItem: your changes to a receipt’s items (v0.20.18)', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })

  const withReceipt = (): Entry => ({ ...areaEntry({ id: 'e1', text: '', expect: [] }, '2026-10-20'), updatedAt: 3, photos: [{ id: 'p1', text: 'SHOP\nBread 1.20\nMilk 0.90\nTOTAL 2.10' }, { id: 'p2', text: null }] })
  const items = async () => (await phone.entries.get('e1'))?.photos[0]?.items

  it('keeps a kind and a return on the item’s photo, both together, and makes it an edit', async () => {
    await phone.entries.put(withReceipt())
    await changeItem('e1', 'p1', 'Milk#1', { kind: 'Drinks' }, phone)
    await changeItem('e1', 'p1', 'Milk#1', { returned: true }, phone)
    expect(await items()).toEqual([{ key: 'Milk#1', kind: 'Drinks', returned: true }])
    expect((await phone.entries.get('e1'))!.updatedAt).toBeGreaterThan(3)
    expect((await phone.entries.get('e1'))!.photos[1]).toEqual({ id: 'p2', text: null })
  })

  it('takes a change back: not returned, then your AI’s kind again, leaving nothing behind', async () => {
    await phone.entries.put(withReceipt())
    await changeItem('e1', 'p1', 'Bread#1', { kind: 'Drinks', returned: true }, phone)
    await changeItem('e1', 'p1', 'Bread#1', { returned: false }, phone)
    expect(await items()).toEqual([{ key: 'Bread#1', kind: 'Drinks' }])
    await changeItem('e1', 'p1', 'Bread#1', { kind: null }, phone)
    expect((await phone.entries.get('e1'))!.photos[0]).toEqual({ id: 'p1', text: 'SHOP\nBread 1.20\nMilk 0.90\nTOTAL 2.10' })
  })

  it('does nothing when the photo is gone', async () => {
    await phone.entries.put(withReceipt())
    await changeItem('e1', 'gone', 'Bread#1', { returned: true }, phone)
    expect((await phone.entries.get('e1'))!.updatedAt).toBe(3)
  })
})

describe('rememberItemKind: a kind kept for an item at a shop (v0.20.37)', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const kept = async () => rememberedKindsOf((await phone.settings.get(ITEM_KINDS_SETTING))?.value)

  it('keeps one per item and shop, in a backup, and takes it back, leaving nothing behind', async () => {
    await rememberItemKind('Tesco Express', 'Infant Milk 800G', 'Baby and toddler', phone)
    await rememberItemKind('ASDA', 'Infant Milk 800G', 'Baby and toddler', phone)
    await rememberItemKind('ASDA', 'infant  milk 800g', 'Household', phone)
    expect(await kept()).toEqual({ [rememberedKey('Tesco', 'Infant Milk 800G')]: 'Baby and toddler', [rememberedKey('ASDA', 'Infant Milk 800G')]: 'Household' })
    const backup = await createBackup(phone, new Date('2026-11-01T12:00:00Z'))
    expect(backup.data.settings.find((row) => row.key === 'itemKinds')?.value).toEqual(await kept())
    await rememberItemKind('ASDA', 'Infant Milk 800G', null, phone)
    await rememberItemKind('Tesco', 'Infant Milk 800G', null, phone)
    expect(await kept()).toEqual({})
  })
})

describe('fileItem: who an item was for, kept for it at a shop (v0.20.39)', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const kept = async () => rememberedNamesOf((await phone.settings.get(ITEM_FOR_SETTING))?.value)

  it('keeps one name per item and shop, in a backup, and takes it back, leaving nothing behind', async () => {
    await fileItem('Tesco Express', 'Infant Milk 800G', ' Riya ', phone)
    await fileItem('ASDA', 'Infant Milk 800G', 'Home', phone)
    await fileItem('ASDA', 'infant  milk 800g', 'Sam', phone)
    expect(await kept()).toEqual({ [rememberedKey('Tesco', 'Infant Milk 800G')]: 'Riya', [rememberedKey('ASDA', 'Infant Milk 800G')]: 'Sam' })
    const backup = await createBackup(phone, new Date('2026-11-01T12:00:00Z'))
    expect(backup.data.settings.find((row) => row.key === 'itemFor')?.value).toEqual(await kept())
    await fileItem('ASDA', 'Infant Milk 800G', '', phone)
    await fileItem('Tesco', 'Infant Milk 800G', '', phone)
    expect(await kept()).toEqual({})
  })
})

describe('approveReceipt: counting a receipt whose items do not add up (step 1, 2026-11-23)', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })

  const withReceipt = (): Entry => ({ ...areaEntry({ id: 'e1', text: '', expect: [] }, '2026-10-20'), updatedAt: 3, photos: [{ id: 'p1', text: 'SHOP\nBread 1.20\nTOTAL 9.99' }] })

  it('keeps the figures you approved on the photo, and makes it an edit', async () => {
    await phone.entries.put(withReceipt())
    await approveReceipt('e1', 'p1', { total: 999, sum: 120 }, phone)
    const entry = (await phone.entries.get('e1'))!
    expect(entry.photos[0]!.approved).toEqual({ total: 999, sum: 120 })
    expect(entry.updatedAt).toBeGreaterThan(3)
  })

  it('takes the approval back with null, leaving nothing behind', async () => {
    await phone.entries.put(withReceipt())
    await approveReceipt('e1', 'p1', { total: 999, sum: 120 }, phone)
    await approveReceipt('e1', 'p1', null, phone)
    expect((await phone.entries.get('e1'))!.photos[0]).toEqual({ id: 'p1', text: 'SHOP\nBread 1.20\nTOTAL 9.99' })
  })

  it('does nothing when the photo is gone', async () => {
    await phone.entries.put(withReceipt())
    await approveReceipt('e1', 'gone', { total: 999, sum: 120 }, phone)
    expect((await phone.entries.get('e1'))!.updatedAt).toBe(3)
  })

  it('is in a backup, and a damaged one is refused', async () => {
    await phone.entries.put(withReceipt())
    await approveReceipt('e1', 'p1', { total: null, sum: 120 }, phone)
    const backup = await createBackup(phone)
    expect(backup.data.entries[0]!.photos[0]!.approved).toEqual({ total: null, sum: 120 })
    const { isEntry } = await import('../../src/db/validate')
    const damaged = (approved: unknown) => isEntry({ ...backup.data.entries[0]!, photos: [{ id: 'p1', text: null, approved }] })
    expect([damaged({ total: 999, sum: 120 }), damaged({ total: null, sum: 120 }), damaged({ total: 'x', sum: 120 }), damaged({ total: 999 }), damaged(true)]).toEqual([true, true, false, false, false])
  })
})
