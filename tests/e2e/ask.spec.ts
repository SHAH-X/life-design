import { expect, type Page, type Route, test } from '@playwright/test'
import { RECEIPTS } from '../fixtures/receipts'
import { backupWith, freeWriting, restoreBackup } from './seed'

// Ask your journal (v0.17) in WebKit: a question in Logs' search box, answered with your AI on a tap. The AI service is
// a stand-in (page.route) playing what the real one does: it asks the phone for receipts, then for a total, then
// answers with the phone's total. No real key is used and nothing leaves the test. Fictional receipts.

const SATURDAY = new Date(2026, 9, 24, 20, 0)
const KEY = 'gsk_test_abcd'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const QUESTION = 'What groceries did I buy this month?'

type Message = { role: string; content?: string | null; tool_call_id?: string }
const toolCall = (id: string, name: string, args: object) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } })

/** Stands in for Groq: lists a model, then plays the tool-calling turns of one question. */
async function fakeGroq(page: Page) {
  const sent: { auth: string | null; body: { tools?: unknown[]; messages?: Message[] } }[] = []
  await page.route('https://api.groq.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    const json = (body: object) => route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
    if (request.url().endsWith('/models')) return json({ data: [{ id: 'openai/gpt-oss-120b' }] })
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

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SATURDAY)
})

test('a question in Logs is asked on a tap; the answer gives the phone’s total, opens what it used, and shows what was sent', async ({ page }, testInfo) => {
  const sent = await fakeGroq(page)
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/more/ai')
  await page.getByLabel('API key').fill(KEY)
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()

  await page.goto('./#/entries')
  const search = page.getByLabel('Search your logs')
  await search.fill('milk')
  await expect(page.getByRole('region', { name: 'Ask your journal' })).toHaveCount(0) // words to find, not a question
  await search.fill(QUESTION)
  const ask = page.getByRole('region', { name: 'Ask your journal' })
  await expect(ask.getByText('Sends your question, and the receipts and entries it needs, to Groq.')).toBeVisible()
  expect(sent).toEqual([]) // nothing until the tap
  await ask.getByRole('button', { name: 'Ask', exact: true }).click()

  // Oat milk 1.45 + eggs 2.10, added up by the phone.
  await expect(ask.getByText('From Greenleaf Market: oat milk and eggs came to 3.55.')).toBeVisible()
  expect(sent).toHaveLength(3)
  for (const s of sent) {
    expect(s.auth).toBe(`Bearer ${KEY}`)
    expect(s.body.tools).toHaveLength(3)
  }
  await ask.getByText('What was sent').click()
  await expect(ask.getByText('2 receipts from 2026-10-01 to 2026-10-31')).toBeVisible()
  await expect(ask.locator('pre', { hasText: '"shop":"Greenleaf Market"' })).toBeVisible()
  await ask.getByRole('button', { name: /Greenleaf Market|Free writing|Photo|Money|Home/ }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('without AI set up, a question says where to set it up; nothing is sent', async ({ page }, testInfo) => {
  const sent = await fakeGroq(page)
  await restoreReceipts(page, testInfo.outputPath('receipts.json'))
  await page.goto('./#/entries')
  await page.getByLabel('Search your logs').fill(QUESTION)
  await expect(page.getByRole('link', { name: 'set up AI review' })).toBeVisible()
  expect(sent).toEqual([])
})
