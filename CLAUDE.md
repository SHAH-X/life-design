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

## Tech
- Vite 8, React 19, TypeScript 7 (`tsc --noEmit` only), vite-plugin-pwa 2 (generateSW, asks before updating), Dexie 4 (IndexedDB).
- Base path `/life-design/`. Routes are hashes (`#/today`), so reloads never 404 on Pages.
- The Content-Security-Policy is injected at build time in `vite.config.ts`; `connect-src https:` lets the app reach the chosen AI provider.
- Icons: edit `public/logo.svg`, then run `npm run icons`.
- Node 22.12 or newer (`.nvmrc`).

## Commands
- `npm run dev` · `npm run typecheck` · `npm test` · `npm run test:e2e` (WebKit at iPhone 16 size) · `npm run build`
- Deploy: push to `main`. GitHub Actions type-checks, tests, builds and publishes to Pages.
