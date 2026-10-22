# Life Design

A private daily journal for iPhone, built on *Designing Your Life* (Burnett & Evans) and Ikigai.

- **Journaling by purpose:** say what journaling is for (understand yourself, improve, learn, reach a goal, make sense of a hard time, everyday life, or just write). Reflect on an activity in a few taps, in words, never ratings: what it was like, what it did to your energy, how you felt, then one box to write in, with a few questions for your purpose as helpers. Or write freely. Every step after the first can be skipped, and unfinished entries are kept.
- **Learn from it:** after each entry, your entry read back and, only when several entries agree, a possible insight with the entries behind it. Find any entry again in Entries.
- **Review a period:** a week, a month or any range, copied for an AI chat of your choice, or reviewed in the app with your own free Groq key. Nothing is sent until you tap.
- **Next steps:** what you decide to do or try gathers in one list you can manage, once or ongoing, with an optional "when". A step comes back when you write about the same activity again.
- **Insights, put together for you:** each week is summed up from your entries (its energy day by day, what stood out, what gave and used up your energy, the feelings that came up, your next steps), with patterns over time. Nothing to fill in, and every line opens to the entries behind it.
- **An evening question:** a small joy, plus one question that changes each day and follows your purpose, sometimes about a pattern in your own days.

**Easy to start:** a short welcome, openers when a blank box stares back, and no streaks to keep.

**Privacy:** everything you log stays on your phone. There is no account, server or analytics. Data leaves the phone only when you choose to: an export, or a period you copy for an AI chat or send to the AI service you set up with your own key.

> Work in progress: features arrive in phases. See [DECISIONS.md](DECISIONS.md).

## Install on iPhone

1. Open https://shah-x.github.io/life-design/ in Safari.
2. Tap **Share → Add to Home Screen**, keep **Open as Web App** on, then tap **Add**.
3. Open it from the Home Screen. After the first open, it works offline.

## Development

Requires Node 22.12 or newer.

```sh
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run test:e2e   # end-to-end tests in WebKit at iPhone size
npm run screens    # every screen: layout check and reference screenshots, light and dark
npm run ios-check  # sheets in real iPhone Safari (iOS Simulator), with the app's preview running
npm run build      # production build
```

Pushing to `main` deploys to GitHub Pages through GitHub Actions.
