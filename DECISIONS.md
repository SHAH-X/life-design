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
| Note | Asked right after the two feeling-word questions, worded from them ("What took your energy?", "What gave you energy?", "What kept you into it?", otherwise "Anything that stood out?"), optional | ADOPT | Phase 2.5: the why now follows the how, one screen after naming the activity. Before (Phase 1, owner's request) it sat under "What did you do?"; the aim, explaining while it's fresh, is kept |
| Question explanations | ⓘ next to both feeling-word questions explains what each asks (attention while doing it; how you came out of it) | ADOPT | Owner's request (Phase 1): answer consistently |
| Ikigai | Both lenses: 4-circle map plus a daily "small joy" line | ADOPT | The Venn diagram is a 2014 Western adaptation; the Japanese sense is everyday |
| Designing Your Life tools | Health/Work/Play/Love balance (most alive, most neglected), Workview + Lifeview, Prototype tracker, AEIOU deep-dive | ADOPT | Completes the loop: notice → imagine → prototype |

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
| Sheets and the iPhone keyboard | Every sheet sits on top of the keyboard: `useKeyboardInset` follows `window.visualViewport` and lifts the sheet by the part the keyboard covers, caps its height to what's left, and keeps the focused field in sight. The keyboard still opens straight away on "What did you do?" | TEST | v0.6: the keyboard covered "What did you do?". iOS shrinks only the visible area for the keyboard, never the page, and Safari doesn't support `interactive-widget=resizes-content`. An e2e test fakes the keyboard |
| A drawer library for sheets (e.g. react-bottom-fixed, drawer components) | — | REJECT | react-bottom-fixed (v0.1.0) handles fixed buttons, not sheets; a drawer library would replace the native `<dialog>` and its tested focus, Escape and VoiceOver handling. A 30-line hook does the job |

## Review and Insights (Phase 2)

| Area | Decision | Status | Why |
|---|---|---|---|
| Review steps | 1 At a glance (counts, energy and into-it charts in words, high and low points, small joys, evening answers) → 2 Balance: most alive and most neglected, plus why (Phase 2.6; was 0–10) → 3 Best and worst moments, one question each (AEIOU behind "Zoom in" since Phase 2.5) → 4 Your reflection first, then one takeaway → 5 Finish (with a backup nudge if the last backup is 7+ days old) | ADOPT | Designing Your Life's weekly reflection. The AI step slots in after the reflection in Phase 4; prototype updates arrive with Phase 3's prototype tracker |
| Review period | Default: since the last review; otherwise one schedule length back, never before logging began. Can be changed to 7, 14 or 30 days, or custom dates | ADOPT | Each review covers exactly the days not yet reviewed |
| Review due | The first scheduled day after the last review's period (or after logging began); a notice on Today and the Review tab | ADOPT | No background notifications in a PWA, so the app tells you when you open it; the calendar reminder covers the rest |
| Drafts | A review saves as you go; it can be continued or discarded later | ADOPT | Reviews take about 10 minutes and get interrupted |
| Best and worst moments | Pre-selected (most and least energy, then engagement), changeable; AEIOU pre-filled from the entry's where, with whom and using | ADOPT | Saves typing; you correct rather than start from blank |
| High and low points in the review | One line per activity with how often it happened, ranked by its strongest moment | ADOPT | The same activity three times in a row told you nothing new |
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
| Logging flow | One question per screen: what you did → what it was like (words) → how it left you (words) → anything else; a recent activity is one tap; editing shows everything on one screen | TEST | One question per page works best on phones (GOV.UK, NHS design systems). Owner's choice |
| Tap guard | A question that replaces another ignores taps for 300 ms (answers marked aria-disabled), so a fast double tap can't answer it | ADOPT | The "nothing moves under the finger" rule |
| Today's list as signs | ▲▲ ▲ – ▼ ▼▼ and five dots | REJECT | Replaced in Phase 2.6: rows show the feeling words themselves ("absorbed · time flew · energised") |
| Evening card | The small joy stays every day, plus one optional question that changes each evening and can be swapped (↻ Another) until it's answered | TEST | Owner's choice. Variety goes where it helps reflection, not into the measured questions |
| Purposes | Know myself and joy always; Feel calmer, Grow, Reach a goal and Learn can be switched off (all on). The goal is set in More → Evening question; goal questions wait until it is | ADOPT | Owner's choice. Methods: naming feelings (Lieberman 2007) and expressive writing; After Action Review; Progress Principle (Amabile & Kramer) and if-then plans (Gollwitzer & Sheeran 2006); What? So what? Now what? (Rolfe 2001); Three Good Things (Seligman et al. 2005) |
| Questions from your own days | About every third evening: a pattern from the previous two weeks (what drained you, what gave you energy, when time flew, an area felt neglected in 2+ recent reviews). Worked out on the phone, no AI; not asked again within 14 days of answering | ADOPT | A question about your own life draws out a real answer; nothing leaves the phone |
| Evening answers data | Stored with the question asked (database version 3, backup format version 3). Each review moment gains a "why" | ADOPT | Old backups still restore (reviews get an empty "why"); older app versions refuse version 3 files |
| Review moments | One question per moment ("What made it so good?" / "What made it so draining?"); AEIOU behind "Zoom in", pre-filled as before | ADOPT | Ten text boxes felt like a form |
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
| Describing an activity | Two feeling-word questions, tap as many as fit: "What was it like?" (Absorbed · Focused · Curious · Challenged · Time flew · Fine · Distracted · Restless · Bored) and "How did it leave you?" (Energised · Inspired · Proud · Calm · Satisfied · Same as before · Tired · Frustrated · Stressed · Drained), each with "+ your own word" | TEST | Owner's choice. Users ask to describe feelings in their own words but find a list helps when unsure (JMIR 2020, 1,803 reviews); naming feelings precisely is linked to better coping (Kashdan, Barrett & McKnight 2015) |
| Working it out | On the phone, from one table of weights (`src/domain/feelings.ts`): how into it = average of the words; energy = the words added up within −2…+2; time flew = "Time flew". Stored for analysis, never shown | ADOPT | Keeps every pattern working with no AI and nothing leaving the phone |
| Your own words | Added with one plain question ("Were you into it?" / "Did it give you energy or take it?"), offered again next time (up to 6 per question), removable in More → Your feeling words | ADOPT | Users want their own emotion words (JMIR 2020: flexibility, 20% of reviews) |
| Words in your note | The note picks out feelings it mentions ("wiped out" → drained, "lost track of time" → time flew), skipping negations ("not bored"), as tap-to-add suggestions | ADOPT | Lets you answer in your own words; it suggests, you decide |
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
| Looking back ("a month ago you wrote…") in the review | TEST (Phase 3) | Day One's On This Day; rereading entries helps (JMIR 2020) |
| Small experiments from patterns (prototype tracker) | TEST (Phase 3) | Mood apps rarely help you act on what you learn (Caldeira et al.) |
| Readable export of the whole journal; shareable review summary | TEST (Phase 4) | Lock-in and missing export are common complaints; users value sharing with a clinician |
| Search across entries, answers and reviews | TEST (Phase 5) | Apple Journal's most-cited gap |

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

Phase 3 ships in two parts (owner's choice): 3a "Imagine" now, 3b "Test and learn" (prototypes, Ikigai map, pinning, looking back, deep review) next.

| Area | Decision | Status | Why |
|---|---|---|---|
| Life Design tab | A short list of pages (Odyssey Plans, Workview & Lifeview), like More | ADOPT | Same calm pattern as More |
| Odyssey Plans | Three five-year lives: your current path; if that path vanished; if money and image didn't matter. Shown as three cards that double as the side-by-side comparison (title, feeling words, "Needs: money") | TEST | Designing Your Life's Odyssey Plans (UF/CMC worksheets, CreativeLive) |
| Writing a plan | First time: seven guided screens (what it's about, year by year, six-word title, questions it answers, how it feels, what it would take, does it fit), saved as you go and resumed where you left off. After that: one page, saved as you edit | TEST | One question per screen for first-time flows (Phase 2.5 rule); a plan is long to type on a phone, so nothing is lost if you stop |
| The plan "dashboard" | No gauges. Likeability and confidence: "How do you feel about this future?" (Excited · Curious · Hopeful · Confident · Calm · Unsure · Anxious · Scared · Trapped · Bored · own words). Resources: "What would it take?" (tap what's missing: time, money, skills, people, plus what exactly). Coherence: "Does it fit your Workview and Lifeview?" in your own words, with them shown alongside | ADOPT | Owner's choice; the no-ratings rule (Phase 2.6) |
| v1's 0–10 plan sliders and "out of 40" | Kept in storage from v1 files, never shown | REJECT (as a display) | Ratings; v1 plans keep their title, description and question |
| Workview & Lifeview | One page: "What is work for, to you?", "What is life for, to you?" (DYL prompts behind ⓘ; about 250 words each) and "Where do they agree, where do they clash, and does one drive the other?" | TEST | Designing Your Life (Aalto task sheet, UNMC handout) |
| Earlier versions | The first change made 7+ days after the last keeps the plan (or Workview & Lifeview) as it was, dated and read-only. No extra step | ADOPT | Shows how your futures and views shift over time; one constant (`VERSION_AFTER_DAYS`) to tune |
| Dedicated Odyssey / Ikigai apps | — | REJECT | None exist (only printable worksheets); a "Life Designer" Claude skill's Socratic dialogue is noted as an idea for Phase 4 |
| Data | Plans gain feelings, needs, what exactly, fit and writtenAt; new tables for earlier plan versions and Workview & Lifeview; database version 5, backup format 4 (older files still restore; v0.5 refuses v4 files instead of dropping them) | ADOPT | Nothing lost in either direction |

## An easier start (Phase 3a.5)

Owner's questions (2026-10-21): starting to journal is hard, so what would help a beginner? Should the app get a little colour while staying minimal, and can the layout improve? And the keyboard covered "What did you do?" (fixed in v0.6.1; see Platform).

| Area | Decision | Status | Why |
|---|---|---|---|
| Welcome | Only on a first open: the start page (a Home Screen launch or the bare address, never a link to a page), an empty journal, not welcomed yet. Three short screens: 1 what it's for, two example activities, "A few words is enough. Everything stays on this phone.", "Have a backup? Restore it"; 2 "What would you like it to help with?" (the Evening question switches); 3 "A nudge each evening?" (Set a reminder → More → Reminders). Skip on the first two (on the last, Start does the same). Finishing, skipping or restoring sets `welcomed` | TEST | Owner's choice. Beginners need the why and an example; journaling apps that ask what you want help with and offer a reminder up front keep people longer. Never a long setup |
| Sentence starters | "Need a start?" under an empty note or evening question: three openers that fit the question (by its purpose, or by how the activity left you). Tapping one types it in and opens the keyboard | TEST | Owner's choice. The blank page is the main beginner barrier (JED); openers appear only when asked for, so answers don't all sound alike |
| Gentle first steps | Empty day: "Start with one thing you did." After 3+ days without an entry: "Welcome back. Missed days don't matter: start with one thing you did." (`AWAY_DAYS`). Insights and Review say when they fill in | TEST | Owner's choice. Missing a day doesn't derail a habit (Lally et al. 2010); no streaks or counts (see the never list) |
| Colour with meaning | A thin edge beside each activity and review moment: blue gave energy, red took it, none for neither. The feeling words are back in ink. The evening card and small joys are pale sand (`--evening-bg`). Text, muted text and links on the sand pass WCAG AA in light and dark; the edges pass 3:1 on both card surfaces | TEST | Owner's choice: a little colour, only where it means something. Red feeling words read like an error |
| Ink-only, or a colour per tab | — | REJECT | Owner's choice. A colour per tab carries no meaning and competes with the energy colours |
| Today's list | One rounded list with thin lines between activities, not a box each. "Start review" is no longer filled, so "+ Add activity" is the one main button; the backup nudge keeps its filled button (losing data is the bigger risk) | TEST | Owner's choice; calmer, like iPhone Settings |
| Insights order | "Gives energy" and "Takes energy" first, then the summary tiles and the chart | TEST | Owner's choice: the words are what people look for |
| Titles | Page titles, card titles and questions in the iPhone's serif (New York, `ui-serif`); everything else unchanged | TEST | Owner's choice: reads like a journal, not a form |
| A tips page in More | — | REJECT | Owner's choice: the welcome, openers and empty states cover it |
| Word budgets | Today 60 → 63 for "Need a start?"; the welcome screens 55 / 65 / 20 (the middle one reuses More → Evening question as it is) | ADOPT | Set from measurements, in the owner-approved plan |

## To prove on a real iPhone

| Item | Phase | Status |
|---|---|---|
| Add to Home Screen, open offline | 0–1 | ADOPT (confirmed) |
| Export via share sheet → Save to Files, then re-import | 1 | ADOPT (confirmed) |
| Reminders calendar file reaches Calendar via Mail, AirDrop to Mac, or Files | 1 | ADOPT (confirmed) |
| A review end to end; Insights; data kept through the update to v0.3 | 2 | TEST |
| Logging one question at a time feels quick; the double-tap guard never gets in the way | 2.5 | TEST |
| Evening question: answers save, ↻ Another, goal questions after setting a goal; data kept through the update to v0.4 | 2.5 | TEST |
| Describing activities with feeling words feels natural and quick; old entries show words; your own word; a note's feelings offered | 2.6 | TEST |
| Review balance as most alive / most neglected; Insights read in words | 2.6 | TEST |
| Writing an Odyssey Plan through the guided screens; the three cards read well side by side; Workview & Lifeview | 3a | TEST |
| Add activity: the question, field, recent activities and Next sit above the keyboard; the same for "+ your own word" and the note | 3a.5 | TEST |
| The welcome (open the address in Safari: its storage is separate from the Home Screen app's, so it starts fresh); "Need a start?" under the evening question; the colours, Today's list and serif titles in light and dark | 3a.5 | TEST |
| Share to the Claude app; attach a downloaded review file | 4 | TEST |

## Corrections to the earlier v1 notes

- The v1 code in the notes was corrupted when copied, so it is used as a spec only.
- "Jot" and "SelfTrack" could not be verified, so they were dropped from the comparison.
- The old v4 "built-in Claude API" is now optional, through your own key; the Claude API is paid.
- The old v3 "Google Sheets auto-backup" is rejected (phone-only data).
- GitHub Pages is kept, now with a build-and-deploy workflow.
