# Spending Tracker

A single-page website for the monthly finance routine behind the **Finances 26'** Notion
page: drop in the PDF statements, review what it read, push the report to Notion.

No build step, no server, no dependencies to install. Bank statements are parsed in the
browser with a locally vendored copy of pdf.js — no file, and no transaction, is ever
uploaded anywhere.

## Running it

Any static file server works, because it is just HTML and ES modules:

```bash
python3 -m http.server 8080     # then open http://localhost:8080
```

To put it online, push this repo and enable **GitHub Pages** on the branch (Settings →
Pages → deploy from branch, root folder). Vercel or Netlify work with zero config too.
Because the data lives in the browser's `localStorage`, the app is per-device: use the
same browser each month, or move data with the backup export.

## The monthly routine

1. **Importar** — drag in the PDFs from Wise personal, Wise business, Trade Republic,
   Sabadell, Santander and OpenBank. The bank is detected from the file, the lines are
   parsed, and each row is categorised by rule.
2. **Review** — every parsed row is shown before anything is saved. Fix a category, flip a
   row to 50%, correct an amount, or hit **＋regla** to teach it a merchant so next month
   is automatic. Rows it read with low confidence are marked in amber.
3. **Confirmar e importar** — rows are committed. Re-importing the same statement is
   safe: rows are de-duplicated by date + account + amount + description.
4. **Resumen** — the month's totals, category breakdown, fixed vs variable, and balance.
   Fill in the optional account balances and observations.
5. **Enviar a Notion** — creates a child page under *Finances 26'* laid out like your
   monthly template.

## Rules it applies

Taken from the "Reglas de procesamiento" block in your Notion template:

- **Tricount / shared costs** — OpenBank defaults to 50%, and rules for rent utilities,
  nursery, Adeslas and the car set 50% individually. Per-row override in the table.
- **Currency** — everything converts to EUR at the rates in Ajustes (£1 = €1,17,
  $1 = €0,92 by default, matching Notion).
- **Exclusions** — S&P 500 / Tesla investments, cashback, interest, Envío a Galicia and
  Inversión Oli are excluded by rule. Transfers between your own accounts are detected
  automatically: an outgoing amount that reappears on another account within four days is
  paired and both sides excluded.
- **Amazon** — deliberately parked in *Other* and flagged for review, since your Notion
  rules say to categorise it by context.

Every rule is editable in **Ajustes**, and rules you add there beat the built-in ones
because they are inserted at the top (first match wins).

## Notion write-back

In **Ajustes**, paste an internal integration token from
[notion.so/my-integrations](https://www.notion.so/my-integrations) and share the
*Finances 26'* page with that integration. The parent page ID is pre-filled with the
Finances 26' page.

Two things to know:

- The token is stored in this browser's `localStorage` in plain text — same as any
  browser-stored session. Don't do this on a shared machine, and revoke the token in
  Notion if the device is lost.
- Whether a static page can call `api.notion.com` directly depends on Notion serving CORS
  headers to browsers, which **could not be verified from the sandbox this was built in**
  (the network policy blocks that host). If the call is blocked, the app says so and falls
  back to **Copiar markdown**, which produces tables that paste into Notion as native
  tables. That fallback is tested and works regardless.

## Historical data

**Histórico** is seeded from your Notion pages so trends have context from day one.
Expenses come verbatim from *Balance 2025 — Datos oficiales de tu tracker* and
*Histórico completo*. The 2025 **income** column is derived, not quoted: Notion lists that
year's freelance income per month in GBP and gives only a net annual EUR total, so each
month is converted at the £1 = €1,14237 rate stated on that page. Any month you import
here replaces the Notion figure for that month.

## Backups

Everything is in `localStorage`, so clearing site data wipes it. **Ajustes → Exportar
backup** writes a JSON file with all transactions, rules and settings; **Restaurar
backup** reads it back. Worth doing after each month's import.

## Known limits

- **Scanned PDFs won't work.** Parsing needs a text-layer PDF. Image-only scans are
  detected and reported rather than silently producing nothing; export a text PDF or use
  the paste-text box.
- **The parsers were built without real statements from your banks.** They were tested
  against synthetic lines in each bank's format, and the tolerant date/amount scanner
  handles both European (1.234,56) and Anglo (1,234.56) numbers. Expect to correct some
  rows on the first real import — that is what the review step is for. If one bank reads
  badly, the fix is in `js/parsers.js` (`BANKS` config), and sending a sample line makes
  it a one-line change.
- **Wise multi-currency**: statements are per-currency, so set the currency column in the
  review table if a GBP statement is read as EUR.

## Layout

```
index.html            shell + nav
app.css               styles (light/dark, follows the OS)
js/config.js          accounts, categories, seed rules, FX defaults
js/store.js           state + localStorage + backup
js/pdftext.js         PDF → text lines (pdf.js)
js/parsers.js         statement line parsing per bank
js/categorize.js      rule engine + internal-transfer detection
js/aggregate.js       monthly totals, category rollups, formatting
js/notion.js          markdown + Notion blocks + API calls
js/seed.js            historical months pulled from Notion
js/views/             resumen · importar · movimientos · historico · ajustes
vendor/               pdf.js (vendored, no CDN)
```
