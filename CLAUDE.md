# DivLens

Minimal, local-first portfolio viewer (PWA). Imports a Trade Republic CSV export and shows performance relative to the invested amount, with dividends optionally included.

Full requirements: `docs/pflichtenheft.md` (German). If this file and the spec conflict, ask before deciding.

## Hard constraints

- Vanilla HTML/CSS/JS, ES modules. No framework, no bundler, no build step.
- No backend. Static hosting on GitHub Pages must work as-is.
- All data stays in the browser (IndexedDB). Nothing is uploaded anywhere.
- Zero maintenance: the app must be fully usable without any external price service.
- All source code, comments, identifiers, commit messages and README in English.
- UI language: German.
- Minimal and spartan UI, mobile-first. Do not add features outside the scope below.

## Scope v1.0

In scope:
- Trade Republic CSV import (add mode and "start fresh" mode)
- Deduplication, positions list, dividends view
- Performance in EUR and %, per position and total
- Toggle: include dividends in performance on/off
- JSON backup export/import
- Offline PWA (service worker, manifest)

Out of scope (backlog): other brokers, XIRR, FIFO, depot transfers, dividend calendar, sector/country weighting, tax reports, any backend.

## Metrics (per position, and summed for the total)

| Symbol | Definition |
|---|---|
| I | Sum of all buys incl. fees |
| E | Sum of all sells minus fees |
| W | Current price x current shares |
| D | Dividends received, net (default) or gross |
| Price result | W + E - I |
| Total result | Price result + D |
| Performance % | Result / I |
| Dividend quota | D / I |

- The toggle only adds or removes D in total result and performance. D is always shown separately.
- Without a price, W is unknown: show dividend quota and realized result only, never guess a price.
- Closed positions (shares = 0) are hidden by default via a switch. Their dividends still count in totals.
- Example: NVIDIA, buy 149.10 + 1.00 fee, sell 184.20 - 1.00 fee, W = 0 -> price result +33.10 EUR (+22.1 %).

## Trade Republic CSV

Real file structure (header row, quoted fields, `.` decimal separator):

| Field | Use |
|---|---|
| `transaction_id` | Dedup key (UUID). Unique per row. |
| `date` | Transaction date |
| `type` | `BUY`, `SELL`, `DIVIDEND` are used. `TRANSFER_*` ignored in v1.0. |
| `symbol` | Contains the ISIN, not a ticker |
| `name` | Display name |
| `shares` | Negative on `SELL`. On `DIVIDEND` it is the holding at payout. |
| `amount` | Buy/sell: excludes fee. Dividend: **gross** in EUR. |
| `fee` | Separate, negative. Cost basis = amount + fee. |
| `tax` | Dividends: separate, negative. Net = amount + tax. |
| `original_amount`, `original_currency`, `fx_rate` | Foreign-currency dividends |

Rules:
- Ignore and never store personal fields: `description`, `counterparty_name`, `counterparty_iban`, `payment_reference`.
- Unknown `type` values are reported to the user, not silently dropped.
- Parser errors are reported per row; one bad row must not abort the import.
- Keep the parser behind an interface so more brokers can be added later:
  - `detect(file) -> boolean`
  - `parse(file) -> Transaction[]`

## Deduplication

- Use `transaction_id` as the primary key in IndexedDB.
- Re-importing the same file must create 0 new records.
- Overlapping exports merge cleanly.
- Show an import preview before writing: new / duplicates / errors.

## Import modes

- **Add** (default): insert new rows, skip duplicates.
- **Start fresh**: delete all transactions, then import.
  - Confirmation dialog showing the number of records to be deleted.
  - Offer an automatic JSON backup download first.
  - Keep settings and price data.

## Prices

- Manual price per position is always available.
- Optional bring-your-own API key (stored locally, never exported or logged):
  [Twelve Data](https://twelvedata.com), [Finnhub](https://finnhub.io), [Alpha Vantage](https://www.alphavantage.co).
- Put providers behind `getQuote(isin)`. Mapping ISIN -> ticker is user-editable.
- History = value snapshots stored locally whenever the app is opened or prices are updated. Show gaps honestly in charts.
- Do not add Yahoo endpoints or third-party CORS proxies.

## Storage and persistence

- IndexedDB for transactions, prices, snapshots, settings.
- Call `navigator.storage.persist()` on first run.
- Remind the user to export a JSON backup periodically.

## Testing

- Use `test/fixtures/tr-export.csv` (anonymized real export) as the parser fixture.
- Parser tests must cover: buy with fee, sell with negative shares, dividend with tax and FX, ignored transfers, duplicate re-import, unknown type.
- Metric tests: use the NVIDIA example above plus dividend gross/net checks.
- Never commit real names, IBANs or unredacted exports.

## Suggested structure

```
index.html
manifest.webmanifest
sw.js
src/
  parsers/tr.js
  db.js
  metrics.js
  prices.js
  ui/
test/
  fixtures/
docs/
  pflichtenheft.md
```

## Working agreements

- Keep it small. Prefer fewer files and less code over abstractions.
- Ask before adding dependencies. Charts: [uPlot](https://github.com/leeoniya/uPlot) or [Chart.js](https://www.chartjs.org), loaded locally (no CDN) so the PWA works offline.
- Money values: store as integer cents or use a decimal-safe approach; never accumulate floats.
- Dates as ISO strings (`YYYY-MM-DD`); display in German format.

## Git workflow

- Never commit directly to `main`.
- Create one branch per feature or fix (`feat/<name>`, `fix/<name>`) before changing code.
- Commit in small steps with clear English messages.
- Do not merge or push to `main`; leave merging to the user.
