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
| Daily capture | Evening review of the day's main activities (an empty day says "Start with one thing you did"; 3–6 is typical), plus quick-add anytime | ADOPT | Close to Kahneman's Day Reconstruction Method: low effort, good for patterns |
| Random check-in pings | — | REJECT | Highest effort and needs push notifications (possible later as an opt-in) |
| Rating scales | None since Phase 2.6. Engagement 1–5, energy −2…+2 and flow are worked out on the phone from the feeling words chosen, stored for analysis, never shown (see Phase 2.6) | ADOPT | Owner: no ratings, natural responses. v1's 0–10 and −5…+5 values are still converted on import |
| Nothing preselected | No feeling word is preselected; each word question waits for a tap | ADOPT | A preset answer nudges the answer (anchoring) |
| Late logging | Any earlier day can be logged (e.g. yesterday, the next morning) | ADOPT | Evening reviews get missed; reconstructing the next morning still works |
| Entry detail | Where / with whom / using (AEIOU) are optional, behind one tap on the last screen | ADOPT | Keeps a basic entry to about 15 seconds |
| Note | "What else would you like to record?", the last step, after the questions for your purpose (v0.8). Before v0.8 it was worded from the two feeling-word questions ("What took your energy?"…) | ADOPT | Owner's brief (2026-10-22): free notes with every entry; the why now comes from the purpose questions |
| Question explanations | ⓘ next to each activity question explains what it asks (attention while doing it; what it did to your energy; how you felt) | ADOPT | Owner's request (Phase 1): answer consistently |
| Ikigai | Both lenses: 4-circle map plus a daily "small joy" line | ADOPT (the daily small joy) · REJECT (the 4-circle map: parked with Phase 3b, 2026-10-22) | The Venn diagram is a 2014 Western adaptation; the Japanese sense is everyday |
| Designing Your Life tools | Health/Work/Play/Love balance (most alive, most neglected), Workview + Lifeview, Prototype tracker, AEIOU deep-dive | REJECT (v0.8, except the Good Time Journal questions and AEIOU details; data kept) | Completes the loop: notice → imagine → prototype |

## AI

| Area | Decision | Status | Why |
|---|---|---|---|
| How reviews reach an AI | Three ways, all from the phone with no server: generate in the app with your own API key; share or copy to an AI app; download a review file (.md). Replies from outside the app can be pasted back | ADOPT | Groq, OpenRouter, Gemini, Mistral, OpenAI and the Claude API all accepted direct browser calls in live checks on 2026-10-21 |
| Recommended in-app provider | Groq free tier (no card; says it does not train on or keep request data by default) | WATCH | Free tiers and model lists change; Groq's model list changed in 2026 |
| Other in-app providers | OpenRouter (free models), Gemini (free tier may be used to improve Google products: shown as a warning), Claude API and OpenAI (paid, opt-in), custom OpenAI-compatible URL | ADOPT | Choice stays with the owner |
| Server-side AI (Cloudflare Workers AI) | — | REJECT | Needs an extra service; its API rejects browser calls |
| GitHub Models | — | REJECT | Retired on 30 July 2026 |
| On-device AI in the browser | — | REJECT | Only 1–3B models fit on an iPhone; insights too shallow |
| Look back reminder | Weekly (default), monthly or every N days, set in More → Reminders; it opens Insights, where the week is put together for you (v0.8). "Review now" went with the Review tab | ADOPT | Owner, 2026-10-22: reviews should happen automatically, not as a manual chore |
| Review style | Auto: mirror (observations + questions) under 21 days, coach (conclusions + experiments) at 21 days or more; changeable per review | REJECT (v0.8: the manual review is gone; mirror and coach styles return with optional AI, Phase 5) | Over-automated reflection weakens your own insight (Reflective Agency, AIES 2025) |

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
| Sheets and the iPhone keyboard | Every sheet sits on top of the keyboard: `useKeyboardInset` follows `window.visualViewport` and lifts the sheet by the part the keyboard covers, caps its height to what's left, and keeps the focused field in sight. The keyboard still opens straight away on "What did you do?" | TEST | v0.6: the keyboard covered "What did you do?". iOS shrinks only the visible area for the keyboard, never the page, and Safari doesn't support `interactive-widget=resizes-content`. An e2e test fakes the keyboard |
| The page behind a sheet | Locked while any sheet is open: the body is fixed in place at the same spot and the scroll position put back on close (`useScrollLock`); the sheet's own scroll stays inside it (`overscroll-behavior: contain`) | TEST | v0.7 on the iPhone: scrolling in "New activity" scrolled the screen behind it. `showModal()` blocks taps, not scrolling, and `overflow: hidden` isn't reliable on iOS. An e2e test guards it |
| A drawer library for sheets (e.g. react-bottom-fixed, drawer components) | — | REJECT | react-bottom-fixed (v0.1.0) handles fixed buttons, not sheets; a drawer library would replace the native `<dialog>` and its tested focus, Escape and VoiceOver handling. A 30-line hook does the job |

## Review and Insights (Phase 2)

The manual review was removed on 2026-10-22 (owner: "Review or insights should be done automatically by app or by AI but not manually"). Past reviews stay in storage and backups; their takeaways still show in Insights → What I'm learning.

| Area | Decision | Status | Why |
|---|---|---|---|
| Review steps | 1 At a glance (counts, energy and into-it charts in words, high and low points, small joys, evening answers) → 2 Balance: most alive and most neglected, plus why (Phase 2.6; was 0–10) → 3 Best and worst moments, one question each (AEIOU behind "Zoom in" since Phase 2.5) → 4 Your reflection first, then one takeaway → 5 Finish (with a backup nudge if the last backup is 7+ days old) | REJECT (removed in v0.8) | Designing Your Life's weekly reflection. The AI step slots in after the reflection in Phase 4; prototype updates arrive with Phase 3's prototype tracker |
| Review period | Default: since the last review; otherwise one schedule length back, never before logging began. Can be changed to 7, 14 or 30 days, or custom dates | REJECT (removed in v0.8) | Each review covers exactly the days not yet reviewed |
| Review due | The first scheduled day after the last review's period (or after logging began); a notice on Today and the Review tab | REJECT (removed in v0.8) | No background notifications in a PWA, so the app tells you when you open it; the calendar reminder covers the rest |
| Drafts | A review saves as you go; it can be continued or discarded later | REJECT (removed in v0.8) | Reviews take about 10 minutes and get interrupted |
| Best and worst moments | Pre-selected (most and least energy, then engagement), changeable; AEIOU pre-filled from the entry's where, with whom and using | REJECT (removed in v0.8) | Saves typing; you correct rather than start from blank |
| High and low points in the review | One line per activity with how often it happened, ranked by its strongest moment | REJECT (removed in v0.8) | The same activity three times in a row told you nothing new |
| Insights period | One filter (7 / 30 / 90 days / all, default 30) above everything; every number and chart follows it | ADOPT | Numbers always agree with each other (dataviz rule) |
| Minimum count | Activities, places, people and so on are ranked only after 3+ entries; every result says how many times | ADOPT | One or two entries are anecdotes, not patterns |
| Charts | Energy: columns above or below zero; how into it: its own chart, one at a time with an Energy / Into it switch (never a second scale on one chart). Since Phase 2.6 the axes, readout and table speak in words ("gives / takes", "mostly energising") | ADOPT | Dataviz rules: one axis per chart, a readout and table view, never colour alone |
| Energy colours | Blue = gives energy, red = drains: in charts, and since v0.7 as the thin edge beside each activity (the feeling words stay in ink); engagement = aqua | ADOPT | Green/red is unreadable with red-green colour blindness; blue/red is the validated diverging pair. Aqua passed the checks with a colour-blind and contrast warning, covered by chart titles, axis labels, readout and table |
| Orange for engagement | — | REJECT | Failed the validator next to red (ΔE 7.1; the minimum is 15) |
| Violet for engagement | — | REJECT | Failed the validator next to blue |
| What I'm learning | Review takeaways collected in Insights (moved forward from Phase 3; Phase 3 adds pinning and your own notes) | ADOPT | Reviews needed somewhere for their takeaway to land |
| Backup format | Version 2 adds reviews. Version 1 files still restore; older app versions refuse version 2 files instead of silently dropping reviews | ADOPT | Safe in both directions |
| Database upgrade | Schema version 2 adds the reviews table; existing data carries over (tested by upgrading a real Phase 1 database) | ADOPT | No data loss on update |

## Natural questions and a calmer app (Phase 2.5)

Owner feedback after Phase 2: logging felt like filling in a form, "Engagement" and "Energy" with number buttons didn't draw out a real answer, journaling serves different purposes, and the app felt wordy.

| Area | Decision | Status | Why |
|---|---|---|---|
| Measured questions (worded scales) | "Did it give you energy, or take it?" (Took a lot … Gave a lot) and "How into it were you?" (Not at all … Fully) | REJECT | Replaced in Phase 2.6: even worded scales are ratings; the owner wants natural responses |
| Logging flow | One question per screen: what you did → what it was like → what it did to your energy → how you felt → a question for your purpose → anything else (v0.8; before, two word questions). Every step after the first can be skipped; a recent activity is one tap; an entry is a draft until saved; editing shows everything on one screen | TEST | One question per page works best on phones (GOV.UK, NHS design systems). Owner's choice, and the owner's brief (2026-10-22) |
| Tap guard | A question that replaces another ignores taps for 300 ms (answers marked aria-disabled), so a fast double tap can't answer it | ADOPT | The "nothing moves under the finger" rule |
| Today's list as signs | ▲▲ ▲ – ▼ ▼▼ and five dots | REJECT | Replaced in Phase 2.6: rows show the feeling words themselves ("absorbed · time flew · energised") |
| Evening card | The small joy stays every day, plus one optional question that changes each evening and can be swapped (↻ Another) until it's answered | TEST | Owner's choice. Variety goes where it helps reflection, not into the measured questions |
| Purposes | One primary purpose of seven (v0.8: Understand myself · Improve myself · Learn something · Achieve a goal · Make sense of a hard time · Reflect on everyday life · Write freely), chosen on the welcome or in More → Your purpose, with an optional follow-up; each entry can use another. The evening question takes turns between Understand myself, your purpose and Everyday life; until a purpose is chosen it keeps the earlier four-purpose turns | ADOPT | Owner's brief (2026-10-22). Methods: naming feelings (Lieberman 2007) and expressive writing; After Action Review; Progress Principle and if-then plans; What? So what? Now what? |
| Questions from your own days | About every third evening: a pattern from the previous two weeks (what drained you, what gave you energy, when time flew, an area felt neglected in 2+ recent reviews). Worked out on the phone, no AI; not asked again within 14 days of answering | ADOPT | A question about your own life draws out a real answer; nothing leaves the phone |
| Evening answers data | Stored with the question asked (database version 3, backup format version 3). Each review moment gains a "why" | ADOPT | Old backups still restore (reviews get an empty "why"); older app versions refuse version 3 files |
| Review moments | One question per moment ("What made it so good?" / "What made it so draining?"); AEIOU behind "Zoom in", pre-filled as before | REJECT (removed in v0.8) | Ten text boxes felt like a form |
| More | A short list; each setting on its own page (#/more/reminders, …) | ADOPT | More was 460 words long |
| Word budgets | An e2e test counts the visible words on each main screen and fails above its budget. v0.3.0 → v0.4.0: Today 96 → 60 at most (on an evening with the longest kind of question), New activity 90 (one sheet) → 25 at most per screen, Review home 47 → 15, review moments 255 → 61, Insights 236 → 126, More 460 → 45, Reminders 266 → 122 | ADOPT | Owner: "the app feels wordy". The test stops clutter creeping back |
| Chatbot-style logging | — | REJECT | Mixed evidence (Xiao et al. 2020 found richer answers; a KU Leuven longitudinal study found no gain). Calm question screens give the same feel |
| Rotating the wording of the measured questions | — | REJECT | Changing an item's wording makes days incomparable |
| One-tap two-way grid (Affect Grid) | — | REJECT | Coarse, and has to be learned |
| UI kit (Konsta UI) | — | REJECT | Needs Tailwind and a restyle of every screen; a few dozen lines of CSS do the job |
| Open journaling-prompt archive (CC BY-SA) | — | REJECT | Share-alike would bind this repo's licence; no other open prompt set found, so prompts are written from the methods above |

## Natural responses, no ratings (Phase 2.6)

Owner feedback on v0.4.0: "I don't want any rating to be given (no numbers); it should all be assessed with natural response", and look at what users of other journaling apps value and complain about.

| Area | Decision | Status | Why |
|---|---|---|---|
| Describing an activity | Since v0.8, three questions, each skippable: "What was it like?" (Absorbed · Focused · Curious · Challenged · Time flew · Fine · Distracted · Restless · Bored), "What did it do to your energy?" (It gave me energy · It used up my energy · Little difference · A mix of both) and "How did you feel?" (Calm · Happy · Fulfilled · Connected · Inspired · Proud · Neutral · Tired · Frustrated · Anxious · Stressed · Sad), with your own words. Words from "How did it leave you?" (v0.5–v0.7) still read and count | TEST | Owner's brief (2026-10-22): energy as plain choices, feelings as words, nothing forced. Users want their own emotion words but a list helps (JMIR 2020) |
| Working it out | On the phone (`src/domain/feelings.ts`): how into it = average of the words; energy = the energy answer (gave +2, used up −2, otherwise 0), or the feeling words if that was skipped; time flew = "Time flew". A skipped question is recorded as skipped and left out of Insights, never guessed. Stored for analysis, never shown | ADOPT | Keeps every pattern working with no AI; "do not invent missing information" (owner's brief) |
| Your own words | Words for "What was it like?" get one plain question ("Were you into it?"); feeling words are added straight away, as energy has its own question (v0.8). Offered again next time (up to 6 per question), removable in More → Your feeling words | ADOPT | Users want their own emotion words (JMIR 2020: flexibility, 20% of reviews) |
| Words in your writing | Your note and answers are read for feelings they mention ("wiped out" → tired, "lost track of time" → time flew), skipping negations ("not bored"), offered as tap-to-add suggestions | ADOPT | Lets you answer in your own words; it suggests, you decide |
| Results in words | "Gives you energy: Deep work, usually · 5 times"; tiles "Logged on 5 days", "Mostly energising / draining / Mixed"; charts read in words. Counts stay; no "of 30" | ADOPT | Owner's choice ("words everywhere"); "5 of 30" read like failing (streak-anxiety findings) |
| Balance | "Which part of life feels most alive right now?" and "Which feels most neglected?" (one area each, not both), plus why. Insights and pattern questions tally them; older 0–10 reviews count by their highest and lowest | ADOPT | Owner's choice; captures what the Designing Your Life dashboard is for (imbalance) without a scale |
| Guard | `no-scores.spec.ts` fails if a score pattern appears on the main screens | ADOPT | Stops ratings creeping back |
| Data | Entries gain the words chosen; reviews gain alive / neglected / why. Database version 4 fills the new fields on existing records (a change from the plan, which had no database bump: it guarantees every record has them); backup format unchanged, older files restore with the fields filled in | ADOPT | Nothing lost in either direction |
| Word budgets | The two word screens fit the existing 25 words (22 and 25 measured), so the planned raise to 30 wasn't needed. Today 60 at most | ADOPT | Kept strict |
| Asking the AI to read every entry | — | REJECT | Each entry would leave the phone as you save it; breaks the founding privacy rule |
| On-device emotion model | — | REJECT | 67–124 MB download, uncertain on iPhone Safari, and it reads emotions, not energy or attention |

### What other apps teach (market research, 2026-10-21)

Most valued: quick logging; your own words alongside a word list; patterns that link mood to activities; looking back at old entries; free, reliable, exportable, private; learning to name feelings; help acting on what you learn. Sources: JMIR mHealth 2020 (1,803 reviews of 53 mood apps), Caldeira et al. (32 mood apps), a 2026 analysis of low-star reviews of Day One, Journey, Reflectly, Stoic and Finch, App Store review summaries for Daylio, Apple Journal, How We Feel, Rosebud and Bearable, Mozilla's mental-health app privacy review, and 2026 AI-trust surveys.

| Idea | Status | Why |
|---|---|---|
| Looking back ("a month ago you wrote…") | TEST (later; Insights → Earlier weeks reopens past weeks since v0.8) | Day One's On This Day; rereading entries helps (JMIR 2020) |
| Small experiments from patterns (prototype tracker) | REJECT (parked with Phase 3b); a next step on each entry instead, followed up in the weekly review (v0.8) | Mood apps rarely help you act on what you learn (Caldeira et al.) |
| Readable export of the whole journal; shareable review summary | TEST (Phase 5) | Lock-in and missing export are common complaints; users value sharing with a clinician |
| Search across entries, answers and reviews | TEST (v0.8: Entries searches every word of an entry and its answers) | Apple Journal's most-cited gap |

**Never** (standing rules; check every new feature against them):

| Never | Why |
|---|---|
| Paywalls or subscriptions | The one complaint found for every major journaling app |
| Streaks, guilt or "x of 30" | Lost streaks and streak anxiety make people quit (Finch reviews, habit-app research) |
| Nagging notifications | Reflectly, Finch and Stoic reviews; reminders here are calendar alerts you set |
| Emoji moods | "Too generic to be meaningful" (depression-app review study) |
| Game loops (pets, points, energy meters) | "A mobile-game loop rather than self-care" (Finch reviews) |
| Anything leaving the phone without a tap | Mozilla flagged 29 of 32 mental-health apps; only 18% of people trust AI with their data (2026) |
| Data loss | Sync failures and data-loss scares are the most serious 1-star theme; every upgrade is tested on a real old database |
| Crowded screens or long setup | Bearable users felt overwhelmed; word budgets guard this |
| Repeating prompts | Reflectly's prompts "cycle back"; ours don't repeat within 30 days |

## Imagine: Odyssey Plans, Workview and Lifeview (Phase 3a)

Removed from the app on 2026-10-22 (owner: the Life Design tab was not useful). Plans, versions and Workview & Lifeview stay in storage and in backups. Phase 3b (prototypes, the Ikigai map) is parked on the `phase-3b-try` branch, never shipped.

Phase 3 ships in two parts (owner's choice): 3a "Imagine" now, 3b "Test and learn" (prototypes, Ikigai map, pinning, looking back, deep review) next.

| Area | Decision | Status | Why |
|---|---|---|---|
| Life Design tab | A short list of pages (Odyssey Plans, Workview & Lifeview), like More | REJECT (removed in v0.8; data kept) | Same calm pattern as More |
| Odyssey Plans | Three five-year lives: your current path; if that path vanished; if money and image didn't matter. Shown as three cards that double as the side-by-side comparison (title, feeling words, "Needs: money") | REJECT (removed in v0.8; data kept) | Designing Your Life's Odyssey Plans (UF/CMC worksheets, CreativeLive) |
| Writing a plan | First time: seven guided screens (what it's about, year by year, six-word title, questions it answers, how it feels, what it would take, does it fit), saved as you go and resumed where you left off. After that: one page, saved as you edit | REJECT (removed in v0.8; data kept) | One question per screen for first-time flows (Phase 2.5 rule); a plan is long to type on a phone, so nothing is lost if you stop |
| The plan "dashboard" | No gauges. Likeability and confidence: "How do you feel about this future?" (Excited · Curious · Hopeful · Confident · Calm · Unsure · Anxious · Scared · Trapped · Bored · own words). Resources: "What would it take?" (tap what's missing: time, money, skills, people, plus what exactly). Coherence: "Does it fit your Workview and Lifeview?" in your own words, with them shown alongside | REJECT (removed in v0.8; data kept) | Owner's choice; the no-ratings rule (Phase 2.6) |
| v1's 0–10 plan sliders and "out of 40" | Kept in storage from v1 files, never shown | REJECT (as a display) | Ratings; v1 plans keep their title, description and question |
| Workview & Lifeview | One page: "What is work for, to you?", "What is life for, to you?" (DYL prompts behind ⓘ; about 250 words each) and "Where do they agree, where do they clash, and does one drive the other?" | REJECT (removed in v0.8; data kept) | Designing Your Life (Aalto task sheet, UNMC handout) |
| Earlier versions | The first change made 7+ days after the last keeps the plan (or Workview & Lifeview) as it was, dated and read-only. No extra step | REJECT (removed in v0.8; data kept) | Shows how your futures and views shift over time; one constant (`VERSION_AFTER_DAYS`) to tune |
| Dedicated Odyssey / Ikigai apps | — | REJECT | None exist (only printable worksheets); a "Life Designer" Claude skill's Socratic dialogue is noted as an idea for Phase 4 |
| Data | Plans gain feelings, needs, what exactly, fit and writtenAt; new tables for earlier plan versions and Workview & Lifeview; database version 5, backup format 4 (older files still restore; v0.5 refuses v4 files instead of dropping them) | ADOPT | Nothing lost in either direction |

## An easier start (Phase 3a.5)

Owner's questions (2026-10-21): starting to journal is hard, so what would help a beginner? Should the app get a little colour while staying minimal, and can the layout improve? And the keyboard covered "What did you do?" (fixed in v0.6.1; see Platform).

| Area | Decision | Status | Why |
|---|---|---|---|
| Welcome | Only on a first open: the start page (a Home Screen launch or the bare address, never a link to a page), an empty journal, not welcomed yet. Three short screens: 1 what it's for, two example activities, "A few words is enough. Everything stays on this phone.", "Have a backup? Restore it"; 2 "What would you like it to help with?" (the seven purposes since v0.8; before, the Evening question switches); 3 "A nudge each evening?" (Set a reminder → More → Reminders). Skip on the first two (on the last, Start does the same). Finishing, skipping or restoring sets `welcomed` | TEST | Owner's choice. Beginners need the why and an example; journaling apps that ask what you want help with and offer a reminder up front keep people longer. Never a long setup |
| Sentence starters | "Need a start?" under an empty note or evening question: three openers that fit the question (by its purpose, or by how the activity left you). Tapping one types it in and opens the keyboard | TEST | Owner's choice. The blank page is the main beginner barrier (JED); openers appear only when asked for, so answers don't all sound alike |
| Gentle first steps | Empty day: "Start with one thing you did." After 3+ days without an entry: "Welcome back. Missed days don't matter: start with one thing you did." (`AWAY_DAYS`). Insights says when it fills in | TEST | Owner's choice. Missing a day doesn't derail a habit (Lally et al. 2010); no streaks or counts (see the never list) |
| Colour with meaning | A thin edge beside each activity and review moment: blue gave energy, red took it, none for neither. The feeling words are back in ink. The evening card and small joys are pale sand (`--evening-bg`). Text, muted text and links on the sand pass WCAG AA in light and dark; the edges pass 3:1 on both card surfaces | TEST | Owner's choice: a little colour, only where it means something. Red feeling words read like an error |
| Ink-only, or a colour per tab | — | REJECT | Owner's choice. A colour per tab carries no meaning and competes with the energy colours |
| Today's list | One rounded list with thin lines between activities, not a box each. "+ Reflect on an activity" is the one main button, with "Write freely" beside it (v0.8); the backup nudge keeps its filled button (losing data is the bigger risk) | TEST | Owner's choice; calmer, like iPhone Settings |
| Insights order | "Gives energy" and "Takes energy" first, then the summary tiles and the chart | TEST | Owner's choice: the words are what people look for |
| Titles | Page titles, card titles and questions in the iPhone's serif (New York, `ui-serif`); everything else unchanged | TEST | Owner's choice: reads like a journal, not a form |
| A tips page in More | — | REJECT | Owner's choice: the welcome, openers and empty states cover it |
| Word budgets | Today 60 → 63 for "Need a start?", then 72 in v0.8 (the test browser now shows the install notice, and Today has two ways in); the six activity steps 25–30 each; Your purpose 95 and the welcome's purpose step 105 (seven purposes, each explained); welcome 60 / 105 / 20 | ADOPT | Set from measurements, in owner-approved plans |

## Purpose-driven journaling (Phase 4)

The owner's brief (2026-10-22): help beginners record experiences, understand themselves, discover insights and apply them; remove the Life Design and Review tabs; reviews and insights happen automatically (by the app now, optional AI later). Owner's choices: the app does it without AI for now; tabs Today · Entries · Insights · More; six quick, skippable steps.

| Area | Decision | Status | Why |
|---|---|---|---|
| Tabs | Today · Entries · Insights · More. Review and Life Design are gone; their old links open Today | ADOPT | Owner, 2026-10-22 |
| Purpose | Seven purposes in plain words, one primary (default Understand myself), each with a one-line explanation and, where it helps, an optional follow-up ("What are you working towards?"). Each entry can choose another ("For: …") | TEST | Owner's brief; not everyone wants self-improvement, so Reflect on everyday life and Write freely are equal choices |
| Purpose questions | One question at a time, up to three per entry, each optional and swappable. They take turns between entries, and the entry nudges them: "used up my energy" or a hard feeling brings "what made it harder" forward; "Time flew" asks what made it absorbing; goal questions name your goal | TEST | Owner's brief: two or three questions, never all at once, not the same every day |
| A hard time | "Make sense of a hard time" says "Write only what feels okay. There doesn't have to be a lesson." and asks what happened, what you noticed, what was in your control, what might help | TEST | Pennebaker: what happened, how you felt, why; never force meaning; not for acute crisis |
| Free writing | "Write freely" on Today: one blank page, optional openers, no questions | TEST | Owner's brief: write anything without picking a purpose |
| Drafts | An entry is saved as a draft from its first step and as you go; closing keeps it ("Unfinished · Continue"), and it carries on where it stopped. Drafts stay out of Insights | TEST | Owner's brief: never require finishing to save |
| Skipped questions | Recorded as skipped (`skipped`), left out of every measure, never filled in | ADOPT | "Do not invent missing information" |
| Data | Entries gain kind, purpose, energy answer, how long, reflections (each kept with its question), next step, your take, status and skipped; a `weeks` table for weekly notes. Database version 6, backup format 5; older files restore with the new fields filled in; nothing deleted | ADOPT | Backward compatible; v0.7 refuses format 5 instead of dropping fields |
| Privacy | Unchanged: everything stays on the phone. An e2e test fails if a journey requests anything from another site | ADOPT | The brief's privacy section; the project's non-negotiables |
| After an entry | Saving shows it read back: what happened (your words), what you noticed (only what the entry says: the energy answer, the words you tapped, feelings found in your writing), and a possible insight only with 3+ finished entries for the same activity mostly one way, as an observation and a question, with "See the N entries". "Not quite" dismisses it; "Say it your way" keeps your take, which replaces it | TEST | Owner's brief (Stage E): distinguish what happened, what you noticed, a possible insight; never conclude from too little; your interpretation first |
| Next step | "Anything you'd like to do with this?": Try something differently · Do it again · Make time for something important · Explore a question · Remember this · Nothing for now, then "What exactly?" (optional). Followed up with Done it / Let it go; "Remember this" lands in Insights → What I'm learning | TEST | Owner's brief (Stage F): never forced; journaling is also for understanding and remembering |
| Entries tab | Every entry, newest first by day, unfinished ones on top, searchable by any word in it; 60 days with entries at a time, then "Show earlier". Tapping reads it back, with Edit | TEST | Owner's brief: easy access to previous entries |
| Optional AI | — (Phase 5) | TEST (later) | Owner's choice: app first, AI next, opt-in with your own key |

## To prove on a real iPhone

| Item | Phase | Status |
|---|---|---|
| Add to Home Screen, open offline | 0–1 | ADOPT (confirmed) |
| Export via share sheet → Save to Files, then re-import | 1 | ADOPT (confirmed) |
| Reminders calendar file reaches Calendar via Mail, AirDrop to Mac, or Files | 1 | ADOPT (confirmed) |
| Insights; data kept through the update to v0.3 | 2 | TEST |
| Logging one question at a time feels quick; the double-tap guard never gets in the way | 2.5 | TEST |
| Evening question: answers save, ↻ Another, goal questions after setting a goal; data kept through the update to v0.4 | 2.5 | TEST |
| Describing activities with feeling words feels natural and quick; old entries show words; your own word; a note's feelings offered | 2.6 | TEST |
| Insights read in words | 2.6 | TEST |
| Writing an Odyssey Plan through the guided screens; the three cards read well side by side; Workview & Lifeview | 3a | REJECT (removed in v0.8) |
| Add activity: the question, field, recent activities and Next sit above the keyboard; the same for "+ your own word" and the note | 3a.5 | TEST |
| Scrolling inside a sheet leaves the screen behind it still | 3a.5 | TEST |
| A purpose on the welcome (or in More); the six steps, skipping any; free writing; an unfinished entry continued | 4 | TEST |
| An entry read back after saving: the summary reads right, a next step kept and followed up; Entries search | 4 | TEST |
| The welcome (open the address in Safari: its storage is separate from the Home Screen app's, so it starts fresh); "Need a start?" under the evening question; the colours, Today's list and serif titles in light and dark | 3a.5 | TEST |
| Share to the Claude app; attach a downloaded review file | 5 | TEST |

## Corrections to the earlier v1 notes

- The v1 code in the notes was corrupted when copied, so it is used as a spec only.
- "Jot" and "SelfTrack" could not be verified, so they were dropped from the comparison.
- The old v4 "built-in Claude API" is now optional, through your own key; the Claude API is paid.
- The old v3 "Google Sheets auto-backup" is rejected (phone-only data).
- GitHub Pages is kept, now with a build-and-deploy workflow.
