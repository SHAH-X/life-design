import { expect, type Page, type Route, test } from '@playwright/test'
import { captureShareSheet, sharedFile } from './helpers'
import { restoreSeed } from './seed'

// Review a period (v0.12): copy it for an AI chat, or review it with AI using your own key. The AI service is a
// stand-in (page.route), so no real key is used and nothing leaves the test. Fictional example data; a fixed Saturday,
// so the fictional Monday-to-Friday falls in "this week".
const SATURDAY = new Date(2026, 9, 24, 20, 0)
const KEY = 'gsk_test_abcd'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const MODELS = { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'openai/gpt-oss-120b' }, { id: 'whisper-large-v3' }] }
const ANSWER = '## What happened\nA week of deep work and meetings.\n\n- Meetings came with tiredness\n\nWhat would you protect next week?'

interface Sent {
  url: string
  auth: string | null
  body: string
}

/** Stands in for Groq: lists models, then answers each review with `chat` (a status, or the answer). */
async function fakeGroq(page: Page, chat: () => number = () => 200) {
  const sent: Sent[] = []
  await page.route('https://api.groq.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    sent.push({ url: request.url(), auth: request.headers().authorization ?? null, body: request.postData() ?? '' })
    if (request.url().endsWith('/models')) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(MODELS) })
    const status = chat()
    const body = status === 200 ? { choices: [{ message: { content: ANSWER } }] } : { error: { message: `rejected ${KEY}` } }
    return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return sent
}

async function setUpGroq(page: Page) {
  await page.goto('./#/more/ai')
  await expect(page.getByRole('heading', { level: 1, name: 'AI review' })).toBeVisible()
  await page.getByLabel('API key').fill(KEY)
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()
}

// The stand-in can't see requests that go through the app's service worker (they'd reach the real Groq), so this
// spec runs without one.
test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(SATURDAY)
})

test('copy a period for an AI chat, or share it as a file; what you see is what goes', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const w = window as unknown as { copied: string | null }
    w.copied = null
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          w.copied = text
        },
      },
    })
  })
  await captureShareSheet(page)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await page.goto('./#/insights')
  await page.getByRole('link', { name: /^Review a period/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Review a period' })).toBeVisible()

  const inIt = page.getByRole('region', { name: "What's in it" })
  await expect(inIt).toContainText('17 entries on 5 days')
  await page.getByLabel(/^Anything to focus on\?/).fill('Why am I tired on Mondays?')
  await page.getByRole('button', { name: 'Copy for an AI chat' }).click()
  await expect(page.getByText('Copied. Paste it into any AI chat.')).toBeVisible()
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied)
  expect(copied).toContain("You're helping me reflect on my own journal")
  expect(copied).toContain('Please look especially at: Why am I tired on Mondays?')
  expect(copied).toContain('Deep work on the report')
  expect(copied).not.toContain('gsk_')

  // A period with nothing in it says so, and gives nothing away.
  await page.getByRole('button', { name: 'Last week' }).click()
  await expect(inIt).toContainText('Nothing written in this period yet.')
  await expect(page.getByRole('button', { name: 'Copy for an AI chat' })).toBeDisabled()

  await page.getByRole('button', { name: 'This week' }).click()
  await page.getByRole('button', { name: 'Share as a file' }).click()
  const file = await sharedFile(page)
  expect(file.name).toBe('life-design-2026-10-19-to-2026-10-25.md')
  expect(file.text).toContain('Deep work on the report')
})

test('set up Groq once; Review with AI sends the period with one tap, to Groq only, and keeps the answer', async ({ page }, testInfo) => {
  const sent = await fakeGroq(page)
  await captureShareSheet(page)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)

  // No key yet: the way in is setup.
  await page.goto('./#/insights/review')
  await expect(page.getByRole('button', { name: 'Review with AI' })).toHaveCount(0)
  await page.getByRole('link', { name: /^Set up AI review/ }).click()
  await expect(page).toHaveURL(/#\/more\/ai$/)
  await setUpGroq(page)
  await expect(page.getByLabel('Model')).toHaveValue('openai/gpt-oss-120b')
  await expect(page.getByLabel('API key')).toHaveCount(0)

  // The key never goes into a backup.
  await page.goto('./#/more/backup')
  await page.getByRole('button', { name: 'Back up now' }).click()
  const backup = page.getByRole('dialog', { name: 'Back up' })
  await backup.getByRole('button', { name: 'Save or share…' }).click()
  expect((await sharedFile(page)).text).not.toContain(KEY)
  await backup.getByRole('button', { name: 'Close' }).click()

  await page.goto('./#/insights/review')
  await page.getByText("See what's sent").click()
  await expect(page.locator('.sent-preview')).toContainText('Deep work on the report')
  await page.getByRole('button', { name: 'Review with AI' }).click()
  const card = page.getByRole('region', { name: 'Review by AI' })
  await expect(card).toContainText('A week of deep work and meetings.')
  await expect(card.getByRole('heading', { name: 'What happened' })).toBeVisible()
  await expect(card.getByRole('listitem')).toHaveText(['Meetings came with tiredness'])

  // What went: to Groq only, the key in the header, the journal in the body, never the key in the body.
  const chat = sent.find((s) => s.url === 'https://api.groq.com/openai/v1/chat/completions')
  expect(chat?.auth).toBe(`Bearer ${KEY}`)
  expect(chat?.body).toContain('Deep work on the report')
  expect(chat?.body).not.toContain(KEY)

  // Kept to read again.
  await page.reload()
  await page.locator('main .entry-list').getByRole('button', { name: /Groq/ }).click()
  await expect(page.getByRole('dialog')).toContainText('A week of deep work and meetings.')
})

test('says plainly when the service refuses: too much, or a key it does not accept', async ({ page }, testInfo) => {
  let status = 429
  await fakeGroq(page, () => status)
  await restoreSeed(page, testInfo.outputPath('seed.json'), SATURDAY)
  await setUpGroq(page)
  await page.goto('./#/insights/review')

  await page.getByRole('button', { name: 'Review with AI' }).click()
  await expect(page.getByRole('alert')).toHaveText(
    "That's more than the service allows just now. Try a shorter period, wait a minute, or copy it to an AI chat instead.",
  )
  status = 401
  await page.getByRole('button', { name: 'Review with AI' }).click()
  await expect(page.getByRole('alert')).toHaveText("The key wasn't accepted. Check it in More → AI review.")
  await expect(page.getByRole('alert')).not.toContainText(KEY)
})

test('the key can be removed, leaving AI review off', async ({ page }) => {
  await fakeGroq(page)
  await setUpGroq(page)
  await page.getByRole('button', { name: 'Remove key' }).click()
  await expect(page.getByLabel('API key')).toBeVisible()
  await page.getByRole('link', { name: '‹ More' }).click()
  await expect(page.getByRole('link', { name: /^AI review/ })).toContainText('Off')
})
