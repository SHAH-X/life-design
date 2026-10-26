# Life Design

A private daily journal for iPhone, built on *Designing Your Life* (Burnett & Evans) and Ikigai.

- **One box for anything:** "What's on your mind?" A thought, a worry, a plan, notes from the day: no title, no category, no form. Type, dictate or paste; it saves as you go, and unfinished writing is kept. Once you turn it on, what you write sorts itself into life areas (Money, Work, Health and more) by what it's about, on the phone. Activities reflected on in earlier versions stay, and each part can still be changed.
- **Photos too:** add a receipt, a note or a page to what you write, or let a photo be the whole entry. Once you turn it on, the phone reads the text in it, so you can find it by its words. With Gemini or OpenAI set up (in More → AI review, or for photos alone in More → Reading photos, so a free Groq key can do the asking), receipts also go to it, to read each item and the total; any other photo only when you tap "Read with AI", which gives what's printed on it as it's laid out (code, a chart's printed values, a page).
- **Ask your journal:** in the Ask tab, type a question ("What groceries did I buy this month?") and tap Ask: your AI answers from your entries and receipts, while the phone does every total and points out any amount the AI wrote itself. Nothing is sent until you tap, and you can see what was.
- **Money:** in its own tab, what came in and went out of your accounts, from the bank and card statements you bring in (PDFs, read on the phone and sent nowhere): this month so far next to last month by the same day, where spending rose, regular payments, money out and in by payee, with money moved between your own accounts left out (Monzo Flex, pots, transfers, payees you say are yours). Then what you spent from the receipts in your photos, worked out on the phone with no AI: each month, each shop (a chain's names as one), price changes at the same shop, by kind (dairy and eggs, fruit and veg…) when your AI reads the receipt, what you buy again and again, and receipts to check. Every line opens to what it counts; every receipt item can go to a spreadsheet through the share menu.
- **A question from your own writing:** on some days, one question above the box about something you said you'd do and haven't written about since, a next step left for weeks, or a part of life gone quiet. Worked out on the phone; answer it, or "Not now".
- **Learn from it:** after each entry, your entry read back and, only when several entries agree, a possible insight with the entries behind it. Find any entry again in Logs, by its words or, once you turn it on, by what it's about (a small model on the phone: nothing is sent).
- **Review a period:** a week, a month, all time or any range (or only the entries about a question), copied for an AI chat of your choice, or reviewed in the app with your own free Groq or Gemini key. Nothing is sent until you tap.
- **Next steps:** what you decide to do or try gathers in one list you can manage, once or ongoing, with an optional "when".
- **Insights, put together for you:** one page. Your week (what each day held for your energy, what stood out, the feelings that came up), your life areas over the last 30 days, then the last 30 days in words (what gives and uses up your energy, when time flew, the places, people and times that usually went one way), then what you're learning and your next steps. Nothing to choose or fill in, and every line opens to the entries behind it.
- **An evening question:** a small joy, plus one question that changes each day and follows what you journal for (understand yourself, improve, learn, reach a goal, make sense of a hard time, everyday life), sometimes about a pattern in your own days.

**Easy to start:** a short welcome, openers when a blank box stares back, and no streaks to keep.

**Privacy:** everything you log stays on your phone. There is no account, server or analytics. Data leaves the phone only when you choose to: an export, or a period you copy for an AI chat or send to the AI service you set up with your own key (a review takes a photo's text, never the image). The one thing that goes by itself: with Gemini or OpenAI set up, receipt photos go to it as you add them, until you turn "Read receipts with AI" off.

> Work in progress: features arrive in phases. See [DECISIONS.md](DECISIONS.md).

## Install on iPhone

1. Open https://shah-x.github.io/life-design/ in Safari.
2. Tap **Share → Add to Home Screen**, keep **Open as Web App** on, then tap **Add**.
3. Open it from the Home Screen. After the first open, it works offline.

## Development

Requires Node 22.13 or newer.

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run test:e2e   # end-to-end tests in WebKit at iPhone size
npm run screens    # every screen: layout check and reference screenshots
npm run ios-check  # sheets in real iPhone Safari (iOS Simulator), with the app's preview running
npm run build      # production build
```

Pushing to `main` deploys to GitHub Pages through GitHub Actions.
