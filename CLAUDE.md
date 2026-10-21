# Life Design PWA: project rules

A private, phone-only daily journal (PWA) built on Designing Your Life and Ikigai, hosted on GitHub Pages at
https://shah-x.github.io/life-design/. Every decision and its status lives in `DECISIONS.md`.

## Non-negotiables
- Journal data never leaves the phone, except review packages the owner sends to their chosen AI provider or shares or downloads themselves. No analytics, no servers, no cloud backup.
- The AI API key is stored only on the device: never exported, logged or committed.
- This repo is public. No personal data in code, tests, fixtures or docs. Fixtures use fake demo data. `Self Reflection App background.md` and `private/` are git-ignored; check `git status` before every commit.
- $0 by default. Paid AI providers are opt-in and labelled as paid in the UI.

## How we work
- The build runs in phases (see `DECISIONS.md`). Stop after each phase for the owner's OK.
- Proof before "done": run `npm run typecheck`, `npm test` and `npm run test:e2e`, and quote the results. After a deploy, check the live URL. Anything that calls an outside API also gets a live check with fake data.
- Bugs: write a failing test first, then fix.
- When a decision changes, update `DECISIONS.md` in the same change.
- Machine safety: never run `brew install` or `brew upgrade` without `--dry-run` first and the owner's OK.

## UI rules (each one came from a real bug)
- Nothing may move under the user's finger: a screen renders only once its data has loaded, or keeps space reserved for content that arrives later. (Phase 1: a "Last backup" line loading late shifted the buttons, so a tap missed.)
- A visually hidden native input (radio, checkbox, switch) must cover its whole tap target, so taps and tests reach it. (Phase 1: a 1px switch input couldn't be tapped.)
- The e2e tests click straight after navigation on purpose. Keep it that way: it catches layout shifts.
- Files leave the iPhone app only through the share menu. Never a download link, and never a link or navigation to a file (.ics, data:, blob:). In the Home Screen app, "Add to Calendar" linking to an .ics file left the app on a blank screen with no way back. An e2e test guards this.
- Inputs show the value being edited straight away from local state; saving happens in the background. Never bind an input directly to a value that comes back from the database: it snaps back mid-typing.
- When the app refuses something (a file, a password), say exactly why and what to do next. A vague error cost a debugging round in Phase 1.
- Every question in a form says what it means: a hint, a placeholder example, or an ⓘ explanation.

## Charts (dataviz skill rules)
- Colours come only from the `--viz-*` tokens in `styles.css`. Before adding a colour, run the dataviz validator against both card surfaces (`#ffffff`, `#21201e`). Orange failed next to red; violet failed next to blue.
- One scale per chart (energy and engagement are separate charts). Thin marks: columns ≤24px with a 4px rounded data end and a 2px gap. Gridlines are solid hairlines.
- Every chart has a tap/focus readout and a table view; values never live only in colour or a tooltip. Text never wears the data colour.
- Groups are ranked only with 3+ entries (`MIN_COUNT`), and every average shows its count.

## Tech
- Vite 8, React 19, TypeScript 7 (`tsc --noEmit` only), vite-plugin-pwa 2 (generateSW, asks before updating), Dexie 4 (IndexedDB).
- Base path `/life-design/`. Routes are hashes (`#/today`), so reloads never 404 on Pages.
- The Content-Security-Policy is injected at build time in `vite.config.ts`; `connect-src https:` lets the app reach the chosen AI provider.
- Icons: edit `public/logo.svg`, then run `npm run icons`.
- Node 22.12 or newer (`.nvmrc`).

## Commands
- `npm run dev` · `npm run typecheck` · `npm test` · `npm run test:e2e` (WebKit at iPhone 16 size) · `npm run build`
- Deploy: push to `main`. GitHub Actions type-checks, tests, builds and publishes to Pages.
