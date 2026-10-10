# DivLens

Minimal, local-first portfolio viewer (PWA). Imports a Trade Republic CSV export and shows performance relative to the invested amount, optionally including dividends. All data stays in the browser (IndexedDB).

**Open the app:** https://zombiegh0st.github.io/divlens/

## Run

No build step. Serve the folder statically, e.g.:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. GitHub Pages works as-is.

## Test

Requires Node 20+ (no dependencies):

```sh
npm test
```

## Structure

| Path | Purpose |
|---|---|
| `src/csv.js` | CSV reader, decimal-to-cents |
| `src/parsers/tr.js` | Trade Republic parser (`detect`, `parse`) |
| `src/import.js` | Parser registry, deduplication |
| `src/metrics.js` | Performance and dividend metrics |
| `src/db.js` | IndexedDB storage, JSON backup |
| `src/prices.js` | Prices behind `getQuote(isin)` (manual in v1.0) |
| `src/ui/` | UI and SVG chart |
| `sw.js` | Offline cache |

Requirements: `docs/pflichtenheft.md`.
