import { expect, type Page, type Route, test } from '@playwright/test'
import { expectNoScores } from './helpers'
import { backupWith, freeWriting, restoreBackup } from './seed'

// The map of your ideas (v0.23): your AI reads your own words from a period, on a tap, and the phone keeps only what
// it finds in them. The AI service is a stand-in (page.route): no real key, nothing leaves the test. Fictional notes,
// the short reflective kind the map is for; a fixed Tuesday evening.
const NOW = new Date(2026, 10, 3, 20, 0)
const KEY = 'gsk_test_abcd'
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }
const MODELS = { data: [{ id: 'openai/gpt-oss-120b' }] }

const NOTES = [
  ['f1', 'Rushing the morning makes everything tense. I skip breakfast and snap at people.', 10],
  ['f2', 'A short walk at lunch eases the tension. I come back calmer.', 8],
  ['f3', 'Comparing myself to others leaves me feeling behind.', 6],
  ['f4', 'Rushing again today. The tension sat in my shoulders all afternoon.', 4],
  ['f5', 'Writing the worry down shrinks it.', 2],
] as const
const journal = () => NOTES.map(([id, note, ago]) => freeWriting(id, note, ago, NOW))

/** The map the stand-in draws, by the refs it was sent: two links from the notes, and one it made up. */
function mapFor(userMessage: string) {
  const ref = (words: string) => userMessage.split('\n').find((l) => l.includes(words))?.match(/^\[(E\d+)\]/)?.[1]
  return {
    ideas: [
      { id: 'a', label: 'Rushing', kind: 'weighs', entries: [ref('Rushing the morning'), ref('Rushing again')] },
      { id: 'b', label: 'Tension', kind: 'weighs', entries: [ref('Rushing again')] },
      { id: 'c', label: 'A short walk', kind: 'helps', entries: [ref('A short walk')] },
      { id: 'd', label: 'Comparing myself', kind: 'weighs', entries: [ref('Comparing myself')] },
    ],
    links: [
      { from: 'a', to: 'b', words: 'makes', entry: ref('Rushing the morning'), quote: 'Rushing the morning makes everything tense' },
      { from: 'c', to: 'b', words: 'eases', entry: ref('A short walk'), quote: 'A short walk at lunch eases the tension' },
      { from: 'd', to: 'b', words: 'causes', entry: ref('Comparing myself'), quote: 'comparing causes all my tension' },
    ],
  }
}

/** Stands in for Groq: lists models, then answers each map request with `reply` (a status, or a reply's text). */
async function fakeGroq(page: Page, reply: (userMessage: string) => { status: number; content?: string } = (m) => ({ status: 200, content: JSON.stringify(mapFor(m)) })) {
  const chats: Record<string, unknown>[] = []
  await page.route('https://api.groq.com/**', async (route: Route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS })
    if (request.url().endsWith('/models')) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(MODELS) })
    const body = JSON.parse(request.postData() ?? '{}') as { messages: { content: string }[] }
    chats.push(body)
    const { status, content } = reply(body.messages[1]!.content)
    const answer = status === 200 ? { choices: [{ message: { content } }] } : { error: { message: `rejected ${KEY}` } }
    return route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(answer) })
  })
  return chats
}

async function setUpGroq(page: Page) {
  await page.goto('./#/more/ai')
  await page.getByLabel('API key').fill(KEY)
  await page.getByRole('button', { name: 'Check key' }).click()
  await expect(page.getByText('Key saved on this phone only · ends abcd')).toBeVisible()
}

const box = (page: Page, name: RegExp) => page.getByRole('button', { name })

test.use({ serviceWorkers: 'block' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW)
})

test('nothing is sent until Draw; the map keeps only what is in your words, opens to your entries, and is kept', async ({ page }, testInfo) => {
  const chats = await fakeGroq(page)
  await restoreBackup(page, testInfo.outputPath('map.json'), backupWith({ entries: journal() }, NOW))
  await setUpGroq(page)
  await page.goto('./#/insights')
  await page.getByRole('link', { name: /^Map of your ideas/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Map of your ideas' })).toBeVisible()
  await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('5 entries · about 50 words')).toBeVisible()

  // What you see is what goes, and nothing goes before the tap.
  await page.getByText("See what's sent").click()
  const preview = page.locator('.sent-preview')
  await expect(preview).toContainText('[E1] 24 Oct 2026: Rushing the morning makes everything tense.')
  await expect(preview).toContainText('Reply with JSON only')
  expect(chats).toHaveLength(0)

  await page.getByRole('button', { name: 'Draw my map' }).click()
  await expect(box(page, /^Rushing, weighs on you: 2 entries$/)).toBeVisible()
  expect(chats).toHaveLength(1)
  expect(chats[0]).toMatchObject({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' } })
  expect(JSON.stringify(chats[0])).toContain('[E5]')

  // The made-up link is left out, and said to be.
  await expect(page.getByText("1 link wasn't in your words, so it's left out.")).toBeVisible()
  await expect(box(page, /causes/)).toHaveCount(0)
  await expect(box(page, /^A short walk eases Tension$/)).toBeVisible()

  // A box says what it is and opens its entries; each opens the entry itself.
  await box(page, /^Rushing, weighs on you/).click()
  await expect(page.getByText('Rushing · weighs on you · 2 entries · 1 link')).toBeVisible()
  await page.locator('.evidence-list').getByRole('button', { name: /Rushing again today/ }).click()
  const entry = page.getByRole('dialog', { name: 'Free writing' })
  await expect(entry).toBeVisible()
  await entry.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(entry).toBeHidden()

  // A link quotes you, and opens the entry it came from.
  await box(page, /^A short walk eases Tension$/).click()
  await expect(page.getByText('You wrote: “A short walk at lunch eases the tension”')).toBeVisible()
  const inYourWords = page.getByRole('region', { name: 'In your words' })
  await expect(inYourWords.getByRole('button')).toHaveCount(2)
  await inYourWords.getByRole('button', { name: /Rushing — makes → Tension/ }).click()
  await expect(page.getByRole('dialog', { name: 'Free writing' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Free writing' }).getByRole('button', { name: 'Done', exact: true }).click()

  await page.getByText('Show as table').click()
  await expect(page.getByRole('row', { name: /Rushing weighs on you 2 1/ })).toBeVisible()
  await expectNoScores(page, 'the map of your ideas')

  // Kept: it opens again without sending anything.
  await page.reload()
  await expect(box(page, /^Rushing, weighs on you: 2 entries$/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Draw again' })).toBeVisible()
  expect(chats).toHaveLength(1)
})

test('an earlier map is listed and opens; a map says how many entries were written since', async ({ page }, testInfo) => {
  const drawn = (id: string, range: string, daysAgo: number) => {
    const at = new Date(NOW)
    at.setDate(at.getDate() - daysAgo)
    return {
      id,
      range,
      start: '2026-10-05',
      end: '2026-11-03',
      ideas: [
        { id: 'i1', label: 'Rushing', kind: 'weighs', entryIds: ['f1', 'f4'] },
        { id: 'i2', label: 'Tension', kind: 'weighs', entryIds: ['f1', 'f4'] },
      ],
      links: [{ from: 'i1', to: 'i2', words: 'makes', entryId: 'f1', quote: 'Rushing the morning makes everything tense' }],
      dropped: { ideas: 0, links: 0, cut: 0 },
      entryCount: 4,
      sent: { instructions: 'Reply with JSON only.', data: '[E1] …' },
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      createdAt: at.getTime(),
      updatedAt: at.getTime(),
    }
  }
  await restoreBackup(page, testInfo.outputPath('maps.json'), backupWith({ entries: journal(), ideaMaps: [drawn('new', '30', 3), drawn('old', '90', 20)] }, NOW))
  await page.goto('./#/insights/map')
  // The newest map shows, its period chosen; one entry has been written since it was drawn.
  await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
  await expect(box(page, /^Rushing, weighs on you: 2 entries$/)).toBeVisible()
  await expect(page.getByText('1 entry written since. Draw again to include them.')).toBeVisible()

  const earlier = page.getByRole('button', { name: /Groq · .* · 2 ideas, 1 link/ })
  await expect(earlier).toHaveCount(1)
  await earlier.click()
  const opened = page.getByRole('dialog', { name: /^Map of / })
  await expect(opened.getByRole('button', { name: /^Tension, weighs on you: 2 entries$/ })).toBeVisible()
  await opened.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(opened).toBeHidden()
})

test('a refused key, a limit and an unreadable reply are each said about the map', async ({ page }, testInfo) => {
  const replies = [{ status: 401 }, { status: 413 }, { status: 200, content: 'Here are some thoughts about your journal.' }, { status: 200, content: JSON.stringify({ ideas: [{ id: 'x', label: 'Perfectionism', kind: 'weighs', entries: ['E1'] }], links: [] }) }]
  await fakeGroq(page, () => replies.shift()!)
  await restoreBackup(page, testInfo.outputPath('map.json'), backupWith({ entries: journal() }, NOW))
  await setUpGroq(page)
  await page.goto('./#/insights/map')
  const draw = page.getByRole('button', { name: 'Draw my map' })
  const said = page.getByRole('alert')
  await draw.click()
  await expect(said).toHaveText("The key wasn't accepted. Check it in More → AI review.")
  await draw.click()
  await expect(said).toHaveText("That's more than the service takes at once. Try a shorter period, or wait a minute.")
  await draw.click()
  await expect(said).toHaveText("The AI's reply couldn't be read as a map. Try again.")
  await draw.click()
  await expect(said).toHaveText("None of what came back was in your words, so there's no map. Try again.")
  await expect(page.getByRole('button', { name: /weighs on you/ })).toHaveCount(0)
})

test('without an AI service the page offers to set one up, and fewer than 3 entries can’t be drawn', async ({ page }, testInfo) => {
  await restoreBackup(page, testInfo.outputPath('map.json'), backupWith({ entries: journal().slice(0, 2) }, NOW))
  await page.goto('./#/insights/map')
  await expect(page.getByRole('link', { name: /^Set up AI/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Draw/ })).toHaveCount(0)
  await fakeGroq(page)
  await setUpGroq(page)
  await page.goto('./#/insights/map')
  await expect(page.getByRole('button', { name: 'Draw my map' })).toBeDisabled()
  await expect(page.getByText('Needs 3 or more entries in this period.')).toBeVisible()
})

test('asking Ask for a picture of your thoughts links to the map of your ideas', async ({ page }, testInfo) => {
  const question = {
    id: 'q1',
    question: 'Draw a picture of my thoughts',
    answer: "I can't draw. In words: rushing and tension come up most.",
    cited: { receipts: [], entries: [] },
    sent: [{ label: 'Your question', text: 'Draw a picture of my thoughts' }],
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    createdAt: NOW.getTime(),
    updatedAt: NOW.getTime(),
  }
  await restoreBackup(page, testInfo.outputPath('ask.json'), backupWith({ entries: journal(), questions: [question] }, NOW))
  await page.goto('./#/ask')
  await page.locator('summary', { hasText: 'Draw a picture of my thoughts' }).click()
  await page.getByRole('link', { name: /^Map of your ideas/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Map of your ideas' })).toBeVisible()
})
