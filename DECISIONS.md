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
| Review schedule | Weekly (default), monthly or every N days, plus "Review now" for any period | ADOPT | Owner's request |
| Review style | Auto: mirror (observations + questions) under 21 days, coach (conclusions + experiments) at 21 days or more; changeable per review | ADOPT | Over-automated reflection weakens your own insight (Reflective Agency, AIES 2025) |

## Data and privacy

| Area | Decision | Status | Why |
|---|---|---|---|
| Where data lives | Phone only (IndexedDB). No cloud backup or sync | ADOPT | Owner's decision |
| Backup safety | Ask iOS for persistent storage and show the result; export nudge after 7 days and in every review; urgent prompt if a save fails; optional passphrase lock on exports | ADOPT | Safari can't report the phone's free space, and clean-up of website data is silent |
| Persistent storage granted on iPhone | — | TEST | Proven in phase 1 |
| "Warn when phone storage is low" | — | REJECT | Not possible from a web app |
| Encrypted cloud backup or sync; Google Sheets backup | — | REJECT | Owner chose phone-only |
| AI API key | Stored only on the phone; never exported, logged or committed | ADOPT | Keeps the key private |
| Saving backup files | One "Save to Files…" button (the share menu: Files, AirDrop, WhatsApp…). The file is prepared when the dialog opens, so it's one tap; a password adds one "Protect the file" step | ADOPT | Owner found the old two-step flow confusing |
| "Download" link inside the iPhone app | — | REJECT | In Home Screen apps, downloads open a viewer that can strand the app and save files wrongly (named "unknown"); kept only for browsers without a share menu |
| Restore errors | Name the exact problem (empty, web page, spreadsheet export, calendar file, damaged, damaged password-protected file, other app's file) plus the file name and size | ADOPT | So any failed restore can be diagnosed from one message |
| Password-protected backup restore on iPhone | Failed once with "This file isn't a Life Design backup" although the file looked right; the same flow passes in Safari's engine, including emoji, curly quotes and the share path | WATCH | Not reproduced. The new precise errors will show the cause if it happens again |

## Platform

| Area | Decision | Status | Why |
|---|---|---|---|
| Hosting | GitHub Pages from this public repo, built and deployed by GitHub Actions | ADOPT | Free; no server needed |
| Cloudflare Workers | — | REJECT | An extra service that isn't needed |
| Reminder wording | The screen spells out the schedule: every day at the chosen time, no end date, a 10-minute event with an alert, and how to change it | ADOPT | Owner couldn't tell what "Add to Calendar" would create |
| Reminders | iPhone Calendar alerts. "Add to Calendar" opens a pre-built .ics file served by the website (one per 15-minute slot); fallbacks: a calendar file made on the phone and saved via the share sheet, or Reminders app steps | TEST | Calendar files generated inside Home Screen apps are reported to fail silently on iPhone; real files served as text/calendar open reliably in Safari. Proven on the owner's iPhone in phase 1 |
| Web Push via a scheduler | — | REJECT | Needs a server; GitHub's scheduler can run late and stops after 60 days without repo activity |
| Stack | Vite 8, React 19, TypeScript 7, vite-plugin-pwa 2, Dexie 4; hash routes; Vitest and Playwright (WebKit) | ADOPT | Maintained PWA tooling; routes never 404 on Pages |
| Local Node | Node 22 LTS (Vite needs 22.12 or newer) | ADOPT | Same major as before on the owner's Mac |

## To prove on a real iPhone

| Item | Phase | Status |
|---|---|---|
| Add to Home Screen, open offline | 0–1 | TEST |
| Export via share sheet → Save to Files, then re-import | 1 | TEST |
| Calendar alerts from the .ics file | 1 | TEST |
| Share to the Claude app; attach a downloaded review file | 4 | TEST |

## Corrections to the earlier v1 notes

- The v1 code in the notes was corrupted when copied, so it is used as a spec only.
- "Jot" and "SelfTrack" could not be verified, so they were dropped from the comparison.
- The old v4 "built-in Claude API" is now optional, through your own key; the Claude API is paid.
- The old v3 "Google Sheets auto-backup" is rejected (phone-only data).
- GitHub Pages is kept, now with a build-and-deploy workflow.
