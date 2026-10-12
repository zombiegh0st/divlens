# DivLens

Minimal, local-first portfolio viewer (PWA). Imports a Trade Republic CSV export and shows the portfolio like the depot view of Trade Republic or Scalable: one graph (optionally including received dividends), the positions below it, and a detail view per position.

Requirements (German):
- `docs/aenderungsauftrag-v2.md`: graph overview, price history. **Wins on any conflict.**
- `docs/pflichtenheft.md`: original spec, still valid where v2 does not override it.

If this file and the specs conflict, ask before deciding.

## Hard constraints

- Vanilla HTML/CSS/JS, ES modules. No framework, no bundler, no build step.
- No backend. Static hosting on GitHub Pages must work as-is.
- All data stays in the browser (IndexedDB). Nothing is uploaded anywhere.
- Zero maintenance: the app must stay usable without any external price service (fallback graph, manual price).
- All source code, comments, identifiers, commit messages and README in English.
- UI language: German.
- Minimal and spartan UI, mobile-first. Do not add features outside the scope below.

## Scope v2

Done in v1 and unchanged: parser, dedup, database, import (add / start fresh), backup, dividends list, transactions list, offline PWA.

v2 adds:
- **Overview (start page):** total result in EUR and %, one graph of the portfolio value over time, period chips `1W 1M 3M YTD 1J Max` (affect graph and headline), options "Dividenden einrechnen", "brutto" (only effective while dividends are included, default net) and "Dividendenrendite anzeigen". Below: positions with name, current value, result EUR / %, sorted by value. Closed positions via switch.
- **Graph:** market value of all positions over time; with dividends included the line is value + cumulative dividends. Finger/mouse marker shows date and value.
- **Position detail** (tap on a position): same graph, periods and options for this position only. Figures: shares, average buy price, current value, result EUR / %, dividends received, dividend yield. Lists of its dividends (date, amount) and its buys/sells.
- **Navigation:** overview is the start page; Dividenden, Umsätze, Import, Daten move into a menu.

Out of scope (backlog): other brokers, XIRR, FIFO, depot transfers, dividend calendar, annualized dividend yield, sector/country weighting, tax reports, any backend.

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
| Dividend yield (personal) | D / I, shown in % ("Dividendenrendite"; v1 called it dividend quota) |

- The toggle only adds or removes D in total result and performance. D is always shown separately.
- Without a price, W is unknown: show dividend quota and realized result only, never guess a price.
- Closed positions (shares = 0) are hidden by default via a switch. Their dividends still count in totals.
- Example: NVIDIA, buy 149.10 + 1.00 fee, sell 184.20 - 1.00 fee, W = 0 -> price result +33.10 EUR (+22.1 %).

### Time series and periods (v2)

| Value | Definition |
|---|---|
| Value(t) | Shares(t) x close(t), in EUR |
| Cum. dividends(t) | Sum of all dividends up to t (net or gross) |
| Result (Max) | Value + proceeds + dividends - invested |
| Percent (Max) | Result / invested |
| Result (period) | Value(end) - Value(start) - buys + sells in period (+ dividends in period, if on) |
| Percent (period) | Result / (Value(start) + buys in period) |

- Period percent is a deliberate simplification (no XIRR). Pin the formula with a test.
- Foreign currency: USD closes are converted with the EUR/USD daily rate. The FX effect is part of the result, as at TR.
- Buys incl. fee, sells minus fee (as before).

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

## Price history

No price history, no graph. Rules:
- Cache daily closes per position and EUR/USD in IndexedDB. Fetch only missing days, at most once per day.
- Providers behind `getDailyHistory(symbol, from, to)`:
  - First choice: [Twelve Data](https://twelvedata.com). Verified by the spike (2026-10-12, free "basic" plan): 800 credits/day, 8/minute, about 1 credit per `time_series` call.
  - Maybe later: [Alpha Vantage](https://www.alphavantage.co) (free plan 25 calls/day; full history may not be free).
  - Dropped: Finnhub (candles not in the free plan).
- Symbol mapping ISIN -> symbol is editable in "Daten", with a suggestion from the provider's symbol search. Expected symbols: MAIN, ARCC, HTGC, CSWC (US), MUV2 (Xetra).

Spike results (Twelve Data, free plan):
- Browser access works: CORS OK, key sent as header `Authorization: apikey <key>`.
- MAIN, ARCC, HTGC, CSWC: full daily history in USD. `EUR/USD`: daily, including weekends.
- MUV2 on Xetra: not in the free plan (needs "Grow"). Decision: MUV2 uses the fallback below (no ADR workaround, no paid plan).
- Credit headers are not readable from the browser; use `/api_usage` for usage.
- EUR conversion: USD close / EUR/USD close of the same day; carry the last known rate over missing days.
- Today's bar may not be final: do not cache it as a close, refetch it next time.
- Respect rate limits: batch requests, show progress, stop cleanly on a limit error and resume on next open.
- Fallback without key or without prices for a position:
  - Graph from transactions: "invested" as a step line plus cumulative dividends.
  - UI hint: "Keine Kurshistorie, Marktwert nicht verfügbar" (instead of "Kurs fehlt").
  - Manual current price stays possible.
- Do not add Yahoo endpoints or third-party CORS proxies.

## API key (bring your own)

- Never hardcode the key. Never put it in the repo, a URL, logs, error messages or the backup export.
- Enter it in a password input field.
- App: store it locally in the settings area ("Daten"). It never leaves the browser except in requests to the chosen provider.
- Send it as an HTTP header if the provider supports that, not as a URL parameter.
- No server, no proxy.

## Storage and persistence

- IndexedDB for transactions, prices, price history, settings.
- Call `navigator.storage.persist()` on first run.
- Remind the user to export a JSON backup periodically.

## Testing

- Use `test/fixtures/tr-export.csv` (anonymized real export) as the parser fixture.
- Parser tests must cover: buy with fee, sell with negative shares, dividend with tax and FX, ignored transfers, duplicate re-import, unknown type.
- Metric tests: use the NVIDIA example above plus dividend gross/net checks.
- v2: cover every rule in "Time series and periods" with tests.
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
  aenderungsauftrag-v2.md
spike/            throwaway test pages, not part of the app or the service worker
```

## Working agreements

- Keep it small. Prefer fewer files and less code over abstractions.
- Ask before adding dependencies.
- Graph: prefer an own SVG line chart without dependencies if it stays small (roughly under 150 lines). Otherwise [uPlot](https://github.com/leeoniya/uPlot), stored locally in the repo (no CDN); ask before adding it.
- Dark and light theme follow the system setting.
- Money values: store as integer cents or use a decimal-safe approach; never accumulate floats.
- Dates as ISO strings (`YYYY-MM-DD`); display in German format.

## Milestones v2

| Step | Content |
|---|---|
| 0 | Done: spike `spike/index.html` (results under "Price history") |
| 1 | Data layer: price history cache, daily values from transactions, calculation rules with tests |
| 2 | Overview with graph, period chips, options |
| 3 | Position detail |
| 4 | Fallback without prices |
| 5 | Navigation cleanup, existing tabs into the menu |

Acceptance: with `test/fixtures/tr-export.csv` the graph starts 2026-03-23; "Dividenden einrechnen" and brutto/netto visibly change the line; tapping a position shows its own graph; without a key the fallback with hint appears; all rules in "Time series and periods" are tested.

## Git workflow

- Never commit directly to `main`.
- Create one branch per feature or fix (`feat/<name>`, `fix/<name>`) before changing code.
- Commit in small steps with clear English messages.
- Do not merge or push to `main`; leave merging to the user.
