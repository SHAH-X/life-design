import { expect, test, type Page } from '@playwright/test'
import { layoutFaults } from './layout'

// The layout check must fail loudly: each fault below is planted on purpose, and the check has to name it.
// A clean page has to pass, or the check would be noise that people learn to ignore.

async function show(page: Page, body: string) {
  await page.setContent(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width">
    <title>Layout check</title>
    <style>body{margin:0;font:16px/1.4 -apple-system,system-ui,sans-serif;color:#1d1c1a;background:#fff}
    main{padding:16px}button{min-height:44px;min-width:44px;font:inherit}</style></head>
    <body><main>${body}</main></body></html>`)
}

test('a clean page has no faults', async ({ page }) => {
  await show(page, `<h1>Today</h1><p>Plain words that fit on the screen without any trouble.</p>
    <label>What did you do? <input style="min-height:44px"></label> <button>Save</button>
    <label style="display:block;padding:12px 0"><input type="radio" name="p"> A visible radio, tapped through its row</label>
    <div style="display:flex;flex-direction:column;height:200px">
      <div style="overflow:auto;flex:1"><div style="height:400px"></div><button>Scrolled under the footer</button></div>
      <footer><button>Next</button></footer>
    </div>`)
  await page.locator('main [style*="overflow:auto"]').evaluate((el) => (el.scrollTop = 120)) // the button now sits under the footer, out of sight
  expect(await layoutFaults(page)).toEqual([])
})

const PLANTED: [string, string, RegExp][] = [
  ['the page scrolls sideways', '<div style="width:600px">Wide</div>', /scrolls sideways by \d+px/],
  ['something reaches past the edge', '<div style="width:600px">Wide</div>', /<div "Wide"> reaches \d+px past the screen edge/],
  ['a box cuts off its text', '<div style="width:60px;overflow:hidden;white-space:nowrap">A label far too long</div>', /cuts off its text/],
  ['a word squeezed one letter per line', '<div style="width:12px;overflow-wrap:anywhere">Home</div>', /"Home" breaks across lines/],
  [
    'a button covered by something else',
    '<div style="position:relative"><button>Save</button><div style="position:absolute;inset:0;background:#fff"></div></div>',
    /<button "Save"> is covered by <div>/,
  ],
  ['two buttons on top of each other', '<button>One</button><button style="margin-left:-30px">Two</button>', /<button "One"> and <button "Two"> overlap/],
  [
    'a hidden native input that doesn’t cover its switch',
    '<label style="display:inline-block;padding:12px"><input type="checkbox" style="position:absolute;opacity:0;width:1px;height:1px;margin:0"> Remember</label>',
    /<input> is only 1×1px to tap/,
  ],
  ['faint text', '<p style="color:#ccc">Faint words</p>', /^color-contrast:/],
  [
    'text on top of text',
    '<p style="position:absolute;top:100px;margin:0">First line here</p><p style="position:absolute;top:104px;margin:0">Second line here</p>',
    /text overlaps: <p "First line here"> and <p "Second line here">/,
  ],
]

for (const [fault, html, message] of PLANTED) {
  test(`finds ${fault}`, async ({ page }) => {
    await show(page, html)
    const faults = await layoutFaults(page)
    expect(faults.some((f) => message.test(f)), `${message} in:\n${faults.join('\n')}`).toBe(true)
  })
}

test('finds a button that stays behind the bottom bar even scrolled to the end', async ({ page }) => {
  await show(
    page,
    `<div style="height:1200px">Long content</div><button>Last</button>
     <nav style="position:fixed;bottom:0;left:0;right:0;height:90px;background:#fff">Tab bar</nav>`,
  )
  // At the top, the button is only scrolled under the bar: scrolling brings it out, so that's fine.
  expect((await layoutFaults(page)).filter((f) => f.includes('behind'))).toEqual([])
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const faults = await layoutFaults(page)
  expect(faults.some((f) => /<button "Last"> stays behind <nav "Tab bar"> even scrolled as far as it goes/.test(f)), faults.join('\n')).toBe(true)
})
