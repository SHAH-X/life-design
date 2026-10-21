# Decisions

Living status of every product and technical decision. When a decision changes, update this file in the same change.

**Statuses:** ADOPT (in use) · TEST (adopted, still to be proven on a real iPhone) · WATCH (depends on something outside our control that may change) · REJECT (considered, not used)

Last updated: 2026-10-21

## Product

| Area | Decision | Status | Why |
|---|---|---|---|
| Build vs adopt | Build new. The earlier single-file v1 is the spec; v1 backup files can be imported | ADOPT | No existing app combines Good Time Journal, Odyssey Plans and Ikigai |
| Memex + a small plans app | — | REJECT | Native app, not built around energy and engagement; two apps |
| Fork Nomie 5 | — | REJECT | Inactive since 2021; no Designing Your Life tools |
| Daily capture | Evening review of 3–6 activities, plus quick-add anytime | ADOPT | Close to Kahneman's Day Reconstruction Method: low effort, good for patterns |
| Random check-in pings | — | REJECT | Highest effort and needs push notifications (possible later as an opt-in) |
| Rating scales | Engagement 1–5, energy −2…+2, flow yes/no | ADOPT | Fast taps on a phone; v1's 0–10 and −5…+5 values are converted on import |
| No default ratings | Save stays disabled until engagement and energy are both chosen | ADOPT | A preset value nudges the answer (anchoring); two taps keep the data honest |
| Late logging | Any earlier day can be logged (e.g. yesterday, the next morning) | ADOPT | Evening reviews get missed; reconstructing the next morning still works |
| Entry detail | Where / with whom / using (AEIOU) are optional, behind one tap | ADOPT | Keeps a basic entry to about 15 seconds |
| Note ("What stood out?") | Directly under "What did you do?", always visible, optional, with a hint: why it felt the way it did | ADOPT | Owner's request: explain while it's fresh. The "why" is what reveals patterns later |
| Rating explanations | ⓘ next to Engagement and Energy opens a short explanation with examples | ADOPT | Owner's request: rate consistently. Engagement = attention; energy = how you came out of it |
| Ikigai | Both lenses: 4-circle map plus a daily "small joy" line | ADOPT | The Venn diagram is a 2014 Western adaptation; the Japanese sense is everyday |
| Designing Your Life tools | Health/Work/Play/Love gauges, Workview + Lifeview, Prototype tracker, AEIOU deep-dive | ADOPT | Completes the loop: notice → imagine → prototype |

## AI

| Area | Decision | Status | Why |
|---|---|---|---|
| How reviews reach an AI | Three ways, all from the phone with no server: generate in the app with your own API key; share or copy to an AI app; download a review file (.md). Replies from outside the app can be pasted back | ADOPT | Groq, OpenRouter, Gemini, Mistral, OpenAI and the Claude API all accepted direct browser calls in live checks on 2026-10-21 |
| Recommended in-app provider | Groq free tier (no card; says it does not train on or keep request data by default) | WATCH | Free tiers and model lists change; Groq's model list changed in 2026 |
| Other in-app providers | OpenRouter (free models), Gemini (free tier may be used to improve Google products: shown as a warning), Claude API and OpenAI (paid, opt-in), custom OpenAI-compatible URL | ADOPT | Choice stays with the owner |
| Server-side AI (Cloudflare Workers AI) | — | REJECT | Needs an extra service; its API rejects browser calls |
| GitHub Models | — | REJECT | Retired on 30 July 2026 |
| On-device AI in the browser | — | REJECT | Only 1–3B models fit on an iPhone; insights too shallow |
| Review schedule | Weekly (default), monthly or every N days, plus "Review now" for any period. Set in More → Reminders; the Review screen uses the same setting | ADOPT | Owner's request; one setting, so the reminder and the review always agree |
| Review style | Auto: mirror (observations + questions) under 21 days, coach (conclusions + experiments) at 21 days or more; changeable per review | ADOPT | Over-automated reflection weakens your own insight (Reflective Agency, AIES 2025) |

## Data and privacy

| Area | Decision | Status | Why |
|---|---|---|---|
| Where data lives | Phone only (IndexedDB). No cloud backup or sync | ADOPT | Owner's decision |
| Backup safety | Ask iOS for persistent storage and show the result; export nudge after 7 days and in every review; urgent prompt if a save fails; optional passphrase lock on exports | ADOPT | Safari can't report the phone's free space, and clean-up of website data is silent |
| Persistent storage granted on iPhone | iOS grants it: "Protected from automatic clean-up: Yes" | ADOPT | Confirmed on the owner's iPhone (Phase 1) |
| "Warn when phone storage is low" | — | REJECT | Not possible from a web app |
| Encrypted cloud backup or sync; Google Sheets backup | — | REJECT | Owner chose phone-only |
| AI API key | Stored only on the phone; never exported, logged or committed | ADOPT | Keeps the key private |
| Saving backup files | One "Save to Files…" button (the share menu: Files, AirDrop, WhatsApp…). The file is prepared when the dialog opens, so it's one tap; a password adds one "Protect the file" step | ADOPT | Owner found the old two-step flow confusing |
| "Download" link inside the iPhone app | — | REJECT | In Home Screen apps, downloads open a viewer that can strand the app and save files wrongly (named "unknown"); kept only for browsers without a share menu |
| Restore errors | Name the exact problem (empty, web page, spreadsheet export, calendar file, damaged, damaged password-protected file, other app's file) plus the file name and size | ADOPT | So any failed restore can be diagnosed from one message |
| Password-protected backup restore on iPhone | Works (confirmed on the owner's iPhone with v0.2.2). One earlier failure was never explained; the precise error messages stay so any repeat can be diagnosed | ADOPT | Confirmed on the owner's iPhone |

## Platform

| Area | Decision | Status | Why |
|---|---|---|---|
| Hosting | GitHub Pages from this public repo, built and deployed by GitHub Actions | ADOPT | Free; no server needed |
| Cloudflare Workers | — | REJECT | An extra service that isn't needed |
| Reminder wording | A summary spells out every reminder in plain words plus the date range (e.g. "Daily log: Every day at 21:00 · From 21 Oct 2026 to 21 Oct 2027") | ADOPT | Owner couldn't tell what the calendar entry would be |
| Reminders | More → Reminders: daily log, review (incl. AI review), backup and quarterly check-in, each with a switch, its own time and pattern; one date range for all (default: one year from today; quick picks 3/6/12 months or no end). "Get calendar file…" sends one .ics with all of them through the share menu: Mail to yourself, AirDrop to a Mac, or Save to Files. Reminders-app steps as a fallback | ADOPT | iPhone only adds calendar files from Safari or Mail, not from a Home Screen app. Confirmed working on the owner's iPhone |
| "Add to Calendar" link to a calendar file inside the app | — | REJECT | On the owner's iPhone it left the Home Screen app on a blank screen with no way back. Home Screen apps keep all navigation inside the app, and that view can't hand files to Calendar. An e2e test now fails if any link points at a file |
| Web Push via a scheduler | — | REJECT | Needs a server; GitHub's scheduler can run late and stops after 60 days without repo activity |
| Stack | Vite 8, React 19, TypeScript 7, vite-plugin-pwa 2, Dexie 4; hash routes; Vitest and Playwright (WebKit) | ADOPT | Maintained PWA tooling; routes never 404 on Pages |
| Local Node | Node 22 LTS (Vite needs 22.12 or newer) | ADOPT | Same major as before on the owner's Mac |

## Review and Insights (Phase 2)

| Area | Decision | Status | Why |
|---|---|---|---|
| Review steps | 1 At a glance (numbers, energy and engagement charts, high and low points, small joys) → 2 Balance (Health, Work, Play, Love, 0–10) → 3 Best and worst moments with AEIOU → 4 Your reflection first, then one takeaway → 5 Finish (with a backup nudge if the last backup is 7+ days old) | ADOPT | Designing Your Life's weekly reflection. The AI step slots in after the reflection in Phase 4; prototype updates arrive with Phase 3's prototype tracker |
| Review period | Default: since the last review; otherwise one schedule length back, never before logging began. Can be changed to 7, 14 or 30 days, or custom dates | ADOPT | Each review covers exactly the days not yet reviewed |
| Review due | The first scheduled day after the last review's period (or after logging began); a notice on Today and the Review tab | ADOPT | No background notifications in a PWA, so the app tells you when you open it; the calendar reminder covers the rest |
| Drafts | A review saves as you go; it can be continued or discarded later | ADOPT | Reviews take about 10 minutes and get interrupted |
| Best and worst moments | Pre-selected (most and least energy, then engagement), changeable; AEIOU pre-filled from the entry's where, with whom and using | ADOPT | Saves typing; you correct rather than start from blank |
| High and low points in the review | One line per activity with how often it happened, ranked by its strongest moment | ADOPT | The same activity three times in a row told you nothing new |
| Insights period | One filter (7 / 30 / 90 days / all, default 30) above everything; every number and chart follows it | ADOPT | Numbers always agree with each other (dataviz rule) |
| Minimum count | Activities, places, people and so on are ranked only after 3+ entries; every average shows its count | ADOPT | One or two entries are anecdotes, not patterns |
| Charts | Energy: columns above or below zero; engagement: its own chart (never a second scale on the same chart); tap a column for its value; every chart has a table view | ADOPT | Dataviz rules: one axis per chart, tooltips never the only way to read a value |
| Energy colours | Blue = gives energy, red = drains, everywhere (charts, badges, rating buttons); engagement = aqua | ADOPT | Green/red is unreadable with red-green colour blindness; blue/red is the validated diverging pair. Aqua passed the checks with a colour-blind and contrast warning, covered by chart titles, axis labels, readout and table |
| Orange for engagement | — | REJECT | Failed the validator next to red (ΔE 7.1; the minimum is 15) |
| Violet for engagement | — | REJECT | Failed the validator next to blue |
| What I'm learning | Review takeaways collected in Insights (moved forward from Phase 3; Phase 3 adds pinning and your own notes) | ADOPT | Reviews needed somewhere for their takeaway to land |
| Backup format | Version 2 adds reviews. Version 1 files still restore; older app versions refuse version 2 files instead of silently dropping reviews | ADOPT | Safe in both directions |
| Database upgrade | Schema version 2 adds the reviews table; existing data carries over (tested by upgrading a real Phase 1 database) | ADOPT | No data loss on update |

## To prove on a real iPhone

| Item | Phase | Status |
|---|---|---|
| Add to Home Screen, open offline | 0–1 | ADOPT (confirmed) |
| Export via share sheet → Save to Files, then re-import | 1 | ADOPT (confirmed) |
| Reminders calendar file reaches Calendar via Mail, AirDrop to Mac, or Files | 1 | ADOPT (confirmed) |
| Share to the Claude app; attach a downloaded review file | 4 | TEST |

## Corrections to the earlier v1 notes

- The v1 code in the notes was corrupted when copied, so it is used as a spec only.
- "Jot" and "SelfTrack" could not be verified, so they were dropped from the comparison.
- The old v4 "built-in Claude API" is now optional, through your own key; the Claude API is paid.
- The old v3 "Google Sheets auto-backup" is rejected (phone-only data).
- GitHub Pages is kept, now with a build-and-deploy workflow.
