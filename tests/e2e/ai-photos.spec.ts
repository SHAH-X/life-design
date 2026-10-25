import { readFileSync } from 'node:fs'
import { expect, type Page, type Route, test } from '@playwright/test'
import { RECEIPTS } from '../fixtures/receipts'
import { entryButton } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'

// Photos read by your AI (v0.18) in WebKit: a photo the phone has read and takes for a receipt goes to your AI by
// itself; any other photo only on "Read with AI". The AI service is a stand-in for Gemini (page.route); no real key is
// used and nothing leaves the test. The photos are fictional (tests/fixtures/photos/), their text as the phone read it.

const SATURDAY = new Date(2026, 9, 24, 20, 0)
const KEY = 'AIza_test_abcd'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const RECEIPT_JPEG = readFileSync('tests/fixtures/photos/receipt-clean.png').toString('base64')
const NOTE_JPEG = readFileSync('tests/fixtures/photos/sticky.png').toString('base64')
/** Longer than the app waits after a change before it reads photos (SETTLE_MS, 1.5 s). */
const SETTLED = 3000

type Part = { type: string; text?: string; image_url?: { url: string } }

/** What the stand-in reads in the sticky note: Markdown, kept as plain text with its lines and indents. */
const NOTE_MARKDOWN = '# To do\n- Call the plumber on Thursday\n- Book the dentist\n  - for Sam'

/** Stands in for Gemini: lists a model, then reads each photo sent, as the real one replies (JSON). */
async function fakeGemini(page: Page) {
  const photos: { auth: string | null; image: string }[] = []
  const instructions: string[] = []
  const efforts: unknown[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const json = (body: object) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.url().endsWith('/models')) return json({ data: [{ id: 'models/gemini-2.5-flash' }] })
    const body = JSON.parse(request.postData() ?? '{}') as { messages: { content: Part[] }[]; reasoning_effort?: unknown }
    efforts.push(body.reasoning_effort)
    const image = body.messages[0]!.content.find((p) => p.type === 'image_url')!.image_url!.url
    photos.push({ auth: request.headers().authorization ?? null, image })
    instructions.push(body.messages[0]!.content.find((p) => p.type === 'text')!.text!)
    const reply = image.endsWith(RECEIPT_JPEG)
      ? { receipt: true, shop: 'Greenleaf Market', date: '2026-10-12', currency: '£', items: [{ name: 'ORG OAT MLK', plain: 'Organic oat milk', price: '1.45', quantity: 1, kind: 'Dairy and eggs' }], total: '1.45', text: 'GREENLEAF MARKET\nORG OAT MLK 1.45' }
      : { receipt: false, description: 'A sticky note with a reminder about the dentist', text: NOTE_MARKDOWN }
    return json({ choices: [{ message: { content: JSON.stringify(reply) } }] })
  })
  return { photos, instructions, efforts }
}

const photo = (id: string, entryId: string, data: string) => ({ id, entryId, type: 'image/jpeg', width: 600, height: 800, data, createdAt: 1, updatedAt: 1 })

async function restorePhotos(page: Page, path: string) {
  const receipt = { ...freeWriting('e1', '', 12, SATURDAY), photos: [{ id: 'p1', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text }] }
  const note = { ...freeWriting('e2', 'Things to do', 5, SATURDAY), photos: [{ id: 'p2', text: RECEIPTS.find((r) => r.id === 'note')!.text }] }
  await restoreBackup(page, path, backupWith({ entries: [receipt, note], photos: [photo('p1', 'e1', RECEIPT_JPEG), photo('p2', 'e2', NOTE_JPEG)] }, SATURDAY))
}

async function setUpGemini(page: Page) {
  await page.goto('./#/more/ai')
  await page.getByRole('radio', { name: /Gemini/ }).check()
  await page.getByLabel('API key').fill(KEY)
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()
}

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SATURDAY)
})

test('a receipt goes to your AI by itself once it’s set up; another photo only on “Read with AI”, as Markdown', async ({ page }, testInfo) => {
  const { photos, instructions, efforts } = await fakeGemini(page)
  await restorePhotos(page, testInfo.outputPath('photos.json'))
  await page.goto('./#/more/photos')
  await page.getByRole('switch', { name: /Read the text in photos/ }).check()
  await expect(page.getByText('To read photos with AI, add a Gemini or OpenAI key.')).toBeVisible()
  await page.waitForTimeout(SETTLED) // the app has looked at the photos, with no AI to send them to

  // Set up after the receipts are in: the receipt goes without a reload, the other photo stays.
  await setUpGemini(page)
  await expect.poll(() => photos.length, { timeout: 15_000 }).toBe(1)
  expect(photos[0]).toEqual({ auth: `Bearer ${KEY}`, image: `data:image/jpeg;base64,${RECEIPT_JPEG}` })

  await page.goto('./#/entries')
  await entryButton(page, 'Photo').click()
  const receipt = page.getByRole('dialog', { name: 'Photo' })
  await expect(receipt.getByText('Read by Gemini · gemini-2.5-flash')).toBeVisible()
  await expect(receipt.getByRole('button', { name: 'Read with AI' })).toHaveCount(0)
  await receipt.getByText('Text in this photo').click()
  await expect(receipt.locator('.photo-text')).toContainText('ORG OAT MLK')
  await receipt.getByRole('button', { name: 'Done', exact: true }).click()

  await entryButton(page, 'Free writing').click()
  const note = page.getByRole('dialog', { name: 'Free writing' })
  await expect(note.getByText('Sends this photo to Gemini.')).toBeVisible()
  expect(photos).toHaveLength(1)
  await note.getByRole('button', { name: 'Read with AI' }).click()
  await expect(note.getByText('A sticky note with a reminder about the dentist')).toBeVisible()
  expect(photos.at(-1)?.image).toBe(`data:image/jpeg;base64,${NOTE_JPEG}`)
  // Asked for Markdown, a chart held to its printed values; shown as plain text, its lines and indents kept.
  expect(instructions.at(-1)).toContain('"text": "what is printed on it, as Markdown"')
  expect(instructions.at(-1)).toContain('Never estimate a value from where a line, bar, candle or point sits, between gridlines or between labels')
  await note.getByText('Text in this photo').click()
  expect(await note.locator('.photo-text').innerText()).toBe(NOTE_MARKDOWN)
  await note.getByRole('button', { name: 'Done', exact: true }).click()

  // Found by the plain name the AI gave an item, which the receipt doesn't print (v0.19.3).
  await page.getByLabel('Search your logs').fill('organic')
  await expect(entryButton(page, 'Photo')).toBeVisible()
  await expect(entryButton(page, 'Free writing')).toHaveCount(0)

  // Gemini was asked to think little: reading is copying out (v0.19.1).
  expect(efforts).toEqual(['low', 'low'])

  // Its items came sorted into kinds, from the fixed list, in the same reading.
  expect(instructions[0]).toContain('Give each item the kind it most likely is, written exactly as one of: Fruit and veg,')
  await page.goto('./#/shopping')
  const byKind = page.getByRole('region', { name: 'By kind' })
  await expect(byKind.locator('summary')).toHaveText(['Dairy and eggs · 1 item · £1.45'])
  await byKind.locator('summary').click()
  await expect(byKind.getByRole('button', { name: /Organic oat milk/ })).toBeVisible()
  await expect(byKind.getByText('ORG OAT MLK')).toHaveCount(0)
})

test('a receipt your AI read before items had kinds can be read again, on a tap, to sort them', async ({ page }, testInfo) => {
  const { photos } = await fakeGemini(page)
  const before = { by: 'Gemini · gemini-2.5-flash', at: 1, text: 'GREENLEAF MARKET', description: '', receipt: { shop: 'Greenleaf Market', date: '2026-10-12', currency: '£', items: [{ name: 'Organic oat milk', price: 145, quantity: 1 }], total: 145 } }
  const receipt = { ...freeWriting('e1', '', 12, SATURDAY), photos: [{ id: 'p1', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text, ai: before }] }
  await restoreBackup(page, testInfo.outputPath('photos.json'), backupWith({ entries: [receipt], photos: [photo('p1', 'e1', RECEIPT_JPEG)] }, SATURDAY))
  await setUpGemini(page)
  await page.waitForTimeout(SETTLED)
  expect(photos).toEqual([]) // already read: it doesn't go again by itself

  await page.goto('./#/shopping')
  await expect(page.getByRole('region', { name: 'By kind' })).toHaveCount(0)
  await page.goto('./#/entries')
  await entryButton(page, 'Photo').click()
  const dialog = page.getByRole('dialog', { name: 'Photo' })
  await expect(dialog.getByText('Sends this photo to Gemini again, to give its items proper names and sort them into kinds.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Read with AI again' }).click()
  await expect(dialog.getByRole('button', { name: /Read with AI/ })).toHaveCount(0)
  expect(photos).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()

  await page.goto('./#/shopping')
  await expect(page.getByRole('region', { name: 'By kind' }).locator('summary')).toHaveText(['Dairy and eggs · 1 item · £1.45'])
})

test('a receipt your AI read before plain names can be read again, on a tap, to name its items', async ({ page }, testInfo) => {
  const { photos } = await fakeGemini(page)
  const before = { by: 'Gemini · gemini-2.5-flash', at: 1, text: 'GREENLEAF MARKET', description: '', receipt: { shop: 'Greenleaf Market', date: '2026-10-12', currency: '£', items: [{ name: 'ORG OAT MLK', price: 145, quantity: 1, kind: 'Dairy and eggs' }], total: 145 } }
  const receipt = { ...freeWriting('e1', '', 12, SATURDAY), photos: [{ id: 'p1', text: RECEIPTS.find((r) => r.id === 'greenleaf')!.text, ai: before }] }
  await restoreBackup(page, testInfo.outputPath('photos.json'), backupWith({ entries: [receipt], photos: [photo('p1', 'e1', RECEIPT_JPEG)] }, SATURDAY))
  await setUpGemini(page)
  await page.waitForTimeout(SETTLED)
  expect(photos).toEqual([]) // already read: it doesn't go again by itself

  await page.goto('./#/entries')
  await entryButton(page, 'Photo').click()
  const dialog = page.getByRole('dialog', { name: 'Photo' })
  await expect(dialog.getByText('Sends this photo to Gemini again, to give its items proper names.')).toBeVisible()
  await dialog.getByRole('button', { name: 'Read with AI again' }).click()
  await expect(dialog.getByRole('button', { name: /Read with AI/ })).toHaveCount(0)
  expect(photos).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()

  await page.goto('./#/shopping')
  const byKind = page.getByRole('region', { name: 'By kind' })
  await byKind.locator('summary').click()
  await expect(byKind.getByRole('button', { name: /Organic oat milk/ })).toBeVisible()
})

test('Groq for Ask and reviews, Gemini for photos: a key of its own on Reading photos', async ({ page }, testInfo) => {
  const { photos } = await fakeGemini(page)
  await page.route('https://api.groq.com/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'openai/gpt-oss-120b' }] }) }),
  )
  await restorePhotos(page, testInfo.outputPath('photos.json'))
  await page.goto('./#/more/ai')
  await page.getByLabel('API key').fill('gsk_test_abcd')
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()

  await page.goto('./#/more/photos')
  await page.getByRole('switch', { name: /Read the text in photos/ }).check()
  await expect(page.getByText('To read photos with AI, add a Gemini or OpenAI key (Groq can’t read them).')).toBeVisible()
  await page.waitForTimeout(SETTLED)
  expect(photos).toEqual([]) // Groq is set up, but can't read the receipt

  const forPhotos = page.getByRole('radiogroup', { name: 'Service for photos' })
  await forPhotos.getByRole('radio', { name: /Gemini/ }).check()
  await page.getByLabel('API key').fill('AIza_test_wxyz')
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText('Key saved on this phone only · ends wxyz')).toBeVisible()
  await expect(page.getByRole('switch', { name: /Read receipts with AI/ })).toBeChecked()
  await expect.poll(() => photos.length, { timeout: 15_000 }).toBe(1)
  expect(photos[0]).toEqual({ auth: 'Bearer AIza_test_wxyz', image: `data:image/jpeg;base64,${RECEIPT_JPEG}` })

  // Ask and reviews keep Groq.
  await page.goto('./#/more/ai')
  await expect(page.getByRole('radio', { name: /Groq/ })).toBeChecked()
  await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()

  // Removing the photo key leaves photos with no AI that reads them.
  await page.goto('./#/more/photos')
  await page.getByRole('button', { name: 'Remove key' }).click()
  await expect(page.getByText('To read photos with AI, add a Gemini or OpenAI key (Groq can’t read them).')).toBeVisible()
  await expect(page.getByRole('switch', { name: /Read receipts with AI/ })).toHaveCount(0)
})

test('turned off, receipts stay on the phone; a refused key is said under the receipt waiting for it', async ({ page }, testInfo) => {
  const { photos } = await fakeGemini(page)
  await restorePhotos(page, testInfo.outputPath('photos.json'))
  await setUpGemini(page)
  await page.goto('./#/more/photos')
  await page.getByRole('switch', { name: /Read the text in photos/ }).check()
  await page.getByRole('switch', { name: /Read receipts with AI/ }).uncheck()
  await page.waitForTimeout(SETTLED)
  expect(photos).toEqual([])

  await page.route('https://generativelanguage.googleapis.com/**/chat/completions', (route) =>
    route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }) }),
  )
  await page.getByRole('switch', { name: /Read receipts with AI/ }).check()
  await page.goto('./#/entries')
  await entryButton(page, 'Photo').click()
  await expect(page.getByRole('dialog', { name: 'Photo' }).getByText("The key wasn't accepted. Check it in More → AI review.")).toBeVisible({ timeout: 15_000 })
})
