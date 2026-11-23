# Implementation roadmap

Owner-approved 2026-11-23. One step at a time; each stops for the owner's OK. Behaviour first, layout owed
(CLAUDE.md, "Layout last"). What exists now: [FEATURE_AUDIT.md](FEATURE_AUDIT.md).

Decisions: phone-only; the backup goes to the Mac by AirDrop only (no iCloud); the shrunk receipt copy is kept; bank data
goes to no AI, so money questions are answered by the phone (quick answers).

| Step | Priority | What | Status |
|---|---|---|---|
| 1 | P0 | Receipt approval gate; settings changes in transactions; AirDrop backup wording; restore tested at volume; this audit | Live (v0.53.0) |
| 2 | P1 | Edit a receipt's figures keeping the original reading; audit log table; per-field accuracy script and more retailer fixtures (needs the owner's anonymised receipts) | Built as v0.54.0; the retailer fixtures wait for the owner's anonymised receipts (none can be provided yet) |
| 3 | P1 | Product list with sizes, per-unit prices, your "Same product" joins, last-seen dates, a regular list and a price picture (mock first) | Built as v0.55.0 (brand and a basket total are not) |
| 4 | P1/P2 | Manual recurring items with annual cadence, renewal, notes, calendar-file reminders; budgets and quarterly reports; bank CSV import (a sample per bank) | Bills, budgets and quarters built as v0.56.0; CSV import waits for sample files |
| 5 | P2 | Documents: file, text, type, dates to confirm, links, expiry reminders as calendar files | Built as v0.57.0 (OCR of scanned PDFs and meaning search are not) |
| 6 | P2 | Money quick answers on the phone; one quiet "on open" line for unusual spending and price rises | Built as v0.58.0 |
| – | P3 | PDF receipts, full-size originals, an automation log | Not started |

Not planned: a server, sync, a desktop with shared data, several users (they break the founding rules).

Every new table is in the backup, raising its format (now 19), with a test on an old file.
