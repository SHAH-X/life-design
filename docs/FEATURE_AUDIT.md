# Feature audit: household intelligence

Audited 2026-11-23 at v0.52.4, from the code (not the screens). Status: EXISTING · PARTIAL · MISSING · NEEDS IMPROVEMENT.
What the app is and why: [DECISIONS.md](../DECISIONS.md). What is planned: [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).
This file is rewritten when a row changes status; history is in git.

The app is a phone-only journal with a Money tab. No server, account, cloud sync or push (owner's founding rules), so
"automation" means what the phone works out when opened, and a desktop browser holds its own separate data.

## A. Household finance
| Capability | Status | Where / note |
|---|---|---|
| Income and expenses | PARTIAL | From bank PDFs only (`bankLines`); no manual entry, no cash |
| Categories | EXISTING | `PAYMENT_KINDS`, a kind per payee and per payment (`kindOf`) |
| Monthly and annual reports | EXISTING | `moneyMonth`, `moneyYear`; quarterly MISSING |
| Budgets, budget vs actual | MISSING | |
| Search and filter | EXISTING | `searchPayments`, every month |
| CSV bank import | MISSING | Statement import takes PDF only |
| Duplicate detection | PARTIAL | A statement again adds nothing (id = account + days); overlapping statements not verified line by line |
| Manual correction | PARTIAL | Name, kind, who-for, "my own transfer"; amount and date are the bank's |
| Transfers not double-counted | EXISTING | `Moving`, own payees, Flex, pots |

## B. Receipts
| Capability | Status | Where / note |
|---|---|---|
| Camera and image capture | EXISTING | `AddReceipt.tsx`; long receipts in parts |
| PDF receipts | MISSING | PDF.js reads statements only |
| On-phone OCR, AI optional | EXISTING | PaddleOCR on the phone; Gemini or OpenAI reads a receipt when the owner turns it on |
| Shop, date, time, items, quantity, savings, total, card | EXISTING | `receipts.ts`, `aiReading.ts`; receipt number MISSING |
| Original image kept | NEEDS IMPROVEMENT | A copy shrunk to about 300 KB at capture (owner, 2026-11-23: keep the shrunk copy) |
| Review before it counts | EXISTING (v0.53.0) | Items that don't add up to the total are held back until approved (`held`, `approveReceipt`) |
| Edit a receipt's figures | MISSING | Only an item's kind and "returned"; planned for step 2 |
| Duplicate receipts | EXISTING | `sameReceipt` |
| Reconcile total with items | EXISTING | `adds` |
| Link to a bank payment | EXISTING | `matchReceiptPayment`, `linkReceipts` |
| Per-field accuracy | MISSING | 24 fixtures pass or fail; no accuracy figure per field |
| Retailer coverage | PARTIAL | Asda and M&S most; Aldi, Lidl, Tesco, Co-op one or two; Morrisons named, no fixture |

## C. Grocery intelligence
| Capability | Status | Where / note |
|---|---|---|
| Product table (brand, size, unit) | MISSING | |
| Price per litre or kg, across shops | MISSING | Price changes are same shop, same printed name, 6 months |
| Spend by kind, repeats | EXISTING | `kindsOf`, `repeats` |
| Regular list, basket comparison | MISSING | |

## D. Recurring and subscriptions
| Capability | Status | Where / note |
|---|---|---|
| Detect regular payments, yearly cost, next due, changes, stopped | EXISTING | `regularPayments`, `regularChanges` (monthly and weekly only) |
| Manual items, annual or quarterly cadence, renewal, notes | MISSING | |
| Reminders | MISSING | The calendar file (`ics.ts`) serves the journal only |

## E. Documents: MISSING
Reusable: photo storage, OCR, PDF.js, search by meaning, calendar files.

## F. Assistant
| Capability | Status | Where / note |
|---|---|---|
| Ask over receipts and journal | EXISTING | 4 fixed read-only tools; the phone does every sum; amounts the AI wrote are flagged |
| Ask over bank payments | MISSING by rule | Statements go to no AI (owner, 2026-10-26); planned as on-phone quick answers |

## G. Automation: MISSING by design
The phone can't run in the background. Present: receipts are read when added, a backup nudge after 7 days, duplicate checks.

## Reliability and security notes
- Data loss is the main risk: backup is by hand (share menu); iOS can clear website data.
- Money choices are lists in `settings`. Read-then-write races lost choices made at once: fixed in v0.53.0 (`changeSetting`).
- No audit trail of changes yet (planned, step 2).
- IndexedDB, including the AI key, is not encrypted at rest; a backup can be password-protected.
- Receipts go by themselves to Gemini or OpenAI while "Read receipts with AI" is on (owner's choice).
