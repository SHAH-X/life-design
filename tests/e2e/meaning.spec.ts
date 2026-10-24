import { expect, type Page, test } from '@playwright/test'
import { MEANING_ENTRIES } from '../fixtures/meaning'
import { captureShareSheet, expectNoScores, sharedFile } from './helpers'
import { dateKey, restoreBackup } from './seed'

// Search by meaning (v0.14) with the real model, in WebKit at iPhone size, on the fictional entries of
// tests/fixtures/meaning.ts, one a day back from yesterday. The model's files come from this site (the build refuses
// without them: npm run model). Most tests block the service worker, which the search doesn't need; the offline test
// needs it to reopen the app.

const MODEL_TIME = 60_000

function meaningBackup(now = new Date()) {
  const entries = MEANING_ENTRIES.map((e, i) => {
    const date = dateKey(i + 1, now)
    const at = new Date(`${date}T12:00:00`).getTime()
    return { ...e, date, createdAt: at, updatedAt: at }
  })
  const none: never[] = []
  return {
    app: 'life-design',
    kind: 'backup',
    schemaVersion: 7,
    exportedAt: now.toISOString(),
    data: { entries, days: none, answers: none, ikigaiItems: none, odysseyPlans: none, planVersions: none, views: none, weeks: none, steps: none, aiReviews: none, reviews: none, settings: none },
  }
}

/** Every request the page and its worker make. */
function watchRequests(page: Page) {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  return urls
}

async function turnOn(page: Page) {
  await page.goto('./#/more/meaning')
  await page.getByRole('switch', { name: /Find entries by meaning/ }).check()
  await expect(page.getByRole('switch', { name: /Find entries by meaning/ })).toBeChecked()
}

const search = (page: Page) => page.getByLabel('Search your logs')
const also = (page: Page) => page.getByRole('region', { name: 'Also about this' })

test.describe('search by meaning', () => {
  test.use({ serviceWorkers: 'block' })

  test('Logs offers it once; then entries about the same thing follow the word matches, and nothing leaves this site', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(120_000)
    const urls = watchRequests(page)
    await restoreBackup(page, testInfo.outputPath('meaning.json'), meaningBackup())
    await page.goto('./#/entries')
    await search(page).fill('burned out')
    const offer = page.locator('aside.notice', { hasText: 'Also find entries by meaning?' })
    await expect(offer).toBeVisible()
    const wordMatch = page.getByRole('button', { name: /^Cooking dinner/ }) // "Burned the toast … ordered out"
    await expect(wordMatch).toBeVisible()

    await offer.getByRole('button', { name: 'Turn on' }).click()
    await expect(offer).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: /ready|Looking by meaning/ })).toBeVisible()
    const before = await wordMatch.boundingBox()
    await expect(also(page).getByRole('button', { name: /^Quarterly report/ })).toBeVisible({ timeout: MODEL_TIME })
    expect(await wordMatch.boundingBox(), 'the word match stays where it was').toEqual(before)
    await expect(also(page).locator('.entry-row')).toHaveCount(3)
    await expect(also(page)).not.toContainText('Cooking dinner')
    await expect(also(page).locator('.entry-time').first()).toHaveText(/^\w{3},? \d{1,2} \w{3}$|^\w{3},? \w{3} \d{1,2}$/) // its day, not a time
    await expectNoScores(page, 'Logs, by meaning')

    // Asked once: the next search doesn't offer it again. With no word in common, it's all there is.
    await search(page).fill('feeling lonely')
    await expect(offer).toBeHidden()
    await expect(also(page).getByRole('button', { name: /^New city/ })).toBeVisible({ timeout: MODEL_TIME })

    expect(urls.some((u) => u.endsWith('/model.onnx.gz')), 'the model was fetched (and seen here)').toBe(true)
    // The runtime comes gzipped from models/ (about 4 MB); the bundler's own 14 MB copy is never fetched.
    expect(urls.filter((u) => u.includes('ort-wasm-simd-threaded'))).toEqual([])
    const origin = new URL(baseURL!).origin
    expect(urls.filter((u) => new URL(u).origin !== origin && !/^(data|blob):/.test(u))).toEqual([])

    await page.goto('./#/more')
    await expect(page.getByRole('link', { name: /Search by meaning\s*On/ })).toBeVisible()
  })

  test('"No thanks" puts the offer away; More can still turn it on', async ({ page }) => {
    await page.goto('./#/entries')
    await search(page).fill('walk')
    await page.getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByText('Also find entries by meaning?')).toBeHidden()
    await search(page).fill('walks')
    await expect(page.getByText('Also find entries by meaning?')).toBeHidden()
    await page.goto('./#/more')
    await expect(page.getByRole('link', { name: /Search by meaning\s*Off/ })).toBeVisible()
    await page.goto('./#/insights/review')
    await page.getByLabel(/Anything to focus on/).fill('walks')
    await expect(page.getByRole('switch', { name: 'Only entries about this' })).toHaveCount(0)
  })

  test('Review a period: "Only entries about this" sends just the entries about the focus, from all time', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await captureShareSheet(page)
    await restoreBackup(page, testInfo.outputPath('meaning.json'), meaningBackup())
    await turnOn(page)
    await page.goto('./#/insights/review')
    await page.getByRole('button', { name: 'All time' }).click()
    await expect(page.getByText(/^32 entries on 32 days/)).toBeVisible()
    await page.getByLabel(/Anything to focus on/).fill('worries about money')
    await page.getByRole('switch', { name: 'Only entries about this' }).check()
    const share = page.getByRole('button', { name: 'Share as a file' })
    await expect(share, "nothing can leave until it's narrowed").toBeDisabled()
    await expect(page.getByText(/entr(y|ies) about this on \d+ days?/)).toBeVisible({ timeout: MODEL_TIME })
    await expectNoScores(page, 'Review, narrowed')
    await share.click()
    const { text } = await sharedFile(page)
    expect(text).toContain('Only the entries about "worries about money" are here, chosen by the app')
    expect(text).toContain('Rent')
    expect(text).toContain('Car repair')
    for (const other of ['Karaoke', 'Hike', 'Quarterly report']) expect(text).not.toContain(other)
  })

  test('More → Search by meaning: removing the download deletes its files and numbers, and turns it off', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await restoreBackup(page, testInfo.outputPath('meaning.json'), meaningBackup())
    await turnOn(page)
    await page.goto('./#/entries')
    await search(page).fill('money')
    await expect(also(page).getByRole('button', { name: /^Rent/ })).toBeVisible({ timeout: MODEL_TIME })

    await page.goto('./#/more/meaning')
    await page.getByRole('button', { name: 'Remove the download' }).click()
    await expect(page.getByText('Removed. It downloads again if you turn it on.')).toBeVisible()
    await expect(page.getByRole('switch', { name: /Find entries by meaning/ })).not.toBeChecked()
    await expect(page.getByRole('button', { name: 'Remove the download' })).toHaveCount(0)
    expect((await page.evaluate(() => caches.keys())).filter((name) => name.startsWith('meaning-'))).toEqual([])
    const vectors = await page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const open = indexedDB.open('life-design')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const count = open.result.transaction('vectors').objectStore('vectors').count()
            count.onsuccess = () => resolve(count.result)
          }
        }),
    )
    expect(vectors).toBe(0)
  })
})

test.describe('search by meaning, offline', () => {
  test.use({ serviceWorkers: 'allow' })

  test('once downloaded, it works offline, after the app is reopened', async ({ page, context }, testInfo) => {
    test.setTimeout(120_000)
    await restoreBackup(page, testInfo.outputPath('meaning.json'), meaningBackup())
    await turnOn(page)
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))
    await page.reload() // now the service worker serves the app
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await page.goto('./#/entries')
    await search(page).fill('money')
    await expect(also(page).getByRole('button', { name: /^Rent/ })).toBeVisible({ timeout: MODEL_TIME })

    await context.setOffline(true)
    await page.reload()
    await search(page).fill('feeling lonely')
    await expect(also(page).getByRole('button', { name: /^New city/ })).toBeVisible({ timeout: MODEL_TIME })
    await context.setOffline(false)
  })
})
