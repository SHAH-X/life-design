# Implementation roadmap

Owner-approved 2026-11-23. One step at a time; each stops for the owner's OK. Behaviour first, layout owed
(CLAUDE.md, "Layout last"). What exists now: [FEATURE_AUDIT.md](FEATURE_AUDIT.md).

Decisions: phone-only; the backup goes to the Mac by AirDrop only (no iCloud); the shrunk receipt copy is kept; bank data
goes to no AI, so money questions are answered by the phone (quick answers).

| Step | Priority | What | Status |
|---|---|---|---|
| 1 | P0 | Receipt approval gate; settings changes in transactions; AirDrop backup wording; restore tested at volume; this audit | Built as v0.53.0, committed, not yet deployed |
| 2 | P1 | Edit a receipt's figures keeping the original reading; audit log table; per-field accuracy script and more retailer fixtures (needs the owner's anonymised receipts) | Planned |
| 3 | P1 | Product table (brand, size, unit, per-unit price, exact vs approximate matches, last seen, regular list); a price-trend picture (mock first) | Planned |
| 4 | P1/P2 | Bank CSV import (a sample per bank); manual recurring items with annual cadence, renewal, notes, calendar-file reminders; budgets and quarterly reports | Planned |
| 5 | P2 | Documents: file, text, type, dates to confirm, links, expiry reminders as calendar files | Planned |
| 6 | P2 | Money quick answers on the phone; one quiet "on open" line for unusual spending and price rises | Planned |
| – | P3 | PDF receipts, full-size originals, an automation log | Not started |

Not planned: a server, sync, a desktop with shared data, several users (they break the founding rules).

Every new table is in the backup, raising its format (now 15), with a test on an old file.
