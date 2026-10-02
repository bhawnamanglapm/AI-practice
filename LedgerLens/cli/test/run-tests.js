#!/usr/bin/env node
// Black-box tests: run the CLI on the test statements and check the JSON it writes. No API key needed —
// the LLM path is exercised with test/mock-llm.js. Run: npm test
const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');

const CLI = path.join(__dirname, '..', 'cli.js');
const TS = path.join(__dirname, '..', '..', 'test-statements');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'll-test-'));

function run(args, env) {
  const out = path.join(tmp, Math.random().toString(36).slice(2) + '.json');
  const e = { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', LEDGERLENS_LLM_MOCK: '', MOCK_LLM_FAIL: '', ...(env || {}) };
  const r = spawnSync('node', [CLI, ...args, '-o', out], { env: e, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr, json: fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null };
}
const MOCK = { LEDGERLENS_LLM_MOCK: path.join(__dirname, 'mock-llm.js') };
const risk = (j) => j.credit_risk_summary;

const tests = {
  'single month → REFER for insufficient history': () => {
    const r = run([path.join(TS, '01_single_month_digital.pdf')]);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.strictEqual(risk(r.json).decision, 'REFER');
    assert.strictEqual(risk(r.json).period.sufficient_history, false);
    assert.ok(risk(r.json).decision_reasons.some((x) => /at least 3 months/.test(x)));
    const inc = risk(r.json).components.find((c) => c.component === 'Income Stability');
    assert.ok(inc.score_0_100 < 87, 'one month must not score as perfectly regular: ' + inc.score_0_100);
  },
  'three months, clean → history rule does not fire': () => {
    const r = run(['--sample', 'clean']);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.strictEqual(risk(r.json).period.sufficient_history, true);
    assert.ok(!risk(r.json).decision_reasons.some((x) => /at least 3 months/.test(x)));
    assert.strictEqual(risk(r.json).decision, 'APPROVE');
  },
  'multi-month fixture keeps its score and overrides': () => {
    const r = run([path.join(TS, '02_multi_month_multi_account.pdf')]);
    assert.strictEqual(risk(r.json).composite_score, 777);
    assert.strictEqual(risk(r.json).decision, 'REFER');
  },
  'rules only: no LLM method appears without a model': () => {
    const r = run([path.join(TS, '02_multi_month_multi_account.pdf')]);
    assert.ok(r.json.transactions.every((t) => t.method !== 'LLM'));
    assert.match(r.stderr, /LLM step: off/);
  },
  'Amount + Dr/Cr layout: rules alone stop': () => {
    const r = run([path.join(TS, '05_amount_drcr_column.csv')]);
    assert.strictEqual(r.code, 3);
  },
  'Amount + Dr/Cr layout: LLM extraction reads it and balance checks pass': () => {
    const r = run([path.join(TS, '05_amount_drcr_column.csv')], MOCK);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.strictEqual(r.json.transactions.length, 24);
    assert.strictEqual(r.json.accounts[0].account_number, '4611223344');
    const chk = (name) => r.json.data_validation.checks.find((c) => c.check.indexOf(name) >= 0);
    assert.strictEqual(chk('Running balance').status, 'PASS');
    assert.strictEqual(r.json.transactions.filter((t) => t.level2 === 'SALARY').length, 3);
    assert.strictEqual(risk(r.json).period.sufficient_history, true);
  },
  'LLM labels uncertain rows; invalid categories are dropped': () => {
    const r = run([path.join(TS, '05_amount_drcr_column.csv')], MOCK);
    const giga = r.json.transactions.filter((t) => /GIGAWATT/.test(t.narration));
    assert.strictEqual(giga.length, 3);
    giga.forEach((t) => { assert.strictEqual(t.method, 'LLM'); assert.strictEqual(t.level2, 'ENTERTAINMENT'); assert.strictEqual(t.counterparty, 'GIGAWATT STUDIOS'); });
    assert.ok(r.json.transactions.every((t) => t.level2 !== 'NOT_A_REAL_CODE'));
  },
  'LLM outage falls back to rules and still reports': () => {
    const r = run([path.join(TS, '02_multi_month_multi_account.pdf'), '--llm', 'all'], { ...MOCK, MOCK_LLM_FAIL: '1' });
    assert.strictEqual(r.code, 0, r.stderr);
    assert.match(r.stderr, /fell back to rules|kept rule labels/);
    assert.strictEqual(risk(r.json).composite_score, 777);
  },
  'weak applicant (3 months) → DECLINE on FOIR, with bounces and overdraft': () => {
    const r = run([path.join(TS, '06_weak_applicant_3_months.pdf')]);
    assert.strictEqual(r.code, 0, r.stderr);
    const R = risk(r.json);
    assert.strictEqual(R.decision, 'DECLINE');
    assert.ok(R.composite_score < 600, 'score ' + R.composite_score);
    assert.ok(R.metrics.debt_service.foir_pct > 65);
    assert.strictEqual(R.metrics.banking_behaviour.bounces, 2);
    assert.ok(R.metrics.liquidity.negative_balance_days > 0);
    assert.strictEqual(R.period.sufficient_history, true);
    assert.strictEqual(r.json.data_validation.summary.failed, 0);
  },
  'external: rows read without balances fail check 14 and force REFER': () => {
    const r = run([path.join(TS, 'external', 'meridian-salary-account-feb-2026.pdf')]);
    const c14 = r.json.data_validation.checks.find((c) => c.id === 14);
    assert.strictEqual(c14.status, 'FAILED');
    assert.strictEqual(r.json.data_validation.checks.find((c) => c.id === 15).status, 'N/A');
    assert.strictEqual(risk(r.json).decision, 'REFER');
    assert.ok(risk(r.json).decision_reasons.some((x) => /balance read on only/i.test(x)));
  },
  'external: a misread page is sent to the model in auto mode; clean pages are not': () => {
    const bad = run([path.join(TS, 'external', 'meridian-salary-account-feb-2026.pdf')], MOCK);
    assert.match(bad.stderr, /LLM extract: Batch 1/);
    const good = run([path.join(TS, 'external', 'northstar-business-current-mar-2026.pdf')], MOCK);
    assert.doesNotMatch(good.stderr, /LLM extract: Batch/);
  },
  'external: unverifiable income blocks APPROVE': () => {
    const r = run([path.join(TS, 'external', 'northstar-business-current-mar-2026.pdf')]);
    assert.notStrictEqual(risk(r.json).decision, 'APPROVE');
    assert.ok(risk(r.json).decision_reasons.some((x) => /income cannot be verified/.test(x)));
  },
  'external: amounts and balances match the answer key where the layout is readable': () => {
    const { evaluate } = require('./eval-external');
    ['astra-premier-checking-jan-2026', 'northstar-business-current-mar-2026'].forEach((n) => {
      const e = evaluate(n);
      ['date', 'debit', 'credit', 'balance'].forEach((k) => assert.strictEqual(e.ok[k], e.n, n + ' ' + k + ' ' + e.ok[k] + '/' + e.n));
    });
  },
  'good applicant (3 months) → APPROVE, not overridden': () => {
    const r = run([path.join(TS, '07_good_applicant_3_months.pdf')]);
    const R = risk(r.json);
    assert.strictEqual(R.decision, 'APPROVE');
    assert.strictEqual(R.decision_overridden, false);
    assert.strictEqual(r.json.data_validation.summary.failed, 0);
  },
  'policy overrides are labelled as such': () => {
    const r = run([path.join(TS, '01_single_month_digital.pdf')]);
    assert.strictEqual(risk(r.json).band_decision, 'APPROVE');
    assert.strictEqual(risk(r.json).decision_overridden, true);
    assert.match(r.stderr + '', /LLM step/);
  },
  '--taxonomy CSV overrides and extends the categories': () => {
    const N = path.join(TS, 'external', 'northstar-business-current-mar-2026.pdf');
    const base = run([N]); const custom = run([N, '--taxonomy', path.join(TS, 'custom_taxonomy.csv')]);
    assert.match(custom.stderr, /1 override\(s\), 2 new categories/);
    const biz = custom.json.transactions.filter((t) => t.level2 === 'BUSINESS_INCOME');
    assert.ok(biz.length >= 5 && biz.every((t) => /Custom CSV keyword/.test(t.method_reason)));
    assert.ok(custom.json.transactions.some((t) => t.level2 === 'SOFTWARE_SUBSCRIPTION'));
    const share = (j) => risk(j).metrics.income_stability.unclassified_inflow_share_pct;
    assert.ok(share(custom.json) < share(base.json));
    const bad = path.join(tmp, 'bad.csv'); fs.writeFileSync(bad, 'name,type\nX,Y\n');
    assert.strictEqual(run([N, '--taxonomy', bad]).code, 1);
  },
  'sample pages for the multi-month generator can be rebuilt': () => {
    const r = spawnSync('node', [path.join(__dirname, '..', '..', 'tools', 'dump_sample_pages.js'), 'flags'], { encoding: 'utf8' });
    const pages = JSON.parse(r.stdout);
    assert.strictEqual(pages.length, 12);
    assert.match(pages[0].text, /Page 1 of 12/);
  },
  'jumbled pages still stop the pipeline': () => {
    const r = run(['--sample', 'jumbled']);
    assert.strictEqual(r.code, 3);
    assert.match(r.stderr, /jumbled/);
  },
};

// llm.js against a fake SDK client: checks the request shape and the stop_reason handling (no network)
tests['llm.js builds a schema-constrained request and rejects bad stops'] = async () => {
  const { createLlm } = require('../llm');
  const sent = []; let reply;
  const client = { beta: { messages: { parse: async (params) => { sent.push(params); return reply; } } } };
  const llm = createLlm({ client });
  reply = { stop_reason: 'end_turn', parsed_output: { labels: [] } };
  const out = await llm.classify({ taxonomy: [{ code: 'P2P', level1: 'DEBIT', group: 'x' }], rows: [{ id: 't1', narration: 'UPI/…' }] });
  assert.strictEqual(out.model, 'claude-opus-5-5');
  const p = sent[0];
  assert.strictEqual(p.model, 'claude-opus-5-5');
  assert.strictEqual(p.output_config.format.type, 'json_schema');
  assert.deepStrictEqual(p.output_config.format.schema.required, ['labels']);
  assert.strictEqual(p.fallbacks, 'default');
  assert.ok(p.betas.includes('server-side-fallback-2026-07-01'));
  await llm.extractBatch({ batch: 1, pages: [{ index: 1, text: 'x' }], carried: {} }).catch(() => {});
  assert.ok(sent[1].messages[0].content.indexOf('<page index="1">') >= 0);
  for (const bad of [{ stop_reason: 'refusal', parsed_output: null }, { stop_reason: 'max_tokens', parsed_output: null }, { stop_reason: 'end_turn', parsed_output: null }]) {
    reply = bad; await assert.rejects(llm.classify({ taxonomy: [], rows: [] }));
  }
};

// personal data never reaches the API in clear text, and the answer comes back unmasked
tests['llm.js masks personal data before sending and restores it in the answer'] = async () => {
  const { createLlm } = require('../llm');
  let sent = '';
  const client = { beta: { messages: { parse: async (p) => {
    sent = p.messages[0].content + p.system;
    const toks = sent.match(/\[MASK\d+\]/g) || [];
    return { stop_reason: 'end_turn', parsed_output: { pages: [{ page_index: 1, metadata: { account_number: toks.find((t) => sent.indexOf('Account Number: ' + t) >= 0) || null }, transactions: [{ date: '2025-01-02', value_date: null, narration: toks.join(' '), debit: 1, credit: null, balance: 1 }] }] } };
  } } } };
  const page = 'Account Holder: ARJUN NAIR\nAccount Number: 50200011223344\nPAN: ABCDE1234F\n02/01/2025 UPI-RAJIV MALHOTRA-rajiv.m@okhdfcbank-HDFC0001234-501234567890-RENT 22,000.00 1,32,920.00';
  const out = await createLlm({ client }).extractBatch({ batch: 1, pages: [{ index: 1, text: page }], carried: { account_holder: 'ARJUN NAIR', account_number: '50200011223344' } });
  ['ARJUN NAIR', '50200011223344', 'rajiv.m', 'ABCDE1234F', '501234567890'].forEach((v) => assert.ok(sent.indexOf(v) < 0, 'leaked: ' + v));
  ['22,000.00', '1,32,920.00', '02/01/2025', 'HDFC0001234', '@okhdfcbank'].forEach((v) => assert.ok(sent.indexOf(v) >= 0, 'over-masked: ' + v));
  assert.strictEqual(out.pages[0].metadata.account_number, '50200011223344');
  ['ARJUN NAIR', 'rajiv.m', 'ABCDE1234F', '501234567890'].forEach((v) => assert.ok(out.pages[0].transactions[0].narration.indexOf(v) >= 0, 'not restored: ' + v));
};

let failed = 0;
(async () => {
for (const [name, fn] of Object.entries(tests)) {
  try { await fn(); console.log('✓ ' + name); } catch (e) { failed++; console.log('✗ ' + name + '\n    ' + (e && e.message ? e.message : e)); }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log((Object.keys(tests).length - failed) + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
})();
