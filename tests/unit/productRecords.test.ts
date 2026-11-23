import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { applyImport, createBackup, detectFile } from '../../src/db/backup'
import { type LifeDesignDB, openDb } from '../../src/db/db'
import { joinProduct, listProduct, notSameProduct, splitProduct } from '../../src/db/products'
import { isProduct } from '../../src/db/validate'

// Step 3 (owner-approved plan, 2026-11-23): what you said about a product, kept as your own records.
describe('products you listed, joined or said are not the same', () => {
  let phone: LifeDesignDB
  beforeEach(() => {
    phone = openDb(`phone-${crypto.randomUUID()}`)
  })
  afterEach(async () => {
    await phone.delete()
  })
  const milk = { id: 'tesco|milk 2.27l', members: ['tesco|milk 2.27l'] }
  const asda = { id: 'asda|milk semi skimmed 2.27l', members: ['asda|milk semi skimmed 2.27l'] }
  const all = async () => (await phone.products.toArray()).sort((a, b) => a.id.localeCompare(b.id))

  it('lists a product as regular, which makes its record, and takes it off again, which removes it', async () => {
    await listProduct(milk, true, phone)
    const [record] = await all()
    expect(record).toMatchObject({ members: ['tesco|milk 2.27l'], notSame: [], regular: true })
    expect(record!.id).not.toBe(milk.id)
    await listProduct({ id: record!.id, members: milk.members }, false, phone)
    expect(await all()).toEqual([])
  })

  it('keeps one record when the same product is listed twice, also at once', async () => {
    await Promise.all([listProduct(milk, true, phone), listProduct(milk, true, phone), listProduct(milk, true, phone)])
    expect(await phone.products.count()).toBe(1)
  })

  it('joins another shop’s item to a product, keeping it regular, and is the same when done again', async () => {
    await listProduct(milk, true, phone)
    await joinProduct(milk, asda.members, phone)
    await joinProduct(milk, asda.members, phone)
    const records = await all()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ members: ['tesco|milk 2.27l', 'asda|milk semi skimmed 2.27l'], regular: true })
  })

  it('joins two products you each made a record of into one, with both lists of what is not the same', async () => {
    await listProduct(milk, false, phone)
    await notSameProduct(milk, ['m&s|whole milk 1l'], phone)
    await listProduct(asda, true, phone)
    await notSameProduct(asda, ['aldi|milk 2l'], phone)
    const asdaId = (await phone.products.where('members').equals(asda.members[0]!).first())!.id
    await joinProduct(milk, [...asda.members], phone)
    const records = await all()
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ regular: true })
    expect(records[0]!.members.sort()).toEqual(['asda|milk semi skimmed 2.27l', 'tesco|milk 2.27l'])
    expect(records[0]!.notSame.sort()).toEqual(['aldi|milk 2l', 'm&s|whole milk 1l'])
    expect(await phone.products.get(asdaId)).toBeUndefined()
  })

  it('remembers what is not the same, and forgets it when you join them after all', async () => {
    await notSameProduct(milk, asda.members, phone)
    expect((await all())[0]).toMatchObject({ members: ['tesco|milk 2.27l'], notSame: ['asda|milk semi skimmed 2.27l'] })
    await joinProduct(milk, asda.members, phone)
    expect((await all())[0]!.notSame).toEqual([])
  })

  it('splits an item off a joined product, and drops a record left with nothing to say', async () => {
    await listProduct(milk, true, phone)
    await joinProduct(milk, asda.members, phone)
    await splitProduct(milk, asda.members[0]!, phone)
    expect((await all())[0]).toMatchObject({ members: ['tesco|milk 2.27l'], regular: true })
    // Not regular and joined to nothing, it has nothing left to say.
    await listProduct(milk, false, phone)
    expect(await all()).toEqual([])
    await joinProduct(milk, asda.members, phone)
    await splitProduct(milk, asda.members[0]!, phone)
    expect(await all()).toEqual([])
  })

  it('is in a backup, and a damaged one is refused', async () => {
    await listProduct(milk, true, phone)
    const [record] = (await createBackup(phone)).data.products
    expect(record).toMatchObject({ regular: true })
    expect([isProduct(record), isProduct({ ...record, members: [] }), isProduct({ ...record, regular: 'yes' }), isProduct({ ...record, notSame: [3] })]).toEqual([true, false, false, false])
  })

  it('restores onto another phone, joined products and what is not the same included', async () => {
    await joinProduct(milk, asda.members, phone)
    await notSameProduct(milk, ['m&s|whole milk 1l'], phone)
    const detected = detectFile(JSON.stringify(await createBackup(phone)))
    if (detected.format !== 'backup') throw new Error('expected a backup')
    const fresh = openDb(`fresh-${crypto.randomUUID()}`)
    await applyImport(detected.raw, fresh)
    expect(await fresh.products.toArray()).toEqual(await phone.products.toArray())
    await fresh.delete()
  })
})
