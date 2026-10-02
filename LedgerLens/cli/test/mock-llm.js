/*
 * Deterministic stand-in for llm.js, used by the tests (LEDGERLENS_LLM_MOCK=test/mock-llm.js).
 * It returns the same shapes Claude returns through the structured-output schemas in llm.js, so the tests
 * exercise the engine's plumbing and validation without network access or an API key.
 *   MOCK_LLM_FAIL=1  → every call throws (tests the fallback to rules)
 */
const fail = () => { if (process.env.MOCK_LLM_FAIL) throw new Error('mock: service unavailable'); };
const iso = (dmy) => { const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const cells = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((c) => c.trim()); };
const kv = (text, key) => { const m = text.match(new RegExp('^' + key + ',(.+)$', 'mi')); return m ? m[1].trim() : null; };

module.exports = {
  model: 'mock-llm',
  async extractBatch(req) {
    fail();
    return {
      model: 'mock-llm',
      pages: req.pages.map((p) => {
        const per = (kv(p.text, 'Statement Period') || '').split(/\s+to\s+/);
        const txns = p.text.split('\n').map(cells).filter((c) => c.length === 5 && iso(c[0])).map((c) => ({
          date: iso(c[0]), value_date: null, narration: c[1],
          debit: c[3] === 'DR' ? Number(c[2]) : null, credit: c[3] === 'CR' ? Number(c[2]) : null, balance: Number(c[4]),
        }));
        const num = (v) => (v === null ? null : Number(v));
        return {
          page_index: p.index,
          metadata: {
            bank_name: kv(p.text, 'Bank Name'), account_number: kv(p.text, 'Account Number'), account_holder: kv(p.text, 'Account Holder'),
            account_type: null, currency: kv(p.text, 'Currency'), opening_balance: num(kv(p.text, 'Opening Balance')), closing_balance: num(kv(p.text, 'Closing Balance')),
            period_from: iso(per[0] || ''), period_to: iso(per[1] || ''),
          },
          transactions: txns,
        };
      }),
    };
  },
  async classify(req) {
    fail();
    const labels = [];
    req.rows.forEach((r, i) => {
      if (/GIGAWATT/.test(r.narration)) labels.push({ id: r.id, counterparty: 'GIGAWATT STUDIOS', counterparty_confidence: 0.9, level2: 'ENTERTAINMENT', confidence: 0.86, reason: 'Card spend at a recording/streaming studio' });
      // a malformed answer (category not in the taxonomy) — the engine must drop it
      else if (i === 0) labels.push({ id: r.id, counterparty: 'X', counterparty_confidence: 0.9, level2: 'NOT_A_REAL_CODE', confidence: 0.99, reason: 'bad' });
    });
    return { model: 'mock-llm', labels };
  },
};
