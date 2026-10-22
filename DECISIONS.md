# Decisions

Living status of every product and technical decision. When a decision changes, update this file in the same change.

**Statuses:** ADOPT (in use) · TEST (adopted, still to be proven on a real iPhone) · WATCH (depends on something outside our control that may change) · REJECT (considered, not used)

Last updated: 2026-10-22

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
| Note | Since v0.9 the one writing box, "What's on your mind about it?" (see One box to write in). In v0.8 a separate last step, "What else would you like to record?"; before v0.8 worded from the two feeling-word questions ("What took your energy?"…) | ADOPT | Owner, 2026-10-22: "'what else would you like to record?' is also not required separately" |
| Question explanations | ⓘ next to each activity question explains what it asks (attention while doing it; what it did to your energy; how you felt) | ADOPT | Owner's request (Phase 1): answer consistently |
| Ikigai | Both lenses: 4-circle map plus a daily "small joy" line | ADOPT (the daily small joy) · REJECT (the 4-circle map: parked with Phase 3b, 2026-10-22) | The Venn diagram is a 2014 Western adaptation; the Japanese sense is everyday |
| Designing Your Life tools | Health/Work/Play/Love balance (most alive, most neglected), Workview + Lifeview, Prototype tracker, AEIOU deep-dive | REJECT (v0.8, except the Good Time Journal questions and AEIOU details; data kept) | Completes the loop: notice → imagine → prototype |

## AI

| Area | Decision | Status | Why |
|---|---|---|---|
| Review a period | Insights → Review a period: This week · Last week · This month · Last month · Custom. What's in it is shown before anything leaves (entries, days, small joys, evening answers, next steps, about how many words), with an optional "Anything to focus on?". Two ways (owner's choice, 2026-10-22): Copy for an AI chat (the clipboard) or Share as a file (.md, through the share menu), to give to any AI chat yourself; or Review with AI in the app, with your own key, one tap at a time, with "See what's sent" beside it | TEST | Owner: "a way to copy the relevant data … a week's data, month's data or custom range" and "click on Review with AI in the app itself". Never without a tap (the never list) |
| Recommended in-app provider | Groq, free plan (no card). By contract it doesn't train on what you send and keeps little by default. The app lists the models your key can use and suggests GPT-OSS 120B when it's there | WATCH | Owner's choice. Free plans and model lists change: Groq's featured models changed in September 2026 |
| Other in-app providers | OpenAI (paid, labelled as paid; the owner may switch if Groq's reviews aren't good enough). OpenRouter and the Claude API: not offered (owner's choice, 2026-10-22). Gemini | ADOPT (OpenAI) · REJECT (Gemini) | Gemini's free tier may be read by reviewers and used to improve Google's products. Both Groq and OpenAI accepted direct calls from the app's address on 2026-10-22 |
| The AI key | Typed on the phone and kept only there (setting `aiKey`): never in the code, the repo or the website, never in a backup, CSV, copy or file, never logged or put in an error. Checked with the service before it's kept; shown only as "ends abcd"; Remove key deletes it. The privacy scan refuses key-like strings in commits | ADOPT | Owner: "make sure API key is secured as this website is hosted on public repo on Github" |
| Where the app may connect | The CSP's connect-src names only this site, `api.groq.com` and `api.openai.com` (until v0.12: any https site), so not even injected code could send the key or your journal anywhere else. The app loads no outside scripts | ADOPT | Least access for the key; a unit test checks the policy |
| AI reviews kept | Each Review with AI is saved with its period, focus, service and model (an `aiReviews` table, database version 8, backup format 7) and listed under Earlier reviews; swipe to delete with Undo. The answer is shown as text with headings and lists, never as HTML | ADOPT | To read again offline; nothing in an answer can run |
| Server-side AI (Cloudflare Workers AI) | — | REJECT | Needs an extra service; its API rejects browser calls |
| GitHub Models | — | REJECT | Retired on 30 July 2026 |
| On-device AI in the browser | — | REJECT | Only 1–3B models fit on an iPhone; insights too shallow |
| Look back reminder | Weekly (default), monthly or every N days, set in More → Reminders; it opens Insights, where the week is put together for you (v0.8). "Review now" went with the Review tab | ADOPT | Owner, 2026-10-22: reviews should happen automatically, not as a manual chore |
| Review style | One set of instructions for both ways: what happened; what you notice, with dates; possible insights said tentatively with their evidence, starting from your own take; one or two small experiments; one question. No scores, ratings or diagnoses; a gentle pointer to someone you trust or a helpline (findahelpline.com) if the writing suggests crisis. Until v0.8: mirror or coach styles | TEST | Over-automated reflection weakens your own insight (Reflective Agency, AIES 2025); the never list; the owner's brief (your interpretation first) |

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
| Time logged | Each entry's row shows when it was written, at the right of its first line ("21:14", or "Fri 09:02" if written on another day than the one it's about); the read-back says "logged 21:14". The order is unchanged | TEST | Owner, 2026-10-22: "so I know which one is most recent" |
| Swipe to delete | On Today and Entries, swipe a row left to show a red Delete; tapping it deletes at once and offers "Entry deleted · Undo" for six seconds. Delete stays in Edit, for VoiceOver | TEST | Owner's choice (2026-10-22): as in iOS Messages, with Undo rather than a confirmation |
| A swipe-list library (react-swipeable-list, @sandstreamdev/react-swipeable-list, react-swipe-to-delete-ios) | — | REJECT | Last released 2022–2024, none lists React 19; react-swipeable (maintained) only detects the gesture. About 80 lines of our own pointer handling do it (owner's choice) |
| Appearance | More → Appearance: Automatic (the iPhone's setting) · Light · Dark, kept on this phone (localStorage) and applied before the first paint, status bar included. Colours are written once each with light-dark(); iOS before 17.5 gets a plain copy kept in step by a unit test | TEST | Owner, 2026-10-22: "I don't see where can you get the dark mode from" (it followed the iPhone only) |
| Fields in sheets | A field never sits under a sheet's header or footer: a focused field is brought wholly into sight, again once the keyboard is up; a box that appears on a tap (your own word) takes the focus in the same tap, so the keyboard opens; follow-up questions and extra fields scroll into sight when they appear. Footers are one row; text boxes never outgrow the room above the keyboard | TEST | v0.9 on the owner's iPhone: "+ your own word" put its box behind Skip. The keyboard test only checked "above the keyboard" |
| Entry sheets | New activity, Write freely, Edit and the read-back use the whole screen (all of it above the keyboard); other sheets stay their own size | TEST | Owner, 2026-10-22: "the screen is not opening to its fullest" |
| The page behind a sheet | Locked while any sheet is open: the body is fixed in place at the same spot and the scroll position put back on close (`useScrollLock`); the sheet's own scroll stays inside it (`overscroll-behavior: contain`) | TEST | v0.7 on the iPhone: scrolling in "New activity" scrolled the screen behind it. `showModal()` blocks taps, not scrolling, and `overflow: hidden` isn't reliable on iOS. An e2e test guards it |
| Never a blank screen | An error boundary wraps the app. A lost database connection reloads it once (at most once in 30 seconds); any other failure, or a second one, shows "Something went wrong" with Reload and the error's name. When the app comes back from the background it checks that its database still answers. A screen still waiting after 4 seconds says "Opening your journal…" with Reload. Switching to another app saves an unfinished entry at once | TEST | v0.8 on the owner's iPhone: blank after switching back to the app. While the app sits in the background, iOS can drop its database connection ("UnknownError: Connection to Indexed Database server lost. Refresh the page to try again": Dexie issue #2008, WebKit bugs 197050, 235579 and 277615; no fix in Dexie 4.4.6). Dexie's live queries then either throw, and without an error boundary React removed the whole page, or wait for ever. A page reload opens the database again. e2e tests break the database the way Safari reports it |
| react-error-boundary | — | REJECT | 30 lines of our own do the same without another dependency |
| A drawer library for sheets (e.g. react-bottom-fixed, drawer components) | — | REJECT | react-bottom-fixed (v0.1.0) handles fixed buttons, not sheets; a drawer library would replace the native `<dialog>` and its tested focus, Escape and VoiceOver handling. A 30-line hook does the job |
| Layout checks | Every main screen and sheet, light and dark, the keyboard up over each text box, gets one general layout check (our own, about 200 lines, plus axe-core's WCAG AA rules) and a reference screenshot that fails when the screen changes. Before "done", Claude opens the changed screenshots and looks (CLAUDE.md) | ADOPT | Owner, 2026-10-22: "I have to repeatedly tell you to fix things in the layout". Five fix releases were layout bugs found on the iPhone, each test written after its bug. Its first run found faults that had been there since Phase 1 |
| Layout-check libraries (flexpect, boxy, Layout Lint) | — | REJECT | Checked 2026-10-22: 1 star, 0 stars with no licence, and an MCP server with no track record. axe-core (Deque, maintained) covers contrast and target size; our own check covers the rest |
| AI app generators (v0.dev, bolt.new, bolt.diy) | — | REJECT | Owner asked, 2026-10-22. They're code generators that can't see an iPhone either, they write Next.js, Tailwind and shadcn code that doesn't fit this app's hand-written CSS and rules, and none runs iPhone Safari, where the bugs were |
| Mobile UI kits (Ionic React, Konsta UI) | — | REJECT | Each would mean rewriting every screen (Konsta needs Tailwind) |
| React Aria for sheets | — | WATCH | Adobe, maintained; solves iOS scroll lock and focus, but has an open iOS 26 modal bug (#9172), and swapping our tested `Dialog` is a risk of its own. Look again if the sheet breaks again |
| Testing in real iPhone Safari | Xcode's iOS Simulator runs iPhone Safari on the Mac (an iPhone 17 on iOS 27.0, the owner's phone; iOS 27.1 runs only on newer models), driven by Apple's safaridriver (built into macOS) | TEST | Playwright's WebKit at iPhone size has no on-screen keyboard and none of iOS's scroll and focus behaviour, where four of the five fixes were. 2026-10-22: the simulator opens the app and takes screenshots (`xcrun simctl openurl` / `io screenshot`); safaridriver can't connect to Safari yet (Mac or simulator, even started from the owner's Terminal), so taps and typing wait on its setup. Setup: Safari → Settings → Developer → "Allow remote automation and external agents", or `safaridriver --enable` without `sudo` (with sudo it sets the root account's Safari: the first setup notes said sudo) |

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
| Insights period | One filter (7 / 30 / 90 days / all, default 30) above all the patterns (on their own page since v0.8; the weekly review covers its own week); every number and chart follows it | ADOPT | Numbers always agree with each other (dataviz rule) |
| Minimum count | Activities, places, people and so on are ranked only after 3+ entries; every result says how many times | ADOPT | One or two entries are anecdotes, not patterns |
| Charts | Energy: columns above or below zero; how into it: its own chart, one at a time with an Energy / Into it switch (never a second scale on one chart). Since Phase 2.6 the axes, readout and table speak in words ("gives / takes", "mostly energising") | ADOPT | Dataviz rules: one axis per chart, a readout and table view, never colour alone |
| Energy colours | Blue = gives energy, red = drains: in charts, and since v0.7 as the thin edge beside each activity (the feeling words stay in ink); engagement = aqua | ADOPT | Green/red is unreadable with red-green colour blindness; blue/red is the validated diverging pair. Aqua passed the checks with a colour-blind and contrast warning, covered by chart titles, axis labels, readout and table |
| Orange for engagement | — | REJECT | Failed the validator next to red (ΔE 7.1; the minimum is 15) |
| Violet for engagement | — | REJECT | Failed the validator next to blue |
| What I'm learning | What you keep to remember from an entry (since v0.8) and past review takeaways, collected in Insights | ADOPT | What you learn needs somewhere to land; past takeaways stay visible now the Review tab is gone |
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
| Small experiments from patterns (prototype tracker) | REJECT (parked with Phase 3b); next steps instead (v0.8), a list you manage since v0.11 | Mood apps rarely help you act on what you learn (Caldeira et al.) |
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
| Sentence starters | "Need a start?" on Write freely and under the evening question: three openers that fit the question (by its purpose). Until v0.9 also under an activity's note (by how the activity left you); its one box has the purpose's questions instead. Tapping one types it in and opens the keyboard | TEST | Owner's choice. The blank page is the main beginner barrier (JED); openers appear only when asked for, so answers don't all sound alike |
| Gentle first steps | Empty day: "Start with one thing you did." After 3+ days without an entry: "Welcome back. Missed days don't matter: start with one thing you did." (`AWAY_DAYS`). Insights says when it fills in | TEST | Owner's choice. Missing a day doesn't derail a habit (Lally et al. 2010); no streaks or counts (see the never list) |
| Colour with meaning | A thin edge beside each activity and review moment: blue gave energy, red took it, none for neither. The feeling words are back in ink. The evening card and small joys are pale sand (`--evening-bg`). Text, muted text and links on the sand pass WCAG AA in light and dark; the edges pass 3:1 on both card surfaces | TEST | Owner's choice: a little colour, only where it means something. Red feeling words read like an error |
| Ink-only, or a colour per tab | — | REJECT | Owner's choice. A colour per tab carries no meaning and competes with the energy colours |
| Today's list | One rounded list with thin lines between activities, not a box each. "+ Reflect on an activity" is the one main button, with "Write freely" beside it (v0.8); the backup nudge keeps its filled button (losing data is the bigger risk) | TEST | Owner's choice; calmer, like iPhone Settings |
| Insights order | "Gives energy" and "Takes energy" first, then the summary tiles and the chart (on Patterns since v0.8) | TEST | Owner's choice: the words are what people look for |
| Titles | Page titles, card titles and questions in the iPhone's serif (New York, `ui-serif`); everything else unchanged | TEST | Owner's choice: reads like a journal, not a form |
| A tips page in More | — | REJECT | Owner's choice: the welcome, openers and empty states cover it |
| Word budgets | Today 60 → 63 for "Need a start?"; welcome 55 / 65 / 20. Later changes: see Purpose-driven journaling | ADOPT | Set from measurements, in owner-approved plans |

## Purpose-driven journaling (Phase 4)

The owner's brief (2026-10-22): help beginners record experiences, understand themselves, discover insights and apply them; remove the Life Design and Review tabs; reviews and insights happen automatically (by the app now, optional AI later). Owner's choices: the app does it without AI for now; tabs Today · Entries · Insights · More; six quick, skippable steps (five since v0.9: one box to write in).

| Area | Decision | Status | Why |
|---|---|---|---|
| Tabs | Today · Entries · Insights · More. Review and Life Design are gone; their old links open Today | ADOPT | Owner, 2026-10-22 |
| Purpose | Seven purposes in plain words, one primary (default Understand myself), each with a one-line explanation and, where it helps, an optional follow-up ("What are you working towards?"). Each entry can choose another ("Questions for: …"). Your follow-up shows with the helper questions as "Your focus: …" (v0.9; the goal is named inside its questions). ⓘ on More → Your purpose says what it changes: the questions offered when you write, and the evening question (v0.9) | TEST | Owner's brief; not everyone wants self-improvement, so Reflect on everyday life and Write freely are equal choices |
| Purpose questions | Helpers above one writing box (v0.9), never fields: three at a time, "↻ Other questions" for the rest. They take turns between entries, and the entry nudges them: "used up my energy" or a hard feeling brings "what made it harder" forward; "Time flew" asks what made it absorbing; goal questions name your goal. "Need a start?" openers aren't on this box: the questions do that job | TEST | Owner's brief: two or three questions, not the same every day. Owner, 2026-10-22: "have those questions as helpers but just one box for capturing", since AI can later sort one text. In v0.8 each question had its own box, one at a time, up to three |
| One box to write in | New activity is five steps: what you did, what it was like, what it did to your energy, how you felt (taps, each skippable), then "What's on your mind about it?": one box with the helpers above it, feelings found in your words, and "+ How long, where, who". Edit uses the same box. Entries written in v0.8.0 keep their separate answers, each under its question, readable and editable; nothing is rewritten | TEST | Owner's choice (2026-10-22): keep the three quick taps, which feed Insights without AI, then one box. Word budget 60 for the step (it replaces two screens of 25 and 30) |
| A hard time | "Make sense of a hard time" says "Write only what feels okay. There doesn't have to be a lesson." and asks what happened, what you noticed, what was in your control, what might help | TEST | Pennebaker: what happened, how you felt, why; never force meaning; not for acute crisis |
| Free writing | "Write freely" on Today: one blank page, optional openers, no questions | TEST | Owner's brief: write anything without picking a purpose |
| Drafts | An entry is saved as a draft from its first step and as you go; closing keeps it ("Unfinished · Continue"), and it carries on where it stopped. Drafts stay out of Insights | TEST | Owner's brief: never require finishing to save |
| Skipped questions | Recorded as skipped (`skipped`), left out of every measure, never filled in | ADOPT | "Do not invent missing information" |
| Data | Entries gain kind, purpose, energy answer, how long, reflections (each kept with its question; only entries from v0.8.0 have them, since v0.9 writes one box), next step, your take, status and skipped; a `weeks` table for weekly notes. Database version 6, backup format 5; older files restore with the new fields filled in; nothing deleted | ADOPT | Backward compatible; v0.7 refuses format 5 instead of dropping fields |
| Privacy | Unchanged: everything stays on the phone. An e2e test fails if a journey requests anything from another site | ADOPT | The brief's privacy section; the project's non-negotiables |
| After an entry | Saving shows the entry read back, your entry first (v0.9): when and "✓ Saved"; the words you tapped as chips, the energy answer first with its blue or red edge; what you wrote, at reading size. Then a possible insight in its own card, only with 3+ finished entries for the same activity mostly one way, as an observation and a question, with "See the N entries" and the edge of its direction. "Not quite" dismisses it; "Say it your way" keeps your take, which replaces it. Edit and Done share one row. Until v0.9 a summary restated the entry ("What happened", "What you noticed"), which made the screen hard to read | TEST | Owner's brief (Stage E): distinguish what happened, what you noticed, a possible insight; never conclude from too little; your interpretation first. Owner, 2026-10-22: "the last screen is not well designed or readable clearly"; chose "your entry first". Word budget 90 → 75 |
| Next step | "Anything you'd like to do with this?": Try something differently · Do it again · Make time for something important · Explore a question · Remember this · Nothing for now, then "What exactly?" and (to do or try) "When?" (optional). Since v0.11 a step joins Next steps; the entry then just shows "Next step: …" with a link to the list: nothing to tick at the moment of writing. "Remember this" stays with the entry (What I'm learning). Until v0.11 the entry asked "Done it / Let it go / Remove" | TEST | Owner's brief (Stage F): never forced. Owner, 2026-10-22: "I am writing it for future, how can I have done it?" |
| Next steps list | Insights → Next steps: working on (newest first), not touched lately (4+ weeks: Keep or Finish), finished (done or stopped, with dates, collapsed). Add one by hand; open one to change its words, When and Once/Ongoing, mark it "I did it" (once) or "Stop doing it" (ongoing), take it up again, merge it into another, or delete it; swipe to delete with Undo. Insights' first page shows up to three you're working on | TEST | Owner, 2026-10-22: "a separate section … where I can see and manage (add/delete) them", "most of them may not be a one time thing", "they will also start growing in list with time" |
| Once or ongoing | A step is Once (finished when done) or Ongoing (kept until you stop it), set from the choice ("Do it again" and "Make time…" are ongoing) and changeable. Nothing to tick daily, no streaks | TEST | Owner: "go for walk 10 min every evening … is not a one time thing". Habits form from a steady cue; a missed day doesn't undo them (Lally 2010); the never list rules out streaks |
| When? | An optional cue ("after dinner"); the step reads "After dinner: Walk 10 minutes" | TEST | If-then plans are the best-evidenced way to raise follow-through (Gollwitzer & Sheeran 2006, d ≈ 0.65; 2024 update across 642 tests) |
| A step comes back | When you write about the same activity again, the writing step shows "Your plan for this", with a "Did it" tick for a once-step. Nothing nags on a schedule | TEST | Kolb, Gibbs, "Now what?": try it in the same kind of situation, then reflect on how it went |
| Look-alike steps | Keeping a step that shares most of its words with one you have (60%+, or one inside the other) asks "Same as …?": Same links the entry to that step, Different keeps both. The page offers Merge for look-alike pairs, and any step can be merged by hand | TEST | Owner: "they can also clash as maybe two sentences meant the same thing". Without AI only similar wording is caught; meaning-level matching can come with Phase 5 |
| Next steps data | A `steps` table (database version 7, backup format 6): words, when, once/ongoing, working on/done/stopped, the entries it came from, its activity. The upgrade moved next steps kept on entries into it (open → working on, done → done, let go → stopped); restoring an older backup does the same, once however often it's restored. v0.10 refuses format 6 | ADOPT | Nothing lost; tested on a real version 6 database |
| Entries tab | Every entry, newest first by day, unfinished ones on top, searchable by any word in it; 60 days with entries at a time, then "Show earlier". Tapping reads it back, with Edit | TEST | Owner's brief: easy access to previous entries |
| Weekly review | Insights opens on "This week" (Monday to Sunday), put together from finished entries, with nothing to fill in. Since v0.9 one card per section under a serif title: the week in brief ("8 entries on 5 days") with its energy by day (the energy chart: blue above the line gave energy, red below took it, read in words on tap, with a table view); what stood out (up to three entries, one per activity: kept to remember, then a next step, then time flew, then the most written; each opens); your energy (activities with 2+ entries one way that week, with the blue or red edge, each opening to its entries); feelings that came up most (top three, as chips that open their entries); things to remember, on the evening's sand. One optional box, "Anything to carry into next week?", kept per week and loaded with the page so nothing shifts. Earlier weeks open the same summary | TEST | Owner, 2026-10-22: reviews happen by themselves, not as a chore. Then (same day) "not very readable, looks too plain": the owner chose a week chart and cards. Next steps moved to their own card and list in v0.11 |
| Patterns | A tap from Insights ("Patterns over time"), on their own page: gives and takes energy, the summary tiles and chart, time flew, energy by context, alone or with others, small joys, with one period filter. "In what you've written, not causes." Every row opens to the entries behind it | TEST | Owner's brief: every pattern traceable to its entries, cautious words. With the week on the same page, Insights measured 215 words against its 150 budget, so patterns moved a tap away |
| Alone or with others | What your energy was like with people and alone, shown only with 3+ entries each way | TEST | Owner's brief; the same minimum as every other pattern |
| Word budgets (v0.12) | Insights (the week) 120 → 130 for the Review a period row; Review a period 60; More → AI review 40 | ADOPT | Set from measurements; the raise goes to the owner with v0.12 |
| Word budgets (v0.11) | Insights (the week) 105 → 120 for the Next steps card; the Next steps page (empty) 30 | ADOPT | Set from measurements; the raise waits on the owner's OK |
| Word budgets (v0.10) | Today 72 → 85 and Entries 125 → 180 for the time each entry was logged (in the test browser "8:00 PM" counts as three words); Insights (the week) 100 → 105 for the times on stand-out entries; More gains a row (47 of 60) | ADOPT | The owner asked for the times; the raises wait on the owner's OK (CLAUDE.md rule) |
| Word budgets (v0.9) | The writing step 60 (it replaces reflect 25 and anything else 30); an entry read back 90 → 75 (it no longer restates the entry); Insights (the week) 80 → 100 for the chart and cards the owner chose, waiting on the owner's OK | ADOPT | Set from measurements (CLAUDE.md rule: raises need the owner's OK) |
| Word budgets (v0.8) | New: reflect 25, energy 30, how you felt 30 (12 words), write freely 25, an entry read back 90, Entries 125, Insights (the week) 80. Raised: Today 63 → 72 (two ways in; the test browser now shows the install notice, never shown in the Home Screen app), anything else 25 → 30, Patterns 150 → 155 (Alone or with others), Your purpose 95 (was Evening question 60), welcome 55 / 65 → 60 / 105 (seven purposes, each explained) | ADOPT | Set from measurements; the raises go to the owner for an OK with v0.8 (CLAUDE.md rule) |
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
| A purpose on the welcome (or in More); the steps, skipping any; one box with its helper questions (v0.9); free writing; an unfinished entry continued | 4 | TEST |
| An entry read back after saving: the summary reads right, a next step kept; Entries search | 4 | TEST |
| Insights: this week put together (v0.9: the energy chart and cards), each line, feeling and stand-out entry opening; the weekly note; earlier weeks; Patterns | 4 | TEST |
| The welcome (open the address in Safari: its storage is separate from the Home Screen app's, so it starts fresh); "Need a start?" under the evening question; the colours, Today's list and serif titles in light and dark | 3a.5 | TEST |
| Switching to another app and back, also after hours away, never shows a blank screen; an unfinished entry is still there | 4 (v0.8.1) | TEST |
| Adding your own word (and where, who, a next step) with the keyboard up: the box stays in sight above Skip or Save; entry sheets fill the screen | 4 (v0.9.1) | TEST |
| Times on rows; swipe a row left, Delete, then Undo; More → Appearance Light and Dark (status bar too) | 4 (v0.10) | TEST |
| Next steps: keep one after an entry; it's in Insights → Next steps; write about the same activity again and it comes back ("Did it"); a look-alike asks "Same as…?"; add, change, merge, swipe to delete; next steps from before v0.11 are in the list | 4 (v0.11) | TEST |
| Review a period: copy it into an AI chat app; share it as a file; set up a free Groq key (More → AI review), Review with AI for a week and a month, read an earlier review; the key shows only its last four characters, and Remove key works | 5 (v0.12) | TEST |

## Corrections to the earlier v1 notes

- The v1 code in the notes was corrupted when copied, so it is used as a spec only.
- "Jot" and "SelfTrack" could not be verified, so they were dropped from the comparison.
- The old v4 "built-in Claude API" is now optional, through your own key; the Claude API is paid.
- The old v3 "Google Sheets auto-backup" is rejected (phone-only data).
- GitHub Pages is kept, now with a build-and-deploy workflow.
