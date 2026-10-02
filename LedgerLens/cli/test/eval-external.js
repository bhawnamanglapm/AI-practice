#!/usr/bin/env node
// Field accuracy on the external statements (test-statements/external) against their answer keys.
// Uses whatever LLM setting the CLI would use (rules only without ANTHROPIC_API_KEY); pass --llm all|off to force.
//   node cli/test/eval-external.js [--llm auto|all|off]
const { spawnSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');

const DIR = path.join(__dirname, '..', '..', 'test-statements', 'external');
const CLI = path.join(__dirname, '..', 'cli.js');
const extra = process.argv.slice(2);

function readCsv(file) {
  const [head, ...lines] = fs.readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n');
  const keys = head.split(',');
  return lines.map((l) => { const c = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return Object.fromEntries(keys.map((k, i) => [k, c[i]])); });
}
const num = (v) => (v === '' || v === undefined || v === null ? null : Math.round(Number(v) * 100) / 100);
const words = (s) => String(s || '').toUpperCase().split(/\s+/).filter(Boolean).join(' ');

function evaluate(name) {
  const out = path.join(os.tmpdir(), 'll-eval-' + name + '.json');
  const r = spawnSync('node', [CLI, path.join(DIR, name + '.pdf'), '-o', out, ...extra], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) return { name, error: (r.stderr || '').trim().split('\n').pop() };
  const j = JSON.parse(fs.readFileSync(out, 'utf8'));
  const gt = readCsv(path.join(DIR, 'expected', name + '.csv'));
  const T = j.transactions;
  const ok = { date: 0, debit: 0, credit: 0, balance: 0, narration: 0 };
  gt.forEach((g, i) => {
    const t = T[i]; if (!t) return;
    const [d, m, y] = g.date.split('-');
    if (t.date === `${y}-${m}-${d}`) ok.date++;
    if (num(g.withdrawal) === t.debit) ok.debit++;
    if (num(g.deposit) === t.credit) ok.credit++;
    if (num(g.balance) === t.balance) ok.balance++;
    if (words(t.narration) === words(g.description)) ok.narration++;
  });
  const R = j.credit_risk_summary || {};
  return { name, rows: `${T.length}/${gt.length}`, ok, n: gt.length, score: R.composite_score, decision: R.decision, reasons: R.decision_reasons || [] };
}

if (require.main !== module) { module.exports = { evaluate }; return; }
const res = fs.readdirSync(DIR).filter((f) => f.endsWith('.pdf')).map((f) => evaluate(f.replace(/\.pdf$/, '')));
const pct = (a, n) => (n ? Math.round((a / n) * 100) + '%' : '–');
console.log('statement'.padEnd(40) + 'rows    date  debit credit balance narration  decision');
res.forEach((r) => {
  if (r.error) { console.log(r.name.padEnd(40) + 'ERROR ' + r.error); return; }
  const o = r.ok;
  console.log(r.name.padEnd(40) + r.rows.padEnd(8) + [o.date, o.debit, o.credit, o.balance, o.narration].map((x) => pct(x, r.n).padStart(5)).join(' ') + '   ' + r.score + ' ' + r.decision);
  r.reasons.forEach((x) => console.log(' '.repeat(42) + '· ' + x));
});
if (require.main === module && process.env.EVAL_JSON) fs.writeFileSync(process.env.EVAL_JSON, JSON.stringify(res, null, 2));
module.exports = { evaluate };
