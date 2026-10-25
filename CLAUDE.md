# Life Design PWA: project rules

A private, phone-only daily journal (PWA) built on Designing Your Life and Ikigai, hosted on GitHub Pages at
https://shah-x.github.io/life-design/. What the app does and why: `DECISIONS.md` (current state only; history is in git).

## Non-negotiables
- Journal data never leaves the phone, except what the owner sends to their chosen AI provider (a review, a question, a photo; receipt photos go as they're added while "Read receipts with AI" is on, the owner's choice) or shares or downloads themselves. No analytics, no servers, no cloud backup.
- The AI API keys (one for Ask and reviews, and an optional one for photos alone) are stored only on the device: never exported, logged or committed, and never put in an error message (`src/lib/ai.ts` words its own errors). A new key's setting goes in `SECRET_SETTING_KEYS` (`src/db/backup.ts`), with a test that a backup has none of it. The privacy scan refuses key-like strings (`gsk_…`, `sk-…`, `AIza…`); test keys are short fakes such as `gsk_test_abcd`. AI is called only when the owner taps, except for receipt photos (DECISIONS, "Photos read by your AI"). Review a period shows exactly what goes before it's sent ("See what's sent"); Ask your journal lists every part that went after the answer ("What was sent"), as its AI asks the phone for what it needs (owner's OK, 2026-10-24).
- This repo is public. No personal data in code, tests, fixtures or docs; fixtures use fake demo data. `Self Reflection App background.md` and `private/` are git-ignored; check `git status` before every commit. `npm run privacy-scan` runs as the pre-commit hook (install: `printf '#!/bin/sh\nexec sh scripts/privacy-scan.sh\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`) and reads its patterns from `private/scan-patterns.txt`. It must print "staged files are clear"; a scan that can't run refuses the commit, never passes it.
- $0 by default. Paid AI providers are opt-in and labelled as paid in the UI.

## How we work
- Work in steps, and stop after each for the owner's OK.
- Checks scale with the change. Quote what ran, and say what didn't:

  | Change | Run |
  |---|---|
  | Docs only | `npm test` |
  | Code, nothing on screen changes | `npm run typecheck` · `npm test` · the e2e spec(s) for that feature (`npx playwright test tests/e2e/<feature>.spec.ts`) |
  | What a screen shows | the above + `npm run screens`, then look (below) |
  | Sheets, fields, keyboard or scrolling | the above + `npm run ios-check`, then look at `test-results/ios/` |
  | Code that calls the AI service | the above + the live check (`AI_LIVE=1`, a fake key) |
  | Before pushing to `main` | the full `npm run test:e2e`; after the deploy, open the live URL |

- Look before "done": open every changed screenshot and its `-diff.png` in `test-results/`, and name them in the report. Accept with `npm run screens -- --update-snapshots=changed` only after looking (plain `--update-snapshots` rewrites every one). A new screen: `-- --update-snapshots=missing`, then look. A removed or renamed screen: delete its old screenshots (Playwright keeps them).
- Bugs: a failing test first, then the fix.
- e2e locators: `name` matches part of a name, so short button names use `exact: true` (`{ name: 'Done', exact: true }`).
- Docs say what is true now. When a decision changes, rewrite its row in `DECISIONS.md` in the same commit (a status goes in the Status column, never over the Why: `tests/unit/decisions.test.ts`). Then search README, DECISIONS and CLAUDE for the old wording, and for each word the screen showed (a button's label, not only the feature's name).
- Layout last (owner, 2026-10-24): until the owner asks for the layout pass, build and check behaviour only (typecheck, unit tests, the e2e specs for what changed); skip `screens`, word budgets and `ios-check`, don't fix visual faults, and list the layout work owed in each report.
- Other Claude sessions may share this working tree: stage by path (`git add <paths>`), never `-a` or `-A`, and re-read a doc just before rewriting it.
- Machine safety: never `brew install` or `brew upgrade` without `--dry-run` first and the owner's OK.

## UI rules (each came from a real bug)
- Every main screen and sheet is in `tests/e2e/screens.spec.ts`, with the keyboard up over each text box: add each new one. It gets `expectCleanLayout` (`tests/e2e/layout.ts`: sideways scroll, cut-off or squeezed text, buttons that can't be tapped or are under 24px, overlaps, things behind a bar, list rows taller than a third of the screen, axe-core's WCAG AA rules) and a reference screenshot. Values that change by themselves are masked in `changing()`. A new check gets a planted fault in `tests/e2e/layout-check.spec.ts`.
- Nothing moves under the finger: a screen renders once its data has loaded, or reserves the space. The e2e tests click straight after navigation on purpose, to catch shifts.
- A visually hidden native input (radio, checkbox, switch) covers its whole tap target.
- Files leave the app only through the share menu: never a download link, and never a link or navigation to a file (.ics, data:, blob:). An e2e test guards this.
- Inputs show the value being edited from local state and save in the background. Never bind an input to a value read back from the database: it snaps back mid-typing.
- Sheets (`Dialog`): the page behind never scrolls (`useScrollLock`; `.sheet-body` has `overscroll-behavior: contain`). A sheet opens on its content or a field marked `data-autofocus`, never on ✕ Close. It sits above the keyboard (`useKeyboardInset`; the iOS 27 details are in DECISIONS, "Sheets and the iPhone keyboard"), and anything else pinned to the bottom with a text field does the same. A focused field is wholly in sight (`keepInView`); a box that appears on a tap takes the focus in that tap (`flushSync`), other things use `revealOnMount`. Entry sheets are `full`, footers one row, text boxes capped to the room above the keyboard. e2e checks use `expectInSheetView`: Playwright scrolls a field into sight before tapping, which a person can't.
- Never a blank screen: `ErrorBoundary` (`reloadOnce`), `useDatabaseCheck` on return from the background, `<Loading />` for waits (never a bare empty `div`); unfinished entries save the moment the app is hidden. `tests/e2e/resume.spec.ts` breaks the database the way Safari reports it.
- Colour only where it means something: the energy edge and the evening's sand. Words stay in ink; a new colour passes WCAG AA on the white card.
- Deleting from a list is a swipe left with Undo (`useDeleteEntry`, `UndoProvider`); Delete stays on the entry too, for VoiceOver. Swipe Delete isn't rendered until the row moves.
- Entry rows and the entry screen are as DECISIONS says ("Entry rows", "An entry, one screen"): a part opens `EntryEdit` with its `part`, saved whole so energy and flow follow the words. No separate Edit form.
- Long words never squeeze a label: words go on a line of their own. The Insights e2e test checks no line's name wraps past two lines.
- Before adding a class name, search `styles.css` for it: a shared name picks up another screen's look.
- When the app refuses something (a file, a password), say exactly why and what to do next.
- An error's words fit where it shows: a message written for one feature (a review's "try a shorter period") isn't shown for another; each AI call words its own problems (`PHOTO_PROBLEMS` in `src/lib/ai.ts`), with a test.
- Every question explains itself in plain words ("Did it give you energy, or take it?", not "Energy"); every answer is worded. The deeper why sits behind ⓘ.
- A question that replaces another under the finger ignores taps for 300 ms, its answers `aria-disabled` meanwhile. An e2e test taps twice.
- New writing has no title, category or questions: Today's one box opens the writer (v0.15, owner). Never add a form, picker or required field to it.
- The activity questions and their word lists never change, so days stay comparable (activities from before v0.15 keep them when a part is changed): tune weights in `feelings.ts`, not the words. Variety goes into the purpose and evening questions.
- Every step after "What did you do?" can be skipped; a skip is recorded in `skipped`, never guessed.
- Next steps live in their own list (`steps`), never as buttons on an entry. `stepsForActivity` brings one back, `findLookAlike` joins look-alikes, and old next steps become steps through `stepsFromIntentions` only.
- Purpose questions are helpers above one writing box, never fields to fill.

## No ratings (owner: "I don't want any rating to be given")
- Nothing asks for or shows a rating, score, average or scale: not numbers, stars or ordered word scales. Plain counts, dates and the time logged are fine. Energy, engagement, flow and search by meaning's closeness are worked out and stored, never shown. `tests/e2e/no-scores.spec.ts` guards the main screens and Insights' pages.
- Insights speak of what you've written, never causes ("in 4 of your 5 entries", never "because"), and every line opens to its entries. A possible insight needs 3+ finished entries mostly one way, a weekly line 2+; drafts and skipped answers never count. Nothing to choose or fill in, and nothing said twice (`contextHighlights`).
- Check every new feature against DECISIONS, "Never".

## Words and clutter
- A screen is a title, its questions or content, and one main action. No help paragraphs: ⓘ or a collapsed section instead. A status is one short line; Today shows at most one notice. Settings live on their own pages.
- Word budgets: `tests/e2e/word-budget.spec.ts` runs at a fixed date on purpose (the evening question changes daily). Raise a budget only with the owner's OK; a new main screen gets one.

## Charts (dataviz skill rules)
- Light only: every colour once in `:root` in `styles.css`; `tests/unit/palette.test.ts` fails if a dark colour, `light-dark()` or a dark media query comes back. Don't design, test or screenshot a dark look.
- Chart colours only from the `--viz-*` tokens; run the dataviz validator against `#ffffff` before adding one.
- One scale per chart; counts, never averages folded into one mark. Columns ≤24px with a 4px rounded data end and a 2px gap; solid hairline gridlines.
- Every chart has a tap/focus readout and a table view; values never live only in colour or a tooltip; text never wears the data colour.
- Groups are ranked only with 3+ entries (`MIN_COUNT`), and show their count.

## Tech
- Stack in DECISIONS. `tsc --noEmit` only; vite-plugin-pwa (generateSW) asks before updating. Base path `/life-design/`; hash routes (`#/today`).
- The CSP is injected at build time in `vite.config.ts`; `connect-src` names only this site, `api.groq.com`, `api.openai.com` and `generativelanguage.googleapis.com` (Gemini) (a unit test checks). A new AI service means adding its address there, on purpose. A worker doesn't take the `<meta>` policy, so each fetches only its own fixed files (`tests/unit/meaningWorker.test.ts`, `ocrWorker.test.ts`).
- The on-phone models' files (search by meaning, reading photos) are git-ignored in `public/models/`, pinned in `src/lib/meaning-model.json` and `ocr-model.json`. `npm run model` fetches and checks them (a changed file refuses: never edit a hash to make it pass); the build refuses without them; never precached. `meaningModel`, `areasModel`, `loopsModel` and `ocrModel` tests run the real models in Node, on fictional data only.
- e2e tests stand in for the AI service with `page.route` and `test.use({ serviceWorkers: 'block' })` (requests through the service worker skip `page.route`). The live check, `tests/e2e/ai-live.spec.ts`, runs only with `AI_LIVE=1` and a fake key.
- Icons: edit `public/logo.svg`, then `npm run icons`. Node 22.12 or newer (`.nvmrc`).

## Commands
- `npm run dev` · `typecheck` · `test` · `test:e2e` (WebKit at iPhone 17 size; includes `screens`) · `screens` · `ios-check` (needs `npm run preview` running, Xcode's iOS 27.0 simulator and idb: DECISIONS, "Driving the simulator") · `build` · `model` (before tests and builds)
- Deploy: push to `main`. GitHub Actions type-checks, tests, builds and publishes to Pages.
- Version bump: `npm version <x.y.z> --no-git-tag-version`, so package.json and the lockfile stay in step (a unit test checks).
