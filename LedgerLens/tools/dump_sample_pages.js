#!/usr/bin/env node
// Writes the engine's built-in sample statement pages to JSON, the input of make_multi_month.py.
//   node tools/dump_sample_pages.js [flags|clean] > multi_pages.json
// (run from the LedgerLens folder; 02_multi_month_multi_account.pdf is the "flags" sample)
const fs = require('fs'); const path = require('path');
global.window = { localStorage: { getItem: () => null, setItem() {} }, scrollTo() {} };
class DCLogic { constructor(p) { this.props = p || {}; } setState(s) { Object.assign(this.state, typeof s === 'function' ? s(this.state) : s); } }
const src = fs.readFileSync(path.join(__dirname, '..', 'cli', 'engine.js'), 'utf8');
const Component = new Function('DCLogic', 'window', 'navigator', src + '\nreturn Component;')(DCLogic, window, { hardwareConcurrency: 1 });
const pages = new Component({}).genSample(process.argv[2] || 'flags');
process.stdout.write(JSON.stringify(pages.map((p) => ({ index: p.index, text: p.text })), null, 1) + '\n');
