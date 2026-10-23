import { expect, type Page, test } from '@playwright/test'

// Never a blank screen. While the app sits in the background, iOS can drop its database connection (a long-running
// WebKit bug: "UnknownError: Connection to Indexed Database server lost. Refresh the page to try again"), and Dexie
// can't open it again; a reload can. v0.8 on the iPhone: switching back to the app showed a blank screen.
// The test browser can't put the app in the background the way iOS does, so these tests make IndexedDB fail the way
// Safari reports it.

const LOST = 'Connection to Indexed Database server lost. Refresh the page to try again'

interface Spy {
  /** Every database connection the app opened. */
  connections: IDBDatabase[]
  /** From now on, reading or writing fails the way it does after iOS dropped the connection. */
  lost: boolean
  /** From now on, opening the database fails too. */
  failOpen: boolean
}

/**
 * Lets a test break the database the way iOS does. It must be in place before the app opens its database: Dexie
 * keeps its own copy of the connection's `transaction` method from then on.
 */
async function breakableDatabase(page: Page, lost = false) {
  await page.addInitScript(
    ({ message, lost }) => {
      const spy: Spy = { connections: [], lost, failOpen: false }
      ;(window as unknown as { spy: Spy }).spy = spy
      const failure = () => new DOMException(message, 'UnknownError')
      const transaction = IDBDatabase.prototype.transaction
      IDBDatabase.prototype.transaction = function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
        if (spy.lost) throw failure()
        return transaction.apply(this, args)
      }
      const open = IDBFactory.prototype.open
      IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
        if (spy.failOpen) throw failure()
        const request = version === undefined ? open.call(this, name) : open.call(this, name, version)
        request.addEventListener('success', () => spy.connections.push(request.result))
        return request
      }
    },
    { message: LOST, lost },
  )
}

const spyOn = (page: Page, change: (spy: Spy) => void) => page.evaluate(`(${change.toString()})(window.spy)`)

const tab = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name })

test('a lost database connection reloads the app instead of leaving a blank screen', async ({ page }) => {
  await breakableDatabase(page)
  await page.goto('./#/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await spyOn(page, (spy) => {
    spy.lost = true
  })

  const reloaded = page.waitForEvent('load', { timeout: 5000 })
  await tab(page, 'Logs').click()
  await reloaded
  await expect(page.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible()
  await expect(tab(page, 'Logs')).toBeVisible()
})

test('a database that cannot open again reloads when the app comes back, instead of waiting forever', async ({ page }) => {
  await breakableDatabase(page)
  await page.goto('./#/today')
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  // In the background, iOS closes the connection, and opening it again fails.
  await spyOn(page, (spy) => {
    spy.failOpen = true
    for (const connection of spy.connections) {
      connection.close()
      connection.dispatchEvent(new Event('close'))
    }
  })
  await tab(page, 'Logs').click()

  // Back in the foreground: the app checks its database, and reloads.
  const reloaded = page.waitForEvent('load', { timeout: 5000 })
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await reloaded
  await expect(page.getByRole('heading', { level: 1, name: 'Logs' })).toBeVisible()
})

test('a database that keeps failing gets a page that says so, with a reload', async ({ page }) => {
  await breakableDatabase(page, true)
  await page.goto('./#/today')
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible()
  await expect(page.getByText('Your entries are still on this phone.')).toBeVisible()
  await expect(page.getByText(/UnknownError/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
})

test('a database that never answers shows that the journal is opening, with a reload', async ({ page }) => {
  await page.addInitScript(() => {
    // An open request that never finishes.
    IDBFactory.prototype.open = () => ({}) as IDBOpenDBRequest
  })
  await page.goto('./')
  await expect(page.getByText('Opening your journal…')).toBeVisible({ timeout: 8000 })
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
})

/** How many entries are saved, read straight from the database. */
const savedEntries = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('life-design')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const connection = request.result
          const count = connection.transaction('entries').objectStore('entries').count()
          count.onsuccess = () => {
            resolve(count.result)
            connection.close()
          }
        }
      }),
  )

/** What iOS does when you switch to another app: the page is hidden, then frozen or closed. */
const switchAway = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })

// A draft is normally saved half a second after the last change; switching away mustn't wait for that, or a
// reload (or iOS closing the app) would lose it.
const BEFORE_THE_USUAL_SAVE = { timeout: 300, intervals: [50] }

test('what you write is saved the moment you switch to another app', async ({ page }) => {
  await page.goto('./#/today')
  await page.getByRole('button', { name: 'Write freely' }).click()
  await page.getByRole('dialog', { name: 'Write freely' }).getByLabel("What's on your mind?").fill('A thought before switching apps')
  await switchAway(page)
  await expect.poll(() => savedEntries(page), BEFORE_THE_USUAL_SAVE).toBe(1)
  await page.reload()
  await expect(page.getByText('A thought before switching apps')).toBeVisible()
})

test('an activity you started is saved the moment you switch to another app', async ({ page }) => {
  await page.goto('./#/today')
  await page.getByRole('button', { name: '+ Reflect on an activity' }).click()
  const sheet = page.getByRole('dialog', { name: 'New activity' })
  await sheet.getByLabel('What did you do?').fill('Choir rehearsal')
  await sheet.getByRole('button', { name: 'Next' }).click()
  await switchAway(page)
  await expect.poll(() => savedEntries(page), BEFORE_THE_USUAL_SAVE).toBe(1)
})
