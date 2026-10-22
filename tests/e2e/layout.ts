import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Layout faults on the screen as it is now: in the open sheet if there is one, otherwise the whole page.
 * General checks, so a new screen is covered without waiting for its own bug (until v0.12 every layout test
 * was written after the owner found the fault on the iPhone):
 * - the page scrolls sideways, or something reaches past the screen edge;
 * - a box cuts off its text;
 * - a normal word breaks across lines (Phase 2.6: "Home" wrapped one letter per line);
 * - a button, link or field can't be tapped: covered by something else, smaller than 24px (Phase 1: a 1px
 *   switch input), or stuck behind a bar even when scrolled as far as it goes;
 * - two tappable things overlap, or text sits on top of text;
 * - a link still in the browser's own underlined blue (the app never styled it);
 * - axe-core's WCAG A/AA checks (contrast, names, target size).
 * `small` lists tap targets under Apple's 44px: not failed, kept for the owner to decide.
 */
export async function layoutReport(page: Page): Promise<{ faults: string[]; small: string[] }> {
  const own = await page.evaluate(findLayoutFaults)
  const scope = (await page.locator('dialog[open]').count()) > 0 ? 'dialog[open]' : 'body'
  const axe = await new AxeBuilder({ page })
    .include(scope)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()
  const axeFaults = axe.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}${v.nodes.length > 3 ? ', …' : ''})`,
  )
  return { faults: [...own.faults, ...axeFaults], small: own.small }
}

export const layoutFaults = async (page: Page) => (await layoutReport(page)).faults

/** Fails (softly, so one run lists every fault) unless the screen as it is now has no layout faults. */
export async function expectCleanLayout(page: Page, screen: string) {
  const { faults, small } = await layoutReport(page)
  if (small.length) test.info().annotations.push({ type: 'under 44px', description: `${screen}: ${small.join(', ')}` })
  expect.soft(faults, `layout faults on ${screen}`).toEqual([])
}

/** Runs in the page. Self-contained: Playwright sends its source to the browser. */
function findLayoutFaults(): { faults: string[]; small: string[] } {
  const faults: string[] = []
  const small: string[] = []
  const vw = document.documentElement.clientWidth
  const vh = window.visualViewport?.height ?? window.innerHeight
  const root: Element = document.querySelector('dialog[open]') ?? document.body
  const all = [...root.querySelectorAll('*')]

  const name = (el: Element) => {
    const text = (el.getAttribute('aria-label') ?? (el as HTMLElement).innerText ?? el.textContent ?? '').trim().replace(/\s+/g, ' ')
    const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : ''
    return `<${el.tagName.toLowerCase()}${cls}${text ? ` "${text.slice(0, 40)}"` : ''}>`
  }
  const px = (n: number) => Math.round(n)
  const seen = (el: Element) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !el.closest('.visually-hidden')
  const overflows = (s: CSSStyleDeclaration) => s.overflowX !== 'visible' || s.overflowY !== 'visible'
  const scrolls = (s: CSSStyleDeclaration) => /auto|scroll/.test(s.overflowX + s.overflowY)
  // A fixed or sticky layer (the tab bar, a pinned header) that `el` sits in, short of one that also holds `other`.
  const layerOf = (el: Element, other?: Element): Element | null => {
    for (let a: Element | null = el; a && a !== root && !(other && a.contains(other)); a = a.parentElement) {
      if (/fixed|sticky/.test(getComputedStyle(a).position)) return a
    }
    return null
  }
  // The visible part of `el`'s box after every clipping or scrolling box around it.
  const clipOf = (el: Element) => {
    let box = { left: 0, top: 0, right: vw, bottom: vh }
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      if (a === document.body || !overflows(getComputedStyle(a))) continue
      const r = a.getBoundingClientRect()
      box = { left: Math.max(box.left, r.left), top: Math.max(box.top, r.top), right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom) }
    }
    return box
  }
  // Whether the box that scrolls `el` has gone as far as it can toward `bar` (so nothing more can reveal it).
  const cannotScrollFrom = (el: Element, barAtBottom: boolean) => {
    let scroller: Element = document.scrollingElement ?? document.documentElement
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (scrolls(getComputedStyle(a)) && a.scrollHeight > a.clientHeight) {
        scroller = a
        break
      }
    }
    return barAtBottom ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1 : scroller.scrollTop <= 0
  }
  const report = (list: string[], text: string) => {
    if (!list.includes(text)) list.push(text)
  }

  // 1. Sideways: the page, then the outermost thing reaching past the edge (unless a box scrolls it sideways).
  const sideways = document.documentElement.scrollWidth - vw
  if (sideways > 1) report(faults, `the page scrolls sideways by ${px(sideways)}px`)
  const wide: Element[] = []
  for (const el of all) {
    if (!seen(el) || wide.some((w) => w.contains(el))) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0 || (r.left >= -1 && r.right <= vw + 1)) continue
    let inScroller = false
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(a).overflowX)) inScroller = true
    }
    if (inScroller) continue
    wide.push(el)
    report(faults, `${name(el)} reaches ${px(r.left < -1 ? -r.left : r.right - vw)}px past the screen edge`)
  }

  // 2. Text cut off by its own box (an ellipsis or line clamp is cutting short on purpose; fields scroll).
  for (const el of all) {
    if (!(el instanceof HTMLElement) || !seen(el) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) continue
    const s = getComputedStyle(el)
    const clipsX = /hidden|clip/.test(s.overflowX)
    const clipsY = /hidden|clip/.test(s.overflowY)
    if ((!clipsX && !clipsY) || s.textOverflow === 'ellipsis' || (s.webkitLineClamp && s.webkitLineClamp !== 'none')) continue
    if (!el.innerText.trim()) continue
    const overX = clipsX ? el.scrollWidth - el.clientWidth : 0
    const overY = clipsY ? el.scrollHeight - el.clientHeight : 0
    if (overX > 1 || overY > 1) report(faults, `${name(el)} cuts off its text by ${px(Math.max(overX, overY))}px`)
  }

  // 3 and 6. Text: a normal word broken across lines; text on top of other text; text stuck behind a bar.
  const lines: { rect: DOMRect; node: Text; layer: Element | null }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const el = node.parentElement
    if (!el || !seen(el) || el.closest('svg, textarea, input, select, option')) continue
    const text = node.textContent ?? ''
    // Up to 20 letters is a normal word; longer runs (links, codes) may break on purpose (overflow-wrap: anywhere).
    for (const m of text.matchAll(/(?<![\p{L}\p{N}’'])[\p{L}\p{N}’']{2,20}(?![\p{L}\p{N}’'])/gu)) {
      const range = document.createRange()
      range.setStart(node, m.index)
      range.setEnd(node, m.index + m[0].length)
      const tops = new Set([...range.getClientRects()].filter((r) => r.width > 1).map((r) => px(r.top)))
      if (tops.size > 1) {
        report(faults, `"${m[0]}" breaks across lines in ${name(el)} (${px(el.getBoundingClientRect().width)}px wide)`)
        break
      }
    }
    const range = document.createRange()
    range.selectNodeContents(node)
    const clip = clipOf(el)
    const layer = layerOf(el)
    for (const r of range.getClientRects()) {
      if (r.width < 2 || r.height < 2) continue
      if (r.right <= clip.left || r.left >= clip.right || r.bottom <= clip.top || r.top >= clip.bottom) continue
      lines.push({ rect: r, node, layer })
    }
  }
  for (const [i, a] of lines.entries()) {
    for (const b of lines.slice(i + 1)) {
      if (a.node === b.node) continue
      const x = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
      const y = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
      if (x <= 2 || y <= 0.3 * Math.min(a.rect.height, b.rect.height)) continue
      const [under, bar] = a.layer && !b.layer ? [b, a.layer] : b.layer && !a.layer ? [a, b.layer] : [null, null]
      if (under && bar) {
        // Scrolled under a bar is fine while scrolling further would bring it out.
        const barAtBottom = bar.getBoundingClientRect().top > vh / 2
        if (cannotScrollFrom(under.node.parentElement!, barAtBottom)) {
          report(faults, `${name(under.node.parentElement!)} stays behind ${name(bar)} even scrolled as far as it goes`)
        }
        continue
      }
      report(faults, `text overlaps: ${name(a.node.parentElement!)} and ${name(b.node.parentElement!)}`)
    }
  }

  // 4 and 5. Every button, link and field: big enough, really reached by a tap, not on top of another.
  const TAPPABLE =
    'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])'
  const taps = [...root.querySelectorAll(TAPPABLE)].filter((el) => {
    if (!el.checkVisibility({ visibilityProperty: true }) || el.closest('[inert], [aria-hidden="true"]')) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  })
  const related = (a: Element, b: Element) => {
    if (a.contains(b) || b.contains(a)) return true
    const labels = (el: Element) => [...((el as HTMLInputElement).labels ?? [])]
    return labels(a).some((l) => l.contains(b)) || labels(b).some((l) => l.contains(a))
  }
  // What a finger can hit: a visible field inside a label is tapped through its label; a hidden one has to
  // cover the target itself (Phase 1: a 1px switch input). Inline links in a sentence and chart marks are
  // exempt (WCAG 2.5.8: every chart has a table view that does the same).
  // Its box, grown by an invisible ::before or ::after placed around it (the ⓘ buttons keep a 22px circle
  // inside a 44px tap area that way). Until v0.12.1 the check missed this and called every ⓘ too small.
  const tapBox = (el: Element) => {
    const r = el.getBoundingClientRect()
    const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    if (getComputedStyle(el).position === 'static') return { width: r.width, height: r.height }
    const at = (v: string) => (v.endsWith('px') ? parseFloat(v) : 0)
    for (const pseudo of ['::before', '::after']) {
      const s = getComputedStyle(el, pseudo)
      if (s.content === 'none' || s.content === 'normal' || s.position !== 'absolute' || s.pointerEvents === 'none') continue
      box.left = Math.min(box.left, r.left + at(s.left))
      box.top = Math.min(box.top, r.top + at(s.top))
      box.right = Math.max(box.right, r.right - at(s.right))
      box.bottom = Math.max(box.bottom, r.bottom - at(s.bottom))
    }
    return { width: box.right - box.left, height: box.bottom - box.top }
  }
  const target = (el: Element): { width: number; height: number } | null => {
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') return null
    if (el.closest('svg')) return null
    const own = tapBox(el)
    const label = (el as HTMLInputElement).labels?.[0]
    const shownInput = el.checkVisibility({ opacityProperty: true }) && !el.closest('.visually-hidden')
    if (!label || !shownInput) return own
    const l = label.getBoundingClientRect() // the field or its label, whichever reaches further each way
    return { width: Math.max(own.width, l.width), height: Math.max(own.height, l.height) }
  }
  // The part of `el` in sight: clipped by the boxes that scroll it (under a sheet's header or footer, it isn't).
  const inSight = (el: Element) => {
    const r = el.getBoundingClientRect()
    const c = clipOf(el)
    const box = { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }
    return box.right > box.left && box.bottom > box.top ? box : null
  }
  for (const el of taps) {
    const t = target(el)
    if (t && Math.min(t.width, t.height) < 24) report(faults, `${name(el)} is only ${px(t.width)}×${px(t.height)}px to tap (at least 24)`)
    else if (t && Math.min(t.width, t.height) < 44) report(small, `${name(el)} ${px(t.width)}×${px(t.height)}`)

    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const clip = clipOf(el)
    if (cx < clip.left || cx >= clip.right || cy < clip.top || cy >= clip.bottom) continue // scrolled out of sight
    const hit = document.elementFromPoint(cx, cy)
    if (!hit || related(el, hit)) continue
    const label = hit.closest('label')
    if (label && (label.contains(el) || (label as HTMLLabelElement).control === el)) continue
    const bar = layerOf(hit, el)
    if (bar) {
      if (cannotScrollFrom(el, bar.getBoundingClientRect().top > vh / 2)) {
        report(faults, `${name(el)} stays behind ${name(bar)} even scrolled as far as it goes`)
      }
      continue
    }
    report(faults, `${name(el)} is covered by ${name(hit)}: a tap there reaches the wrong thing`)
  }
  // 7. A link the app never styled: still the browser's own underlined blue (v0.11: "All next steps ›").
  const probe = document.createElement('a')
  probe.href = '#'
  probe.textContent = 'x'
  probe.style.setProperty('all', 'revert')
  root.append(probe)
  const browserLink = getComputedStyle(probe).color
  probe.remove()
  for (const a of root.querySelectorAll('a[href]')) {
    const s = getComputedStyle(a)
    if (seen(a) && s.color === browserLink && s.textDecorationLine.includes('underline')) {
      report(faults, `${name(a)} has the browser's own link look: the app never styled it`)
    }
  }

  for (const [i, a] of taps.entries()) {
    for (const b of taps.slice(i + 1)) {
      if (related(a, b) || Boolean(layerOf(a)) !== Boolean(layerOf(b))) continue
      const ra = inSight(a)
      const rb = inSight(b)
      if (!ra || !rb) continue
      const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)
      const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
      if (x > 1 && y > 1) report(faults, `${name(a)} and ${name(b)} overlap by ${px(x)}×${px(y)}px`)
    }
  }

  return { faults, small }
}
