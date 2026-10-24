# Decisions

What the app does now, and why. History lives in git (`git log -p DECISIONS.md`): when a decision changes, rewrite its
row in the same commit rather than adding a new one.

**Statuses:** ADOPT (in use) · TEST (in use, still to prove on the owner's iPhone: see the last table) · WATCH (depends on something outside our control)

Last updated: 2026-10-24

## Product and logging

| Area | Decision | Status | Why |
|---|---|---|---|
| Build vs adopt | Built new. The earlier single-file v1 is the spec; v1 backups import | ADOPT | No existing app combines Good Time Journal, Odyssey Plans and Ikigai |
| Where the app goes next | Towards the owner's "Cognitive Twin" vision, on the phone, one agreed step at a time. Step 1, one box for anything (no title, category or questions), is in since v0.15. Next: life areas that sort themselves by meaning, then a provoker on the phone about open loops and quiet topics; photos as their own step. Reminders carry no journal content. Layout fixes wait for one pass at the end (owner, 2026-10-24) | TEST | Owner, 2026-10-24: "If I have to think about where a thought belongs, I won't record it." |
| Tabs | Today · Logs (address `#/entries`) · Insights · More. Old Review and Life Design links open Today | ADOPT | Owner, 2026-10-22 and 2026-10-23 |
| Today | One box right under the date, above the day's entries (one rounded list): "What's on your mind? A thought, a worry, a plan…"; a tap opens the writer (Free writing). The evening card: a small joy and one question that changes daily (↻ Another until answered). At most one notice (backup due, then install). After 3+ days away, "Welcome back. Missed days don't matter." | TEST | Owner, 2026-10-24: one box, no forms (chosen from sketches: a box that opens the writer). A missed day doesn't derail a habit (Lally 2010) |
| Purposes | Seven, one primary (default Understand myself), each with a one-line explanation and an optional follow-up shown as "Your focus: …". Set on the welcome or in More → Your purpose; each entry can use another | TEST | Owner's brief: not everyone wants self-improvement |
| Activities from before v0.15 | Until v0.15 Today had "+ Reflect on an activity" (what you did, what it was like, its energy, how you felt, then one box with purpose questions as helpers). Those entries stay: listed, read as their parts, each part changed on its own (its questions, word lists and helpers as before), counted in Insights, backed up. One left unfinished can still be finished. No new ones | ADOPT | Owner, 2026-10-24: "we won't need Reflect on an activity"; nothing written is ever lost |
| The word lists | What was it like? (Absorbed · Focused · Curious · Challenged · Time flew · Fine · Distracted · Restless · Bored); What did it do to your energy? (It gave me energy · It used up my energy · Little difference · A mix of both); How did you feel? (12 words). Your own words are kept for next time (up to 6 per question; removable in More). The same every day; nothing preselected; ⓘ explains each question | TEST | Days stay comparable; a preset answer nudges the answer |
| Working it out | Engagement, energy and flow are worked out on the phone from the words (`src/domain/feelings.ts`), stored for analysis, never shown. A skipped question is recorded in `skipped` and left out, never guessed | ADOPT | Owner: no ratings; "do not invent missing information" |
| Drafts | An entry is a draft from its first step and saves as you go; closing keeps it ("Unfinished · Continue"), and it saves at once when the app is hidden. Drafts stay out of Insights | TEST | Never require finishing to save |
| Free writing | Today's box opens it: one blank page (dictation with the keyboard's mic, pasting long text), optional "Need a start?" openers; saves as you type; listed as "Free writing" with two lines of what you wrote | TEST | Write anything without picking a purpose or a category |
| A hard time | "Write only what feels okay. There doesn't have to be a lesson." It never pushes for one | TEST | Pennebaker; not for acute crisis |
| An entry, one screen | Its parts as rows (small grey labels, a › each); a tap opens only that question, saved whole. "To remember" and the next step change the same way. Delete (asks first) and Done share the footer. Right after saving: your entry first, then a possible insight only with 3+ finished entries for that activity mostly one way ("Not quite" · "Say it your way") | TEST | Owner chose "read it, tap a part" from sketches |
| Entry rows | A one-line title (the activity or "Free writing", cut with …), its words, at most two plain lines of what you wrote, and when it was logged ("21:14", or "Fri 09:02" if written another day) | TEST | Owner, 2026-10-23: free writing listed whole looked cluttered |
| Swipe to delete | On Today and Logs, swipe left for Delete, then "Entry deleted · Undo" for six seconds. Our own pointer handling (about 80 lines) | TEST | As in iOS Messages; no swipe library supports React 19 |
| Next steps | "Anything you'd like to do with this?" after an entry. Steps live in Insights → Next steps: working on, not touched lately (4+ weeks), finished; a one-off ticked off there ("I did it"). Once or Ongoing, an optional "When?" cue; a look-alike (60%+ shared words) asks "Same as …?"; merge by hand. A step came back when you wrote about the same activity: that needs an activity, so since v0.15 only when finishing an earlier unfinished one (step 3 may bring steps back by meaning). Nothing to tick daily | TEST | Owner: "I am writing it for future, how can I have done it?" If-then plans raise follow-through (Gollwitzer & Sheeran 2006) |
| Evening question | Takes turns between Understand myself, your purpose and Everyday life. About every third evening, a pattern from your last two weeks (no AI; drawn from activities, so fewer since v0.15), not asked again within 14 days of an answer; no question repeats within 30 days. Your purpose now steers only these questions: new writing has none | TEST | A question about your own life draws out a real answer |
| Welcome | First open only (the start page, an empty journal): what it's for ("Write whatever is on your mind…") with two examples of writing, your purpose, a reminder offer; Skip on each; "Have a backup? Restore it" | TEST | Beginners need the why and an example; never a long setup |
| Look and words | Light only, every colour written once in `:root`. Colour only where it means something (the energy edge, the evening's sand); serif titles. More is a short list, each setting on its own page. Each main screen has a word budget (`tests/e2e/word-budget.spec.ts`), raised only with the owner's OK | ADOPT | Owner: "the app feels wordy"; no dark mode (2026-10-24) |

## Insights and search

| Area | Decision | Status | Why |
|---|---|---|---|
| Insights, one page | This week (how much you wrote; a chart counting each day's activities that gave energy, up in blue, and used it up, down in red, never averaged, with a tapped day's entries and a table view; what stood out; the feelings that came up most), then the last 30 days in words (gives and uses up energy, when time flew, places, people and times, small joys), then Next steps and What you're learning (newest three), then Earlier weeks and Review a period. The energy parts come from activities, so since v0.15 they speak of earlier ones only (owner's choice: left as they are until step 2 gives Insights something to say about writing). Nothing to choose or fill in; every line opens to the entries behind it | TEST | Owner, 2026-10-23: "two graphs showing the same thing", "suboptions which I don't know is a better option" |
| What counts as a pattern | Ranked only with 3+ entries (`MIN_COUNT`), with the count. Places, people and times: 3+ entries that went one way 60%+ of the time, up to four. A line whose entries all sit behind a line already shown is left out. Worded "In what you've written, not causes." | ADOPT | One or two entries are anecdotes |
| Chart colours | Blue gave energy, red used it up (the validated diverging pair); text never wears the data colour. Orange and violet failed the validator | ADOPT | Readable with red-green colour blindness |
| Logs search | Every word of an entry and its answers; 60 days with entries at a time, then "Show earlier" | TEST | Apple Journal's most-cited gap |
| Search by meaning, on the phone | Finds entries about a question even with none of its words, in Logs and Review a period. BAAI's bge-small-en-v1.5 (MIT, 8-bit ONNX, English) runs in a worker with onnxruntime-web 1.30.0 (one thread) and Hugging Face's tokenizer. Its files come only from this site: `npm run model` fetches a pinned revision, checks each SHA-256 and stores them gzipped (about 28 MB, git-ignored; the build refuses without them); downloaded once on first use, never precached. Each finished entry's meaning is kept in `vectors` (never in a backup; worked out again after a restore) and brought up to date before each search. Logs offers it on the first search; its finds sit under the word matches as "Also about this" (closest three). Review a period: with a focus, "Only entries about this" (1 standard deviation above the rest, at most 20; with under 10 entries or none standing out, the closest three). More → Search by meaning turns it off and removes the download. Closeness is never shown; no vector database (40,000 entries compare in 15 ms) | TEST | Owner, 2026-10-24: kept on the phone. bge-small put an expected entry first for 8 of 8 test questions (two other models: 4 and 5). Rules tuned on fictional entries only: to judge on the owner's |

## AI

| Area | Decision | Status | Why |
|---|---|---|---|
| Review a period | Insights → Review a period: this or last week, this or last month, all time, or custom, with an optional focus. It shows what's in it before anything leaves. Copy for an AI chat, Share as a .md file (share menu), or Review with AI in the app with your own key, one tap at a time, with "See what's sent" | TEST | Owner's brief. Never without a tap |
| Review style | One set of instructions for every way: what happened; what you notice, with dates; possible insights said tentatively with their evidence, your own take first; one or two small experiments; one question. No scores or diagnoses; a gentle pointer to someone you trust or findahelpline.com if the writing suggests crisis | TEST | Over-automated reflection weakens your own insight (AIES 2025) |
| Recommended provider | Groq, free plan (no card; doesn't train on what you send). The app lists your key's models and suggests GPT-OSS 120B when it's there | WATCH | Owner's choice. Free plans and model lists change |
| Other providers | OpenAI, labelled as paid. Not offered: OpenRouter, the Claude API (owner's choice), Gemini (its free tier may be read by reviewers) | ADOPT | Both Groq and OpenAI accept direct calls from the app |
| The AI key | Typed on the phone and kept only there: never in code, a backup, a CSV, a copy or a file, never logged or in an error. Checked with the service before it's kept; shown as "ends abcd"; Remove key deletes it. The privacy scan refuses key-like strings | ADOPT | Owner: the repo and site are public |
| Where the app may connect | The CSP's connect-src names only this site, `api.groq.com` and `api.openai.com`; no outside scripts; `script-src 'self'`. Search by meaning's worker doesn't take the page's policy, so it fetches only the model's own files (a unit test reads its code) | ADOPT | Least access for the key and the journal |
| AI reviews kept | Each saved with its period, focus, service and model (`aiReviews`), listed under Earlier reviews, swipe to delete. Answers show as text with headings and lists, never as HTML | ADOPT | Read again offline; nothing in an answer can run |

## Data and privacy

| Area | Decision | Status | Why |
|---|---|---|---|
| Where data lives | Phone only (IndexedDB). No account, server, analytics, cloud backup or sync | ADOPT | Owner's decision; the founding rule |
| Backup safety | Asks iOS for persistent storage and shows the result (granted on the owner's iPhone); a backup nudge after 7 days; an urgent prompt if a save fails; an optional password on exports | ADOPT | Safari can't report free space, and it clears website data silently |
| Files out | Only through the share menu: "Save to Files…" (prepared when the dialog opens, so one tap), the activities as a CSV, the calendar file. Never a download link or a link to a file | ADOPT | In the Home Screen app a link to an .ics left a blank screen; downloads saved as "unknown" |
| Restore errors | Name the exact problem (empty, web page, spreadsheet, calendar file, damaged, damaged password-protected, another app's file) with the file's name and size | ADOPT | Any failed restore can be diagnosed from one message |
| Database and backups | Database version 9, backup format 7. Older backups restore with new fields filled in; older app versions refuse newer files instead of dropping data; each upgrade is tested on a real old database | ADOPT | Nothing lost in either direction |
| Old Life Design data | Odyssey Plans, Workview & Lifeview, manual reviews and balance answers from before v0.8 stay in storage and backups, not shown (review takeaways show in What you're learning). Prototypes and the Ikigai map are parked on branch `phase-3b-try` | ADOPT | Nothing lost |
| Reminders | More → Reminders: daily log ("Life Design: what's on your mind?"), look back (opens Insights), backup and quarterly check-in, each with a switch, time and pattern, one date range for all, spelled out in plain words. "Get calendar file…" sends one .ics through the share menu (Mail to yourself, AirDrop to a Mac, Save to Files) | ADOPT | iPhone adds calendar files only from Safari or Mail. Confirmed on the owner's iPhone |

## Platform and testing

| Area | Decision | Status | Why |
|---|---|---|---|
| Hosting | GitHub Pages from this public repo, built and deployed by GitHub Actions. A Cloudflare Pages build is parked on branch `root-host-build` (don't merge without asking) | ADOPT | Free; no server |
| Stack | Vite 8, React 19, TypeScript 7, vite-plugin-pwa 2, Dexie 4; hash routes; Vitest and Playwright (WebKit at iPhone 17 size); Node 22.12+ | ADOPT | Maintained PWA tooling; routes never 404 on Pages |
| Sheets and the iPhone keyboard | `useKeyboardInset` follows `visualViewport`: it lifts a sheet by what the keyboard covers, caps its height and keeps the focused field in sight. When iOS 27 shrinks the page too (a box low in a sheet), the offset is only the page's scroll and is left out. In a Safari tab the footer keeps 56pt clear of the floating keyboard toolbar, and the sheet's surface carries on below it. The keyboard opens by itself on "What did you do?" only in the Home Screen app | TEST | Safari doesn't support `interactive-widget=resizes-content`. Measured in the iOS Simulator (v0.12.2) |
| Fields in sheets | A focused field is brought wholly into sight, again once the keyboard is up; a box that appears on a tap takes the focus in that tap. Entry sheets fill the screen; footers are one row; text boxes never outgrow the room above the keyboard | TEST | v0.9 on the iPhone: "+ your own word" put its box behind Skip |
| The page behind a sheet | Locked while a sheet is open (`useScrollLock`), scroll position put back on close; `overscroll-behavior: contain` on the sheet | TEST | `showModal()` blocks taps, not scrolling |
| Never a blank screen | An error boundary: a lost database connection reloads once (at most once in 30 s); anything else shows "Something went wrong" with Reload. The database is checked on return from the background; a screen still waiting after 4 s offers Reload | TEST | iOS drops IndexedDB connections in the background (Dexie #2008, WebKit bugs) |
| React Aria for sheets | Not used yet; our own `Dialog` | WATCH | Solves iOS scroll lock and focus but had an open iOS 26 modal bug (#9172). Look again if the sheet breaks again |
| Layout checks | Every main screen and sheet, with the keyboard up over each text box, gets `expectCleanLayout` (our own, plus axe-core's WCAG AA rules) and a reference screenshot (`tests/e2e/screens.spec.ts`) | ADOPT | Owner, 2026-10-22: "I have to repeatedly tell you to fix things in the layout" |
| Testing in real iPhone Safari | Xcode's iOS Simulator (iPhone 17, iOS 27.0: the owner's phone). `npm run ios-check` (scripts/ios-check.py, with `npm run preview` running) walks Today's box (the writer) and search by meaning with the real keyboard, in a Safari tab and in the Home Screen app; checks a finger reaches each sheet button and the purpose drop-down is 24pt or more; saves screenshots to test-results/ios/; shuts the simulator down after. safaridriver can't reach the simulator (Xcode 27.1): look again with a later Xcode | ADOPT | Playwright's WebKit has no on-screen keyboard and none of iOS's scroll and focus behaviour, where most layout faults were |
| Driving the simulator | Meta's idb v1.7.6 (MIT): the companion from its GitHub release in ~/.local/share/idb/companion (sha256 f81e5ff131c8c91fb6927cb445a7267a4e80c543e51e4b26ebcaa00eff4e3c1f), the client `fb-idb==1.7.6` in its own venv at ~/.local/share/idb/venv. No Homebrew | ADOPT | Nothing shared on the Mac changes; deleting ~/.local/share/idb removes it. Check for a newer idb only when something breaks |

## Never

Check every new feature against these. Some were tried or weighed and turned down: the details are in git history.

| Never | Why |
|---|---|
| Ratings, scores, averages or scales, even worded ones | Owner: "I don't want any rating to be given"; natural responses only |
| Paywalls or subscriptions | The one complaint found for every major journaling app |
| Streaks, guilt or "x of 30" | Streak anxiety makes people quit |
| Nagging or push notifications | Reminders are calendar alerts you set; Web Push would need a server |
| Emoji moods; game loops (pets, points, energy meters) | Too generic to mean anything; a game loop rather than self-care |
| Anything leaving the phone without a tap: an AI reading each entry as it's saved, a server, prompts by WhatsApp | The founding privacy rule. Owner, 2026-10-24: keep it on the phone |
| Cloud backup or sync | Owner chose phone-only |
| Data loss | The most serious complaint about journaling apps; every upgrade is tested on a real old database |
| Crowded screens, long setup or a tips page | Word budgets guard this; the welcome, openers and empty states do the job of tips |
| Repeating prompts | Ours don't repeat within 30 days |
| Dark mode or an Appearance choice | Owner, 2026-10-24 |
| Swapping the hand-written CSS or the tested `Dialog` for a UI kit, drawer library or app generator (Ionic, Konsta, v0, bolt) | Each means rewriting every screen, and none runs iPhone Safari, where the bugs were |

## To prove on a real iPhone

Only the owner can check these. When one is confirmed, change its status to ADOPT; when a feature goes, delete its row.

| Item | Since | Status |
|---|---|---|
| The box: a tap opens the writer with the keyboard up; dictation and pasting; it saves as you type; an unfinished one carries on; feeling words on an earlier activity still change part by part | v0.15 | TEST |
| Evening question: answers save, ↻ Another, goal questions after setting a goal | v0.4 | TEST |
| Every update since v0.3 keeps all data | v0.3 | TEST |
| With the keyboard up: an entry's fields, "+ your own word", where, who and a next step stay in sight above Save; entry sheets fill the screen | v0.9.1 | TEST |
| In the Home Screen app, the writer stays in place with the keyboard up: Save above the keyboard, nothing of Today above the sheet (the iOS Simulator showed the keyboard bar over Save on the old activity writing step, 2026-10-24: for the layout pass) | v0.12.2 | TEST |
| Scrolling inside a sheet leaves the screen behind it still | v0.7.1 | TEST |
| The welcome (open the address in Safari: its storage is separate from the Home Screen app's); "Need a start?"; the colours, Today's list, serif titles, links and ⓘ circles | v0.7 | TEST |
| A purpose (it steers the evening question) | v0.9 | TEST |
| Switching to another app and back, even after hours, never shows a blank screen; an unfinished entry is still there | v0.8.1 | TEST |
| An entry read back after saving; tapping a part to change it; a next step kept; Logs search | v0.12.4 | TEST |
| Times on rows; swipe left, Delete, then Undo | v0.10 | TEST |
| Next steps: keep one; it's in Insights → Next steps; tick a one-off there ("I did it"); a look-alike asks "Same as …?"; add, change, merge, swipe to delete; older next steps are in the list | v0.11 | TEST |
| Review a period: copy into an AI chat app; share as a file; a free Groq key (More → AI review), Review with AI for a week and a month, an earlier review; the key shows only its last four characters; Remove key works | v0.12 | TEST |
| Insights, one page: tap a day on the chart, open a line and an entry behind it; What you're learning; Earlier weeks; a note carried into a week before v0.13 shows on that week | v0.13 | TEST |
| Search by meaning: turn it on from a search in Logs, the download, a search with none of an entry's words; "Only entries about this"; offline; More → Remove the download; no reload from running out of memory | v0.14 | TEST |
| Light only: with the iPhone set to Dark, the app and its status bar stay light | v0.14.1 | TEST |
