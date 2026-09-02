# Sleeper League HQ

Production-ready static dashboard for Sleeper league `1339982718628274176`.

## Deploy

### GitHub Pages
1. Create a new GitHub repository.
2. Upload `index.html`, `styles.css`, `app.js`, and `manifest.webmanifest`.
3. In GitHub: Settings → Pages → Deploy from branch → `main` / root.
4. Share the resulting URL.

### Netlify / Vercel
Upload the folder as a static site. No build command is required.

## What it does

- Pulls live league, roster, manager, matchup, NFL state, playoff and transaction data from Sleeper.
- Refreshes automatically every 5 minutes.
- Caches Sleeper's large NFL player map for 24 hours in the browser.
- Responsive mobile/desktop layout.
- Standings, matchups, team rosters, transactions and playoff bracket.
- Dark/light mode.
- Share-link button.
- No secrets or API keys are required.

## Important

Sleeper's API is read-only. This site is a public dashboard and does not make roster, waiver, trade, or lineup changes.

For production use, deploy over HTTPS through GitHub Pages, Netlify, Vercel, Cloudflare Pages, or another static host.
