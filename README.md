# Life Design

A private daily journal for iPhone, built on *Designing Your Life* (Burnett & Evans) and Ikigai.

- **Journaling by purpose:** say what journaling is for (understand yourself, improve, learn, reach a goal, make sense of a hard time, everyday life, or just write). Reflect on an activity in a few taps, in words, never ratings: what it was like, what it did to your energy, how you felt, then one box to write in, with a few questions for your purpose as helpers. Or write freely. Every step after the first can be skipped, and unfinished entries are kept.
- **Learn from it:** after each entry, a short read-back in your words (what happened, what you noticed) and, only when several entries agree, a possible insight with the entries behind it. Keep a next step if you like, and find any entry again in Entries.
- **Insights, put together for you:** each week is summed up from your entries (its energy day by day, what stood out, what gave and used up your energy, the feelings that came up, your next steps), with patterns over time. Nothing to fill in, and every line opens to the entries behind it.
- **An evening question:** a small joy, plus one question that changes each day and follows your purpose, sometimes about a pattern in your own days.

**Easy to start:** a short welcome, openers when a blank box stares back, and no streaks to keep.

**Privacy:** everything you log stays on your phone. There is no account, server or analytics. Data leaves the phone only when you choose to export it.

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
npm run build      # production build
```

Pushing to `main` deploys to GitHub Pages through GitHub Actions.
