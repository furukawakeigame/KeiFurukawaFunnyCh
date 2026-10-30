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

## Adding a game

New games are **3D by default** (three.js from a CDN). Use 2D only when the idea clearly suits it better, and confirm with the owner first.

The full flow (企画 → 仕様 → 実装 → 確認 → デプロイ) is the `/make-game` skill in `.claude/skills/make-game/`. In short:

1. Put the game in `games/<game-name>/` with an `index.html` entry point (use relative paths for any assets), plus a square `icon.png` (512×512 recommended).
2. Copy an existing `<li>` in `index.html` (the icon-style one) and update the links (`games/<game-name>/`), icon path, title, and description. Every game on the top page shows its icon.

## View counts

Each game card on the top page shows its all-time Google Analytics page views. The browser can't read GA directly, so `.claude/ga-views.gs` runs as a free Google Apps Script web app (owner's Google account, Analytics Data API advanced service) and returns `{ "/games/<name>/": views }`, cached for 1 hour. Its deploy URL goes in `VIEWS_URL` in `index.html`; if empty, no counts are shown. When a game is renamed, add the old path to `OLD_PATHS` there so its past views carry over.

## Running locally

No build. Open `index.html` directly in a browser, or serve the folder so relative paths behave like production. This PC has no Python, so use the PowerShell server `.claude/serve.ps1` (also launchable as `site` from `.claude/launch.json`); elsewhere:

```
python -m http.server 8000
```

## Hosting (free)

Intended to be hosted on GitHub Pages: push to a public GitHub repo, then Settings → Pages → deploy from branch `main` / root. Every push to `main` updates the site. Because the site may be served from a subpath (`https://<user>.github.io/<repo>/`), always use relative links — never root-absolute paths like `/games/...`. The one exception is the share-card meta tags (`og:url`, `og:image`) in each game's `<head>`: crawlers like X need full `https://keifurukawafunnych.com/...` URLs there.
