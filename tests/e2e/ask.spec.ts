import { expect, type Page, type Route, test } from '@playwright/test'
import { RECEIPTS } from '../fixtures/receipts'
import { backupWith, freeWriting, restoreBackup } from './seed'

// Ask (v0.18, its own tab) in WebKit: a question about the journal, answered with your AI on a tap. The AI service is
// a stand-in for Gemini (page.route) playing what the real one does: it asks the phone for receipts, then for a total,
// then answers with the phone's total. No real key is used and nothing leaves the test. Fictional receipts.

const SATURDAY = new Date(2026, 9, 24, 20, 0)
const KEY = 'AIza_test_abcd'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const QUESTION = 'What groceries did I buy this month?'

type Message = { role: string; content?: string | null; tool_call_id?: string }
const toolCall = (id: string, name: string, args: object) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })

/** Stands in for Gemini: lists a model, then plays the tool-calling turns of one question. */
async function fakeGemini(page: Page) {
  const sent: { auth: string | null; body: { tools?: unknown[]; messages?: Message[] } }[] = []
  await page.route('https://generativelanguage.googleapis.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const json = (body: object) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.url().endsWith('/models')) return json({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/text-embedding-004' }] })
    const body = JSON.parse(request.postData() ?? '{}') as { tools?: unknown[]; messages?: Message[] }
    sent.push({ auth: request.headers().authorization ?? null, body })
    const last = body.messages!.at(-1)!
    if (last.role === 'user') return json({ choices: [{ message: { content: null, tool_calls: [toolCall('a', 'find_receipts', { from: '2026-10-01', to: '2026-10-31' })] } }] })
    if (last.tool_call_id === 'a') return json({ choices: [{ message: { content: null, tool_calls: [toolCall('b', 'sum', { item_ids: ['p1:0', 'p1:4'] })] } }] })
    const total = (JSON.parse(last.content ?? '{}') as { total: string }).total
    return json({ choices: [{ message: { content: `From Greenleaf Market [r:p1]: oat milk and eggs came to ${total}.` } }] })
  })
  return sent
}

const receiptEntry = (id: string, photoId: string, receipt: string, daysAgo: number) => ({
  ...freeWriting(id, '', daysAgo, SATURDAY),
  photos: [{ id: photoId, text: RECEIPTS.find((r) => r.id === receipt)!.text }],
})

async function restoreReceipts(page: Page, path: string) {
  await restoreBackup(page, path, backupWith({ entries: [receiptEntry('e1', 'p1', 'greenleaf', 12), receiptEntry('e2', 'p2', 'pharmacy', 5)] }, SATURDAY))
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

test('Ask has its own tab: a question is asked on a tap, answered with the phone’s total, and kept with what was sent', async ({ page }, testInfo) => {
  const sent = await fakeGemini(page)
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await setUpGemini(page)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ask' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Ask' })).toBeVisible()
  await page.getByLabel('What would you like to know?').fill(QUESTION)
  await expect(page.getByText('Sends your question, and the receipts and entries it needs, to Gemini.')).toBeVisible()
  expect(sent).toEqual([]) // nothing until the tap
  await page.getByRole('button', { name: 'Ask', exact: true }).click()

  // Oat milk 1.45 + eggs 2.10, added up by the phone.
  const answer = page.getByRole('region', { name: 'Answer' })
  await expect(answer.getByText('From Greenleaf Market: oat milk and eggs came to 3.55.')).toBeVisible()
  await expect(answer.getByRole('heading', { name: QUESTION })).toBeVisible()
  expect(sent).toHaveLength(3)
  for (const s of sent) {
    expect(s.auth).toBe(`Bearer ${KEY}`)
    expect(s.body.tools).toHaveLength(3)
  }
  await answer.getByText('What was sent').click()
  await expect(answer.getByText('2 receipts from 2026-10-01 to 2026-10-31')).toBeVisible()
  await answer.getByRole('button', { name: /2026-10-12/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click()

  // Kept: after a reload it's under Earlier, and still opens to its answer.
  await page.reload()
  const earlier = page.getByRole('region', { name: 'Earlier questions' })
  await earlier.locator('summary', { hasText: QUESTION }).click()
  await expect(earlier.getByText('From Greenleaf Market: oat milk and eggs came to 3.55.')).toBeVisible()
})

test('Logs’ search only finds again; without an AI set up, Ask says where to set one up and sends nothing', async ({ page }, testInfo) => {
  const sent = await fakeGemini(page)
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/entries')
  await page.getByLabel('Search your logs').fill(QUESTION)
  await expect(page.getByRole('region', { name: 'Ask your journal' })).toHaveCount(0)
  await page.goto('./#/ask')
  await expect(page.getByRole('link', { name: 'set up an AI service' })).toBeVisible()
  expect(sent).toEqual([])
})
