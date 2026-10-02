# External test statements

Three statement PDFs that **we did not generate**, used to check the parser against layouts it was not built around.

- Source: [AyonPal/bank-statement-pdf-parser](https://github.com/AyonPal/bank-statement-pdf-parser), `samples/pdfs/` and `samples/parsed/`, commit `c781b5f` (20 Mar 2026). MIT licence, copied here as `LICENSE`.
- The PDFs are **synthetic**: rendered by headless Chrome to mimic Indian retail and business statements, with no real account-holder data. No real customer statement is used anywhere in this repo.
- `expected/*.csv` are the source repo's own parsed outputs (date, description, withdrawal, deposit, balance). We use them as the answer key for field accuracy.

| File | Layout features new to LedgerLens |
|---|---|
| `astra-premier-checking-jan-2026.pdf` | Deposit column before Withdrawal; balance followed by `CR` on the next line; 3-line narrations; watermark letters |
| `meridian-salary-account-feb-2026.pdf` | Date printed on the **middle** line of each 3-line narration block; 2 pages, Feb–Mar |
| `northstar-business-current-mar-2026.pdf` | Business current account, 3 pages, Mar–May; income from client receipts, not salary |

Measure the parser against the answer key with `node cli/test/eval-external.js` (from the LedgerLens folder).
