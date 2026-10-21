# Life Design

A private daily journal for iPhone, built on *Designing Your Life* (Burnett & Evans) and Ikigai.

- **Good Time Journal:** each evening, log your main activities by describing them in feeling words, never ratings: what was it like, and how did it leave you? The app works out the patterns and tells you in words.
- **An evening question:** a small joy, plus one question that changes each day (feel calmer, grow, reach a goal, learn), sometimes about a pattern in your own days.
- **Reviews on your schedule:** balance gauges, your best and worst moments, and an optional AI review using the AI of your choice.
- **Life design:** Odyssey Plans, an Ikigai map, Workview and Lifeview, and small experiments to try.

**Privacy:** everything you log stays on your phone. There is no account, server or analytics. Data leaves the phone only when you choose to export it or send a review to an AI.

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
