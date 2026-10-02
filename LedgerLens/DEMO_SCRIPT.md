# LedgerLens — Demo walkthrough script (≈ 7 minutes)

Two parts: the **web app** (≈ 4½ min) shows the product, the **terminal** (≈ 2½ min) shows the Claude step, the external test and the tests. Every number below was checked against the current build; if your screen shows something different, say what you see, not what is written here.

---

## Before you record

- [ ] **Do one live run with your API key first** (not on camera): `cd cli && export ANTHROPIC_API_KEY=… && node cli.js ../test-statements/05_amount_drcr_column.csv -o out.json`. Note the real log lines and timings; step 13 depends on them. If the key fails, record Part B without step 13 and say the model step is covered by tests.
- [ ] Browser at **1440 px** wide, zoom 100%. Open the LedgerLens link; in the Activity log, clear old runs so the history starts empty.
- [ ] Terminal: large font (16–18 pt), dark theme, window ~110 columns, current folder `LedgerLens/cli`. Run `clear` before each command.
- [ ] Have `test-statements/` open in a file browser for drag-and-drop.
- [ ] Close notifications, Slack, mail. Hide bookmarks bar.
- [ ] Do a full dry run once; aim for a calm pace — pause one second after each click so the viewer sees the result.

---

## Part A — Web app (≈ 4½ min)

| # | Time | Do | Say |
|---|---|---|---|
| 1 | 0:00 – 0:20 | App open on **Ingest**. | "This is LedgerLens, a bank statement analyzer for credit underwriting. It takes raw statements — digital PDFs, scans, images, Excel or CSV — extracts every transaction, classifies it, checks the data, and produces a credit risk score with a decision. I'll show the product first, then the AI step and the tests in the terminal." |
| 2 | 0:20 – 0:55 | Drag in **`02_multi_month_multi_account.pdf`**. Point at the six pipeline steps as they turn green. | "This one file has three months and three accounts — an individual savings account, a joint account and a credit card — twelve pages. The pages are checked for order using the 'Page X of Y' footers, then read in batches of three pages, the size of one model call. Pages without a header inherit the account number, bank and currency from earlier pages, and every inheritance is logged." |
| 3 | 0:55 – 1:20 | Scroll to the **Data validation** panel. | "Before anything is scored, twenty-two checks run. The important ones are the balance arithmetic — previous balance plus or minus the amount must equal the printed balance on every row — and opening plus all movements must equal the closing balance. A broken balance means an OCR misread or an edited PDF, so it forces a referral, whatever the score." |
| 4 | 1:20 – 1:55 | Click **Transactions**. Filter Level 2 = **EDUCATION**, then hover a row's method / confidence. Clear the filter, filter **REFUND**. | "Each row has date, value date, narration, debit or credit, running balance, account, month, counterparty, payment channel, and attributes like loan number, UPI ID or IFSC. Counterparty is mandatory — if it can't be found, the row says UNIDENTIFIED and goes to review. Classification looks at the narration: this payment says 'Tuition fee', so it's EDUCATION, even though it went to a trust. Refunds are kept out of income, and so are transfers from friends — not every credit is salary. Every row stores a confidence and the method: RULE, LLM or MANUAL." |
| 5 | 1:55 – 2:25 | Click **Review queue**. Point at the smart-mode toggle; click it once to show all, then back. Accept one item. | "Rows below 70% confidence are flagged, but a reviewer only needs to see the ones that can change the decision — large amounts, possible income, recurring payments and anything loan-related. Here that's five items instead of seven, and similar rows are grouped so one decision covers them. Accepting an item can be saved as a rule, so the next statement doesn't ask again." |
| 6 | 2:25 – 3:15 | Click **Risk**. Point at the score, the band, then the decision and the line under it; then the six components; then the EMI table and fraud flags. | "Six weighted components — income, debt service, liquidity, banking behaviour, fraud indicators and expenses — give 777 out of 1000, which is 'Good'. On the score alone that's an approval, and the screen says so: the decision is **REFER**, a policy override. The reasons are listed: cash deposits structured just under the fifty-thousand reporting limit, money going in and out with the same party within three days, and an EMI that bounced. FOIR is 37%, across three loans. Hard rules always win over the score, and the reasons are always shown." |
| 7 | 3:15 – 3:40 | Drag in **`06_weak_applicant_3_months.pdf`**. Go to **Risk**. | "Here's a weak applicant. Three EMIs take 75% of a 52-thousand salary, two of them bounced, and because the EMIs are debited before salary arrives, the account was overdrawn for fifteen days. FOIR above 65% is a hard limit, so the decision is **DECLINE**, at 532." |
| 8 | 3:40 – 3:55 | Drag in **`07_good_applicant_3_months.pdf`**. Go to **Risk**. | "And the same three-account customer without the red flags: 931, Excellent, **APPROVE** — no override, all checks pass." |
| 9 | 3:55 – 4:15 | Drag in **`01_single_month_digital.pdf`**. Go to **Risk**. | "One month of data scores high — 901 — but one salary credit says nothing about regularity or trend. Anything under three months is referred, and the app asks for more statements instead of approving." |
| 10 | 4:15 – 4:30 | Click the built-in sample **Jumbled pages**. | "And if pages are out of order, the pipeline stops with a clear error naming the page, instead of producing a wrong score. Every run is kept in the Activity log." |

> If you are short on time, drop step 8 or step 9 — not both; together they show the full APPROVE / REFER / DECLINE range.

---

## Part B — Terminal (≈ 2½ min)

| # | Time | Do | Say |
|---|---|---|---|
| 11 | 4:30 – 4:50 | `node cli.js ../test-statements/02_multi_month_multi_account.pdf -o out.json` | "The same engine runs from the command line — same code, same numbers: 777, overridden to REFER. It writes the JSON output: transactions, the risk summary and the validation report." |
| 12 | 4:50 – 5:10 | `node cli.js ../test-statements/05_amount_drcr_column.csv --llm off -o out.json` | "This statement has one Amount column and a Dr/Cr marker, a layout the rules weren't written for. Rules alone stop: no rows recognised. That's where the model comes in." |
| 13 | 5:10 – 5:50 | `node cli.js ../test-statements/05_amount_drcr_column.csv -o out.json` (API key set). Point at the `LLM extract` and `LLM classify` log lines. | "With an API key, batches the rules can't read go to Claude. It returns the rows in a fixed JSON schema, and those rows go back through the same pipeline — so the balance checks still verify what the model read. Rows the rules are unsure about are labelled by Claude, and a label is only accepted if it exists in our taxonomy. Before anything is sent, names, account numbers and UPI IDs are masked, and restored locally afterwards. If the API fails, the run falls back to rules." *(Read the actual row count and time from your screen.)* |
| 14 | 5:50 – 6:30 | `node test/eval-external.js --llm off` *(keep `--llm off`: your key is still exported from step 13)* | "I also tested on statements I didn't generate — from an independent open-source project, in layouts the parser wasn't built around, each with an answer key. On two of them every date, amount and balance matches. The third, Meridian, prints the date in the middle of each narration block, and the rules got every amount wrong. The important part: originally that wrong data passed all the checks, because no balances were read so there was nothing to compare. That's fixed — unreadable balances now fail the check, force a referral, and send the page to the model." |
| 15 | 6:30 – 6:50 | `npm test` | "There are twenty tests: the decision rules, the external statements, the model path with a stand-in model — including that bad answers are dropped and personal data never leaves unmasked." |
| 16 | 6:50 – 7:05 | Stop on the passing tests. | "Rules first, model for what rules can't settle, a human only for what can change the decision, and nothing scored that the checks can't verify. That's LedgerLens. Thanks." |

---

## If they ask

- **Why rules first, not the model for everything?** Narrations are semi-structured; rules are free, instant, explainable and auditable for a credit decision. The model handles unknown layouts and uncertain rows, and its output is verified by the same checks.
- **How accurate is the model?** Measured with the external answer keys via `node test/eval-external.js --llm all` — give the number from your pre-recording run, or say it hasn't been measured yet. Don't guess.
- **Why does the browser version have no LLM?** A browser page can't hold an API key safely; in production the model call sits behind a backend.
- **Are the weights right?** They follow the brief; cut-offs are illustrative and should be calibrated on historical loan outcomes.
- **Real customer data?** None — all statements are synthetic; real statements are personal data. The external set is independent but also synthetic.
