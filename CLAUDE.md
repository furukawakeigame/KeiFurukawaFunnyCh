# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Kei Furukawa's personal site for publishing self-made HTML games. Requirements from the owner: **zero cost** and **as simple as possible**. Keep it that way — no build step, no package.json, no backend. Libraries are OK when they help (e.g. three.js for 3D): load them from a free CDN with a pinned version (`<script type="importmap">` / `<script src>`), never via npm or a bundler.

## Communication

Always talk with the owner in Japanese (日本語で会話する), including progress updates and final reports.

## Structure

- `index.html` — top page; the game list is hand-written `<li>` entries in `<ul class="games">`.
- `style.css` — shared styling for the top page only.
- `games/<game-name>/index.html` — each game lives in its own folder and is fully self-contained (its own inline CSS/JS or files inside that folder). Games link back to the top page with `../../`.
- `.nojekyll` — tells GitHub Pages to serve files as-is.
- `404.html` — shown by GitHub Pages for any missing URL (at any depth), so its links/CSS use full `https://keifurukawafunnych.com/...` URLs. It lists the 6 newest games by reading `index.html` at runtime, so it needs no edits when games are added.
- `sitemap.xml` / `robots.txt` — for search engines. Every public page is listed in `sitemap.xml` (hand-written; old redirect folders are left out).

## Adding a game

New games are **3D by default** (three.js from a CDN). Use 2D only when the idea clearly suits it better, and confirm with the owner first.

The full flow (企画 → 仕様 → 実装 → 確認 → デプロイ) is the `/make-game` skill in `.claude/skills/make-game/`. In short:

1. Put the game in `games/<game-name>/` with an `index.html` entry point (use relative paths for any assets), plus a square `icon.png` (512×512 recommended). Also make a 192×192 `thumb.webp` from it — the top page list shows the thumb (with `loading="lazy"`) so it stays light; `icon.png` is still used for the favicon and share card.
2. Copy an existing `<li>` in `index.html` (the icon-style one) and update the links (`games/<game-name>/`), icon path, title, and description. Every game on the top page shows its icon.
3. Add the game's URL to `sitemap.xml`, and give the game page a `<meta name="description">` (same one-liner as the top page) and `<link rel="canonical">`, a `VideoGame` JSON-LD block, and one `<h1>` with the game title (visually hidden if the game shows no title), with the game itself wrapped in `<main>`. The top-page icon's `alt` is the game title. No `og:description` — share cards stay title + icon only.

People in games use the realistic human model `.claude/skills/make-game/human.js` (copy it into the game folder; preview with `human-preview.html` next to it), not primitive-shape dolls.

## Ads (AdSense)

- Non-game pages (`index.html`, `about.html`, `privacy.html`, `404.html`) load the AdSense script (`ca-pub-6939356439579496`); ads there come from AdSense Auto ads (switched on in the dashboard). Because `ad.js` also loads the AdSense script on game pages, `/games/` must be excluded from Auto ads in the AdSense dashboard (otherwise Auto ads would also appear inside games).
- **Result-screen banner** (owner's decision, knowing AdSense discourages display ads near games): every game with a result screen loads the shared `ad.js` at the end of `<body>` — the one exception to "games are self-contained", so the ad unit ID lives in one place (`SLOT` in `ad.js`; empty = no ads anywhere). See the comment at the top of `ad.js`:
  - `data-result="<selector>"`: the ad shows while that element is visible.
  - No result element: call `window.resultAd?.(isResult)` from the game loop instead.
  - Without `data-inline` (older games), while the ad shows, `ad.js` visually shrinks everything except the header toward the bottom-center (CSS `scale`/`translate`, no relayout) and puts the ad in the freed strip under the header, so the ad never covers the game, the result or the 見せ場, and stays far from the buttons (AdSense policy: no ads over content, none next to buttons).
  - One ad per page view (never refreshed), loaded only at the first result, not shown on screens shorter than 600px.
  - **Default for new games (owner's decision): `data-inline="<selector>"`** — instead of shrinking the page, `ad.js` puts the ad inside that empty slot in the result panel. Put the slot above the result text so the buttons stay ≥150px away, and reserve its height so nothing shifts when the ad appears (see the comment in `ad.js`; `games/slingshot-wave` uses this).
- Toy/maker games without a result screen get no ad. Full-screen ads before the result (H5 Games Ads, `adBreak()`) need a separate approval the owner applied for.

## View counts

Each game card on the top page shows its all-time Google Analytics page views. The browser can't read GA directly, so `.claude/ga-views.gs` runs as a free Google Apps Script web app (owner's Google account, Analytics Data API advanced service) and returns `{ "/games/<name>/": views }`, cached for 1 hour. Its deploy URL goes in `VIEWS_URL` in `index.html`; if empty, no counts are shown. When a game is renamed, add the old path to `OLD_PATHS` there so its past views carry over.

## Rankings

Games can have a ranking with two tabs: today (resets at 0:00 JST) and all time, top 10 each, best score per device only. `.claude/ranking.gs` is a free Google Apps Script web app bound to a Google Sheet in the owner's account (setup steps at the top of the file); scores are rows in its `scores` sheet, so a bad name or fake score is removed by deleting the row. It accepts only games listed in `GAMES` there. Anti-cheat: the game gets a one-time token at the first input (`act:'start'`) and reports every cleared wave (`act:'wave'`); the server checks real elapsed time per wave, waves in order, and kills against the wave's enemy count (`RULES` in `ranking.gs` must match the game's `startWave`/`spawnInterval` — update both together), then accepts one `act:'submit'`. Also NG-word names, max wave 150, rate limits, a daily cap, and a `ban` sheet (names or device ids). In the game, put the deploy URL in `RANK_URL` (empty = no ranking button) and POST with `Content-Type: text/plain` (avoids the CORS preflight). Bots that really play can't be stopped; that's accepted. Distance games (`DIST` in `ranking.gs`, e.g. `wheel-road` / `wheel-road-2p`) use a different check: `start` also returns the road seed (the server picks the road), the first input sends `go`, every 100m sends `cp` (server checks real time per 100m against top speed and average speed since `go`), then one `submit` with the distance; duo entries are stored as `name1&name2`.

## Running locally

No build. Open `index.html` directly in a browser, or serve the folder so relative paths behave like production. This PC has no Python, so use the PowerShell server `.claude/serve.ps1` (also launchable as `site` from `.claude/launch.json`); elsewhere:

```
python -m http.server 8000
```

## Hosting (free)

Intended to be hosted on GitHub Pages: push to a public GitHub repo, then Settings → Pages → deploy from branch `main` / root. Every push to `main` updates the site. Because the site may be served from a subpath (`https://<user>.github.io/<repo>/`), always use relative links — never root-absolute paths like `/games/...`. The exceptions are the share-card meta tags (`og:url`, `og:image`) and `<link rel="canonical">` in each page's `<head>`, plus `sitemap.xml`/`robots.txt` and `404.html`: crawlers like X and search engines need full `https://keifurukawafunnych.com/...` URLs there.
