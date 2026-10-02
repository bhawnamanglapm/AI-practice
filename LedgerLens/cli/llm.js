/*
 * LedgerLens BSA — LLM adapter (Claude via the official Anthropic SDK).
 * Two calls, both with schema-validated JSON output:
 *   extractBatch  — one call per 3-page batch: page text → statement metadata + transaction rows
 *   classify      — one call per chunk of uncertain rows: narration → counterparty + Level-2 category + confidence
 * The engine treats every answer as untrusted: rows go through the same balance-arithmetic checks as rule output,
 * and labels must name a category from the active taxonomy with the right Level 1, or they are dropped.
 */
const Anthropic = require('@anthropic-ai/sdk');
const { betaZodOutputFormat } = require('@anthropic-ai/sdk/helpers/beta/zod');
const { z } = require('zod');

const DEFAULT_MODEL = 'claude-opus-5-5';

const Txn = z.object({
  date: z.string().describe('Transaction date, YYYY-MM-DD'),
  value_date: z.string().nullable().describe('Value date, YYYY-MM-DD, or null if not printed'),
  narration: z.string().describe('Full narration / description, verbatim, continuation lines joined with a space'),
  debit: z.number().nullable().describe('Withdrawal amount (positive), or null'),
  credit: z.number().nullable().describe('Deposit amount (positive), or null'),
  balance: z.number().nullable().describe('Running balance after the row, or null if not printed'),
});
const PageOut = z.object({
  page_index: z.number().int(),
  metadata: z.object({
    bank_name: z.string().nullable(),
    account_number: z.string().nullable(),
    account_holder: z.string().nullable(),
    account_type: z.string().nullable(),
    currency: z.string().nullable().describe('ISO 4217 code'),
    opening_balance: z.number().nullable(),
    closing_balance: z.number().nullable(),
    period_from: z.string().nullable().describe('YYYY-MM-DD'),
    period_to: z.string().nullable().describe('YYYY-MM-DD'),
  }),
  transactions: z.array(Txn),
});
const ExtractOut = z.object({ pages: z.array(PageOut) });

const Label = z.object({
  id: z.string(),
  counterparty: z.string().describe('Who the money went to / came from, upper case; "UNIDENTIFIED" if truly absent'),
  counterparty_confidence: z.number().describe('0 to 1'),
  level2: z.string().describe('A category code from the taxonomy whose level1 matches the row'),
  confidence: z.number().describe('0 to 1'),
  reason: z.string().describe('One short sentence'),
});
const ClassifyOut = z.object({ labels: z.array(Label) });

const EXTRACT_SYSTEM = `You extract transactions from Indian bank and credit-card statement pages (digital text or OCR output).
Rules:
- Return one entry per input page, with that page's page_index.
- metadata: only fields printed on THAT page; use null otherwise (the pipeline inherits missing fields from earlier pages itself).
- Copy numbers exactly as printed; never compute or "fix" a balance. Indian digit grouping (1,42,500.00) means 142500.00.
- Amount columns: Withdrawal/Debit/Dr → debit; Deposit/Credit/Cr → credit. A single Amount column with a Dr/Cr marker is split accordingly.
- Dates are DD/MM/YYYY (or DD-Mon-YYYY) on Indian statements; output YYYY-MM-DD.
- Skip opening/closing balance lines, totals, headers and footers; they are not transactions.
- A narration that wraps onto the next line belongs to the row above.`;

const CLASSIFY_SYSTEM = `You label bank-statement transactions for credit underwriting in India.
For each row return the counterparty and a Level-2 category code taken ONLY from the taxonomy given, with the same level1 as the row.
Underwriting rules:
- Not every credit is income: transfers from individuals are P2P; merchant refunds/cashback are REFUND; loan disbursals are LOAN_DISBURSAL; failed-debit returns are REVERSAL.
- Use the narration's purpose words when present (e.g. "tuition fee" → EDUCATION even if paid to a person).
- Debits to lenders via NACH/ACH/ECS mandates are usually EMI.
- Use OTHER_CREDIT / OTHER_DEBIT when nothing fits, with low confidence.
- confidence reflects how sure you are from the narration alone: 0.9+ only when the narration states it plainly.
The rule engine's guesses are included as hints; overrule them when the narration says otherwise.`;

function createLlm(opts = {}) {
  const client = opts.client || new Anthropic();
  const model = opts.model || process.env.LEDGERLENS_MODEL || DEFAULT_MODEL;

  async function call(system, user, schema, maxTokens) {
    const res = await client.beta.messages.parse({
      model,
      max_tokens: maxTokens,
      // if a safety classifier declines, the API re-runs the request on its recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal') throw new Error('model declined the request');
    if (res.stop_reason === 'max_tokens') throw new Error('model output truncated (max_tokens)');
    if (!res.parsed_output) throw new Error('model output did not match the schema');
    return res.parsed_output;
  }

  return {
    model,
    async extractBatch(req) {
      const body = req.pages.map((p) => `<page index="${p.index}">\n${p.text}\n</page>`).join('\n');
      const user = `Metadata carried from earlier batches (context only; do not copy into pages that do not print it): ${JSON.stringify(req.carried)}\n\nBatch ${req.batch}:\n${body}`;
      const out = await call(EXTRACT_SYSTEM, user, ExtractOut, 32000);
      return { ...out, model };
    },
    async classify(req) {
      const user = `Taxonomy:\n${JSON.stringify(req.taxonomy)}\n\nRows:\n${JSON.stringify(req.rows)}`;
      const out = await call(CLASSIFY_SYSTEM, user, ClassifyOut, 16000);
      return { ...out, model };
    },
  };
}

module.exports = { createLlm, DEFAULT_MODEL };
