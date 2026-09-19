# PubMed Article Explorer

A Chrome/Edge (Manifest V3) browser extension for searching biomedical
literature by keyword, seeing how a result relates to similar articles, and
getting a short report on any article — all backed by NCBI's PubMed database.

## Features

- **Keyword search** against PubMed (NCBI E-utilities), sortable by relevance
  or recency, with paging.
- **Tap-to-search anywhere**: highlight a word or phrase on any webpage and a
  "Search PubMed" button appears next to the selection; a right-click context
  menu entry does the same.
- **Related articles**: each result can be expanded to show PubMed's own
  "similar articles" ranking (via `elink`/`neighbor_score`), so you can see
  how a paper relates to the surrounding literature.
- **Short report per article**: an instant, no-network extractive summary
  (background / key finding / conclusion) is always available. If you add
  your own Anthropic API key in Settings, a one-click "✨ AI report" button
  generates a short Claude-written brief instead.

## Loading the extension (development)

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension and click its icon, or highlight text on any page.

## Settings

Click the ⚙ icon in the popup (or the extension's "Details → Extension
options") to configure:

- **NCBI API key / contact email** (optional) — raises the E-utilities rate
  limit from 3 to 10 requests/second. Get a free key from your
  [NCBI account settings](https://www.ncbi.nlm.nih.gov/account/settings/).
- **Anthropic API key** (optional) — enables the AI report button. Stored
  only in this browser's local extension storage and sent only to
  `api.anthropic.com` when you click "AI report". Get a key from the
  [Anthropic Console](https://console.anthropic.com/).

Without any keys configured, search, related articles, and the extractive
report all work out of the box.

## Architecture

- `background.js` — MV3 service worker; owns the context menu and all
  network calls (NCBI + Anthropic), so requests stay rate-limited/throttled
  in one place regardless of which UI triggered them.
- `lib/ncbi.js` — thin E-utilities client (`esearch`/`esummary`/`efetch`/`elink`).
  Abstracts are pulled out of PubMed's XML with regex rather than `DOMParser`,
  since service workers have no DOM.
- `lib/anthropic.js` — optional AI report via the Messages API, using the
  user's own key.
- `lib/extractive.js` — dependency-free heuristic summary used as the default
  report and as a fallback if the AI call fails.
- `popup.html/js/css` — the main UI. It doubles as a full-page tab (opened by
  the context menu / text-selection button) so a search triggered from any
  webpage lands on the same interface.
- `content.js/css` — detects text selections on any page and offers a
  "Search PubMed" button next to them.
- `options.html/js` — settings page for the optional API keys.

## Notes

- Uses NCBI's public E-utilities REST API — no NCBI account required for
  basic use.
- The extension requests the `<all_urls>` content-script match only to
  detect text selections; it does not read or transmit page content beyond
  the selected text you choose to search for.
