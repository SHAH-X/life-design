# Life Design PWA: project rules

A private, phone-only daily journal (PWA) built on Designing Your Life and Ikigai, hosted on GitHub Pages at
https://shah-x.github.io/life-design/. Every decision and its status lives in `DECISIONS.md`.

## Non-negotiables
- Journal data never leaves the phone, except review packages the owner sends to their chosen AI provider or shares or downloads themselves. No analytics, no servers, no cloud backup.
- The AI API key is stored only on the device: never exported, logged or committed, and never put in an error message (`src/lib/ai.ts` words its own errors). The privacy scan refuses key-like strings (`gsk_…`, `sk-…`); test keys are short fakes such as `gsk_test_abcd`. AI is called only when the owner taps, and "See what's sent" shows exactly what goes.
- This repo is public. No personal data in code, tests, fixtures or docs. Fixtures use fake demo data. `Self Reflection App background.md` and `private/` are git-ignored; check `git status` before every commit. `npm run privacy-scan` runs as the pre-commit hook (install: `printf '#!/bin/sh\nexec sh scripts/privacy-scan.sh\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`) and reads its patterns from `private/scan-patterns.txt`. It must print "staged files are clear"; a scan that can't run refuses the commit, never passes it.
- $0 by default. Paid AI providers are opt-in and labelled as paid in the UI.

## How we work
- The build runs in phases (see `DECISIONS.md`). Stop after each phase for the owner's OK.
- Proof before "done": run `npm run typecheck`, `npm test` and `npm run test:e2e`, and quote the results. After a deploy, check the live URL. Anything that calls an outside API also gets a live check with fake data.
- Look before "done": after any change to what a screen shows, run `npm run screens`, open every changed screenshot and its `-diff.png` (in `test-results/`) and look at them, and name in the report which ones were looked at. Accept a change with `npm run screens -- --update-snapshots` only after looking. (Until v0.12 the owner found every layout fault on the iPhone: five fix releases, each test written after its bug, and no screenshot ever looked at.)
- Bugs: write a failing test first, then fix.
- e2e locators: `name` matches part of a name, so short button names use `exact: true` (`{ name: 'Done', exact: true }`). (v0.8: "Done" also matched "Done it" once a next step had saved, so a week test failed about one run in three.)
- When a decision changes, update `DECISIONS.md` in the same change, and search README, DECISIONS and CLAUDE for the old wording (e.g. `grep -in gauge`) so no mention is left stale. (Phase 2.6 replaced the balance gauges, but two rows and the README still described them until v0.7.) Change a status in its Status column, never over the Why: `tests/unit/decisions.test.ts` checks every table keeps its columns (v0.8: an edit wrote statuses over three reasons).
- Machine safety: never run `brew install` or `brew upgrade` without `--dry-run` first and the owner's OK.

## UI rules (each one came from a real bug)
- Every main screen and sheet is in `tests/e2e/screens.spec.ts` (light and dark, the keyboard up over each text box): add a new one when it's built. There it gets the general layout check (`expectCleanLayout` in `tests/e2e/layout.ts`: sideways scroll, cut-off text, words squeezed across lines, buttons that can't be tapped or are under 24px, overlaps, things stuck behind a bar, and axe-core's WCAG AA rules including contrast) and a reference screenshot. Values that change by themselves (storage in use, the build stamp) are masked in `changing()`. `tests/e2e/layout-check.spec.ts` plants each fault to prove the check finds it: a new check gets a planted fault there.
- Nothing may move under the user's finger: a screen renders only once its data has loaded, or keeps space reserved for content that arrives later. (Phase 1: a "Last backup" line loading late shifted the buttons, so a tap missed.)
- A visually hidden native input (radio, checkbox, switch) must cover its whole tap target, so taps and tests reach it. (Phase 1: a 1px switch input couldn't be tapped.)
- The e2e tests click straight after navigation on purpose. Keep it that way: it catches layout shifts.
- Files leave the iPhone app only through the share menu. Never a download link, and never a link or navigation to a file (.ics, data:, blob:). In the Home Screen app, "Add to Calendar" linking to an .ics file left the app on a blank screen with no way back. An e2e test guards this.
- Inputs show the value being edited straight away from local state; saving happens in the background. Never bind an input directly to a value that comes back from the database: it snaps back mid-typing.
- The page behind a sheet never scrolls. A modal `<dialog>` blocks taps, not scrolling, so `Dialog` pins the page with `useScrollLock` (and puts it back on close), and `.sheet-body` has `overscroll-behavior: contain`. (v0.7 on the iPhone: scrolling in "New activity" moved the screen behind it. An e2e test guards this.)
- Never a blank screen. `ErrorBoundary` wraps the app: a lost database connection reloads it once (`reloadOnce`, at most once in 30 s), anything else shows "Something went wrong" with Reload. The app checks its database when it comes back from the background (`useDatabaseCheck`). Waiting screens use `<Loading />`, which offers a reload after 4 s, never a bare empty `div`. Unfinished entries save the moment the app is hidden. (v0.8 on the iPhone: blank after switching back to the app, once iOS had dropped the database connection. `tests/e2e/resume.spec.ts` breaks the database the way Safari reports it.)
- Colour only where it means something: the thin energy edge (blue gave, red took: the chart colours) and the evening's pale sand. Words stay in ink; a new colour must pass WCAG AA on both card surfaces. (v0.7: red feeling words read like an error.)
- Deleting from a list is a swipe left, and always offers Undo for a few seconds (`useDeleteEntry`, `UndoProvider`); Delete stays in Edit too, for VoiceOver. Swipe Delete isn't rendered until the row moves, so it never counts as a word or a button.
- Long words must never squeeze a label: rows put their words on a line of their own (Phase 2.6: "Home" wrapped one letter per line). The Insights e2e test checks label widths.
- Before adding a class name, search `styles.css` for it: a shared name picks up another screen's look. (v0.8: the entry read-back borrowed the Reminders card's `.summary` panel by accident.)
- When the app refuses something (a file, a password), say exactly why and what to do next. A vague error cost a debugging round in Phase 1.
- Every question explains itself in plain words (e.g. "Did it give you energy, or take it?", not "Energy"), and every answer is worded, not a number. The deeper "why" sits behind ⓘ. (Phase 2.5: number buttons under one-word labels felt like a form and didn't draw out a real answer.)
- A sheet opens on its content, or on a field marked `data-autofocus`, never on ✕ Close. (Since Phase 1 the browser's default put focus on Close: a ring on every sheet, and a stray Enter closed it. An e2e test guards this.)
- Sheets sit on top of the iPhone keyboard. iOS shrinks only the visible area (`visualViewport`) for the keyboard, never the page, so `Dialog` uses `useKeyboardInset`. Anything else pinned to the bottom with a text field must do the same. (v0.6: the keyboard covered "What did you do?". An e2e test fakes the keyboard.)
- A field never sits under a sheet's header or footer. `Dialog` brings a focused field wholly into sight (`keepInView`), again once the keyboard is up; a box that appears on a tap takes the focus in that same tap (`flushSync`), and other things that appear use `revealOnMount`. Entry sheets use the whole screen (`full`), footers are one row, and text boxes are capped to the room above the keyboard. e2e checks use `expectInSheetView`, not just "above the keyboard": Playwright scrolls a field into sight before tapping it, which a person can't do. (v0.9 on the iPhone: "+ your own word" put its box behind Skip.)
- A question that replaces another under the finger ignores taps for 300 ms and marks its answers `aria-disabled` meanwhile, so a fast double tap can't answer it. An e2e test taps twice to prove it.
- The activity questions ("What was it like?", "What did it do to your energy?", "How did you feel?") and their word lists stay the same every day so patterns stay comparable; tune weights in `feelings.ts`, not the words. Variety goes into the purpose questions and the evening question. (v0.8 replaced "How did it leave you?" with the energy question and a feelings list, per the owner's brief; older words still read and count.)
- Every step after "What did you do?" can be skipped, and a skipped question is recorded in `skipped`, never guessed: Insights leave it out. (Owner's brief: "do not invent missing information".)
- Next steps live in their own list (`steps`, Insights → Next steps), never as buttons on the entry: nothing to tick at the moment of writing. A step comes back when you write about the same activity (`stepsForActivity`), a look-alike joins the step you have (`findLookAlike`), and next steps found on old entries or in older backups become steps through `stepsFromIntentions` only. (v0.11, owner: "I am writing it for future, how can I have done it?")
- Purpose questions are helpers above one writing box, never fields to fill: three at a time, "↻ Other questions" for more. "Make sense of a hard time" never pushes for a lesson. (v0.9, owner: "just one box … without thinking how much to include against which question".)

## No ratings, natural responses (Phase 2.6: "I don't want any rating to be given")
- Nothing asks for or shows a rating, score, average or scale: not as numbers, not as stars, not as ordered word scales. Answers are natural words (feeling words, your own words, notes); results are words ("usually gives you energy"). Plain counts are fine ("5 times", "on 4 days"), and so are dates and the time an entry was logged.
- Energy, engagement and flow are worked out on the phone from the words (`src/domain/feelings.ts`, one table of weights with tests) and stored for analysis, never displayed as values.
- `tests/e2e/no-scores.spec.ts` fails if a score pattern (`+2`, `3.0`, `7/10`, "average") appears on Today, the logging screens, an entry read back, Entries, Insights or Patterns.
- New screens follow the same rule: natural questions with words, never gauges or 0–10. Worded choices are fine ("It gave me energy" · "It used up my energy" · "Little difference" · "A mix of both").
- The standing "never" list from the market research lives in `DECISIONS.md`: check new features against it.
- Insights come from the app, never from a chore: nothing to fill in for a weekly review. Every insight line opens to the entries behind it, and speaks of what you've written, never causes ("in 4 of your 5 entries", "often"; never "because"). A possible insight needs 3+ finished entries mostly one way, a weekly line 2+; drafts and skipped answers never count.

## Words and clutter (Phase 2.5: "the app feels wordy")
- A screen is a title, the questions or content, and one main action. No help paragraphs: a question explains itself; anything more goes behind ⓘ or a collapsed section.
- A status is one short line. Today shows at most one notice (backup due, then install).
- Settings live on their own pages; More stays a short list.
- Every screen speaks in words; plain counts, dates and times are the only numbers (see "No ratings" above).
- Word budgets: `tests/e2e/word-budget.spec.ts` counts the visible words on each main screen with the fictional seed and fails above its budget. It runs at a fixed date on purpose: the evening question changes daily, and a floating date let the test pass or fail by chance. Raise a budget only with the owner's OK; a new main screen gets a budget when it's added.

## Charts (dataviz skill rules)
- Every colour token is written once as `light-dark(light, dark)`, so More → Appearance can force either look; `tests/unit/palette.test.ts` keeps the copy for iOS before 17.5 in step. Appearance itself lives in `localStorage` and `public/appearance.js` applies it before the first paint.
- Colours come only from the `--viz-*` tokens in `styles.css`. Before adding a colour, run the dataviz validator against both card surfaces (`#ffffff`, `#21201e`). Orange failed next to red; violet failed next to blue.
- One scale per chart (energy and engagement are separate charts). Thin marks: columns ≤24px with a 4px rounded data end and a 2px gap. Gridlines are solid hairlines.
- Every chart has a tap/focus readout and a table view; values never live only in colour or a tooltip. Text never wears the data colour.
- Groups are ranked only with 3+ entries (`MIN_COUNT`), and every average shows its count.

## Tech
- Vite 8, React 19, TypeScript 7 (`tsc --noEmit` only), vite-plugin-pwa 2 (generateSW, asks before updating), Dexie 4 (IndexedDB).
- Base path `/life-design/`. Routes are hashes (`#/today`), so reloads never 404 on Pages.
- The Content-Security-Policy is injected at build time in `vite.config.ts`; `connect-src` names only this site, `api.groq.com` and `api.openai.com` (a unit test checks it). Adding an AI service means adding its address there, on purpose.
- e2e tests stand in for the AI service with `page.route` and block service workers (`test.use({ serviceWorkers: 'block' })`): requests that go through the app's service worker skip `page.route` and reach the real service. The one live check, `tests/e2e/ai-live.spec.ts`, runs only with `AI_LIVE=1` and a fake key.
- Icons: edit `public/logo.svg`, then run `npm run icons`.
- Node 22.12 or newer (`.nvmrc`).

## Commands
- `npm run dev` · `npm run typecheck` · `npm test` · `npm run test:e2e` (WebKit at iPhone 16 size) · `npm run screens` (every screen: layout check and screenshots; part of `test:e2e` too) · `npm run build`
- Deploy: push to `main`. GitHub Actions type-checks, tests, builds and publishes to Pages.
- Version bump: `npm version <x.y.z> --no-git-tag-version`, so package.json and package-lock.json stay the same (a unit test checks; until v0.6.1 the lockfile still said 0.1.0).
