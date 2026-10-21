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
| Rating scales | Engagement 1–5, energy −2…+2, flow yes/no, asked in plain words with every answer worded (see Phase 2.5) | ADOPT | Fast taps on a phone; v1's 0–10 and −5…+5 values are converted on import |
| No default ratings | No answer is preselected; each question waits for a tap | ADOPT | A preset value nudges the answer (anchoring) |
| Late logging | Any earlier day can be logged (e.g. yesterday, the next morning) | ADOPT | Evening reviews get missed; reconstructing the next morning still works |
| Entry detail | Where / with whom / using (AEIOU) are optional, behind one tap on the last screen | ADOPT | Keeps a basic entry to about 15 seconds |
| Note | Asked right after the two ratings, worded from them ("What took your energy?", "What gave you energy?", "What kept you into it?", otherwise "Anything that stood out?"), optional | ADOPT | Phase 2.5: the why now follows the how, one screen after naming the activity. Before (Phase 1, owner's request) it sat under "What did you do?"; the aim, explaining while it's fresh, is kept |
| Rating explanations | ⓘ next to both questions opens a short explanation | ADOPT | Owner's request: rate consistently. Engagement = attention; energy = how you came out of it |
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
| Review steps | 1 At a glance (numbers, energy and engagement charts, high and low points, small joys) → 2 Balance (Health, Work, Play, Love, 0–10) → 3 Best and worst moments, one question each (AEIOU behind "Zoom in" since Phase 2.5) → 4 Your reflection first, then one takeaway → 5 Finish (with a backup nudge if the last backup is 7+ days old) | ADOPT | Designing Your Life's weekly reflection. The AI step slots in after the reflection in Phase 4; prototype updates arrive with Phase 3's prototype tracker |
| Review period | Default: since the last review; otherwise one schedule length back, never before logging began. Can be changed to 7, 14 or 30 days, or custom dates | ADOPT | Each review covers exactly the days not yet reviewed |
| Review due | The first scheduled day after the last review's period (or after logging began); a notice on Today and the Review tab | ADOPT | No background notifications in a PWA, so the app tells you when you open it; the calendar reminder covers the rest |
| Drafts | A review saves as you go; it can be continued or discarded later | ADOPT | Reviews take about 10 minutes and get interrupted |
| Best and worst moments | Pre-selected (most and least energy, then engagement), changeable; AEIOU pre-filled from the entry's where, with whom and using | ADOPT | Saves typing; you correct rather than start from blank |
| High and low points in the review | One line per activity with how often it happened, ranked by its strongest moment | ADOPT | The same activity three times in a row told you nothing new |
| Insights period | One filter (7 / 30 / 90 days / all, default 30) above everything; every number and chart follows it | ADOPT | Numbers always agree with each other (dataviz rule) |
| Minimum count | Activities, places, people and so on are ranked only after 3+ entries; every average shows its count | ADOPT | One or two entries are anecdotes, not patterns |
| Charts | Energy: columns above or below zero; how into it (engagement): its own chart, shown one at a time with an Energy / Into it switch since Phase 2.5 (never a second scale on the same chart); tap a column for its value; every chart has a table view | ADOPT | Dataviz rules: one axis per chart, tooltips never the only way to read a value |
| Energy colours | Blue = gives energy, red = drains, everywhere (charts, badges, rating buttons); engagement = aqua | ADOPT | Green/red is unreadable with red-green colour blindness; blue/red is the validated diverging pair. Aqua passed the checks with a colour-blind and contrast warning, covered by chart titles, axis labels, readout and table |
| Orange for engagement | — | REJECT | Failed the validator next to red (ΔE 7.1; the minimum is 15) |
| Violet for engagement | — | REJECT | Failed the validator next to blue |
| What I'm learning | Review takeaways collected in Insights (moved forward from Phase 3; Phase 3 adds pinning and your own notes) | ADOPT | Reviews needed somewhere for their takeaway to land |
| Backup format | Version 2 adds reviews. Version 1 files still restore; older app versions refuse version 2 files instead of silently dropping reviews | ADOPT | Safe in both directions |
| Database upgrade | Schema version 2 adds the reviews table; existing data carries over (tested by upgrading a real Phase 1 database) | ADOPT | No data loss on update |

## Natural questions and a calmer app (Phase 2.5)

Owner feedback after Phase 2: logging felt like filling in a form, "Engagement" and "Energy" with number buttons didn't draw out a real answer, journaling serves different purposes, and the app felt wordy.

| Area | Decision | Status | Why |
|---|---|---|---|
| Measured questions | "Did it give you energy, or take it?" (Took a lot · Took a little · Neither · Gave a little · Gave a lot); "How into it were you?" (Not at all · A little · Somewhat · Very · Fully); "Did time fly?" only after Very or Fully. Same stored values as before | ADOPT | Fully worded scales are answered more reliably than numbered ones (Alwin 2007; Saris & Gallhofer 2007). Wording stays fixed so days compare (ESM-Q, 2025). Matches the Good Time Journal's own engagement / energy / "time flew" |
| Logging flow | One question per screen; tapping an answer moves on; a recent activity is one tap; editing shows every answer on one screen | TEST | One question per page works best on phones (GOV.UK, NHS design systems). Owner's choice |
| Tap guard | A question that replaces another ignores taps for 300 ms (answers marked aria-disabled), so a fast double tap can't answer it | ADOPT | The "nothing moves under the finger" rule |
| Today's list | Energy as ▲▲ ▲ – ▼ ▼▼ in blue or red, how into it as five dots, ✦ when time flew; VoiceOver hears words. The answers show the same signs | ADOPT | Same information with fewer numbers; the signs explain themselves where you answer |
| Evening card | The small joy stays every day, plus one optional question that changes each evening and can be swapped (↻ Another) until it's answered | TEST | Owner's choice. Variety goes where it helps reflection, not into the measured questions |
| Purposes | Know myself and joy always; Feel calmer, Grow, Reach a goal and Learn can be switched off (all on). The goal is set in More → Evening question; goal questions wait until it is | ADOPT | Owner's choice. Methods: naming feelings (Lieberman 2007) and expressive writing; After Action Review; Progress Principle (Amabile & Kramer) and if-then plans (Gollwitzer & Sheeran 2006); What? So what? Now what? (Rolfe 2001); Three Good Things (Seligman et al. 2005) |
| Questions from your own days | About every third evening: a pattern from the previous two weeks (what drained you, what gave you energy, when time flew, a balance area at 4/10 or lower). Worked out on the phone, no AI; not asked again within 14 days of answering | ADOPT | A question about your own life draws out a real answer; nothing leaves the phone |
| Evening answers data | Stored with the question asked (database version 3, backup format version 3). Each review moment gains a "why" | ADOPT | Old backups still restore (reviews get an empty "why"); older app versions refuse version 3 files |
| Review moments | One question per moment ("What made it so good?" / "What made it so draining?"); AEIOU behind "Zoom in", pre-filled as before | ADOPT | Ten text boxes felt like a form |
| More | A short list; each setting on its own page (#/more/reminders, …) | ADOPT | More was 460 words long |
| Word budgets | An e2e test counts the visible words on each main screen and fails above its budget. v0.3.0 → v0.4.0: Today 96 → 55, New activity 90 (one sheet) → 25 at most per screen, Review home 47 → 15, review moments 255 → 61, Insights 236 → 126, More 460 → 45, Reminders 266 → 122 | ADOPT | Owner: "the app feels wordy". The test stops clutter creeping back |
| Chatbot-style logging | — | REJECT | Mixed evidence (Xiao et al. 2020 found richer answers; a KU Leuven longitudinal study found no gain). Calm question screens give the same feel |
| Rotating the wording of the measured questions | — | REJECT | Changing an item's wording makes days incomparable |
| One-tap two-way grid (Affect Grid) | — | REJECT | Coarse, and has to be learned |
| UI kit (Konsta UI) | — | REJECT | Needs Tailwind and a restyle of every screen; a few dozen lines of CSS do the job |
| Open journaling-prompt archive (CC BY-SA) | — | REJECT | Share-alike would bind this repo's licence; no other open prompt set found, so prompts are written from the methods above |

## To prove on a real iPhone

| Item | Phase | Status |
|---|---|---|
| Add to Home Screen, open offline | 0–1 | ADOPT (confirmed) |
| Export via share sheet → Save to Files, then re-import | 1 | ADOPT (confirmed) |
| Reminders calendar file reaches Calendar via Mail, AirDrop to Mac, or Files | 1 | ADOPT (confirmed) |
| A review end to end; Insights; data kept through the update to v0.3 | 2 | TEST |
| Logging one question at a time feels quick; the double-tap guard never gets in the way | 2.5 | TEST |
| Evening question: answers save, ↻ Another, goal questions after setting a goal; data kept through the update to v0.4 | 2.5 | TEST |
| Share to the Claude app; attach a downloaded review file | 4 | TEST |

## Corrections to the earlier v1 notes

- The v1 code in the notes was corrupted when copied, so it is used as a spec only.
- "Jot" and "SelfTrack" could not be verified, so they were dropped from the comparison.
- The old v4 "built-in Claude API" is now optional, through your own key; the Claude API is paid.
- The old v3 "Google Sheets auto-backup" is rejected (phone-only data).
- GitHub Pages is kept, now with a build-and-deploy workflow.
