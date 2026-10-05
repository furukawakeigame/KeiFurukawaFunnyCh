# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Kei Furukawa's personal site for publishing self-made HTML games. Requirements from the owner: **zero cost** and **as simple as possible**. Keep it that way — no frameworks, no build step, no package.json, no backend.

## Structure

- `index.html` — top page; the game list is hand-written `<li>` entries in `<ul class="games">`.
- `style.css` — shared styling for the top page only.
- `games/<game-name>/index.html` — each game lives in its own folder and is fully self-contained (its own inline CSS/JS or files inside that folder). Games link back to the top page with `../../`.
- `.nojekyll` — tells GitHub Pages to serve files as-is.

## Adding a game

1. Put the game in `games/<game-name>/` with an `index.html` entry point (use relative paths for any assets).
2. Copy an existing `<li>` in `index.html` and update the link (`games/<game-name>/`), title, and description.

## Running locally

No build. Open `index.html` directly in a browser, or serve the folder so relative paths behave like production:

```
python -m http.server 8000
```

## Hosting (free)

Intended to be hosted on GitHub Pages: push to a public GitHub repo, then Settings → Pages → deploy from branch `main` / root. Every push to `main` updates the site. Because the site may be served from a subpath (`https://<user>.github.io/<repo>/`), always use relative links — never root-absolute paths like `/games/...`.
