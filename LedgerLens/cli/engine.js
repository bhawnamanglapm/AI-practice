class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = {
      tab: 'ingest', source: null, pages: [], batches: [], accounts: [], raw: [], error: null,
      stages: null, busy: false, previewPage: 0, threshold: 0.7, llmLabels: {}, customRules: [], csvMsg: '',
      overrides: {}, cpOverrides: {}, fAcct: 'ALL', fMonth: 'ALL', fFlag: false, fileNote: '', log: [], current: null, runStatus: null, showJson: false, jsonMsg: '', reviewMode: 'smart', confirmAcceptAll: false, cpRules: [], cpRuleMsg: '', ruleDraft: {}, newRule: { match: '', cp: '', cat: '' }, acctDraft: {}, showAcctForm: false, acctSkipped: false, acctMsg: '', orderCheck: null, showVal: true, groupDraft: {}, confirmAcceptAll: false, ocrState: { st: 'idle', msg: 'Not loaded yet', detail: 'Loads automatically for a scan or image (about 7 MB, first use only)' }, showFormats: true, ocrMsg: '', logLevel: 'ALL', logRun: 'ALL', confirmClear: false, openInfo: {}, needPw: null, pwText: ''
    };
    this._log = [];
    this._runSeq = 0; this._runId = 0;
    try { const cr = JSON.parse(window.localStorage.getItem('ledgerlens.cprules.v1') || '[]'); if (Array.isArray(cr)) this.state.cpRules = cr; } catch (e) {}
    try { const saved = JSON.parse(window.localStorage.getItem('ledgerlens.log.v1') || '[]'); if (Array.isArray(saved)) { this._log = saved; this.state.log = saved.slice(); this._runSeq = saved.reduce((a, e) => Math.max(a, e.run || 0), 0); } } catch (e) {}
    this._running = false;
  }

  // ---------- helpers ----------
  fmt(n) { if (n === null || n === undefined || isNaN(n)) return ''; return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  fmt0(n) { if (n === null || n === undefined || isNaN(n)) return '–'; return Math.round(n).toLocaleString('en-IN'); }
  pct(n) { return (isNaN(n) || !isFinite(n)) ? '–' : (n * 100).toFixed(1) + '%'; }
  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  money(s) { if (s === null || s === undefined) return null; const t = String(s).replace(/[₹,\s]|INR|Rs\.?/g, '').replace(/(Cr|Dr)$/i, ''); if (!t || isNaN(Number(t))) return null; return Number(t); }
  parseDate(s) {
    if (!s) return null; s = String(s).trim();
    const mon = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return m[1] + '-' + m[2] + '-' + m[3];
    if ((m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/))) { let y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'); }
    if ((m = s.match(/^(\d{1,2})[\s\-]([A-Za-z]{3})[A-Za-z]*[\s\-,]+(\d{2,4})$/))) { const mm = mon[m[2].toLowerCase()]; if (!mm) return null; let y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + String(mm).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0'); }
    return null;
  }
  dayNum(iso) { return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000); }
  isoFromDay(n) { const d = new Date(n * 86400000); return d.toISOString().slice(0, 10); }
  monthLabel(ym) { const n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return n[+ym.slice(5, 7) - 1] + ' ' + ym.slice(2, 4); }
  dispDate(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }

  // ---------- sample statement generator ----------
  genSample(variant) {
    const flags = variant !== 'clean';
    const S = [], J = [], C = [];
    const add = (L, m, d, n, a, t) => L.push({ m, d, n, a, t });
    for (const m of [1, 2, 3]) {
      const MON = ['', 'JAN', 'FEB', 'MAR'][m];
      const salDay = (m === 2 && flags) ? 6 : 1;
      add(S, m, salDay, 'NEFT CR-CITI0000002-ACME TECHNOLOGIES PVT LTD-SALARY ' + MON + ' 2025', m === 3 ? 148200 : 142500, 'C');
      add(S, m, 2, 'IMPS/P2A/50' + m + '912345671/SUNIL KAPOOR/House rent ' + MON, 28000, 'D');
      add(S, m, 3, 'ACH D-HOMEFIN LTD-LN0045821936-EMI ' + MON, 38450, 'D');
      if (m === 2 && flags) {
        add(S, m, 3, 'ACH RTN-HOMEFIN LTD-LN0045821936-INSUFFICIENT FUNDS', 38450, 'C');
        add(S, m, 4, 'NACH RTN CHGS-LN0045821936 INCL GST', 590, 'D');
        add(S, m, 8, 'ACH D-HOMEFIN LTD-LN0045821936-EMI FEB REPRESENT', 38450, 'D');
      }
      add(S, m, 5, 'ACH D-AUTOFIN BANK-LN7781200453-CAR LOAN EMI', 14200, 'D');
      add(S, m, 5, 'ACH D-INDIAFIRST MF-SIP FOLIO 4471223', 10000, 'D');
      if (m === 3 && flags) add(S, m, 5, 'ACH D-QUICKCASH FINTECH-LN-QC88123-EMI', 9100, 'D');
      add(S, m, 6, 'BBPS/ELECTRICITY/NORTHGRID POWER/CA 1029384', [0, 3240, 2980, 2720][m], 'D');
      add(S, m, 7, 'UPI/50' + m + '712349876/FRESHBASKET MART/freshbasket@okaxis/Groceries', [0, 2875, 3105, 3380][m], 'D');
      add(S, m, 8, 'IMPS/P2A/50' + m + '812340001/ROHAN MEHTA/A/C XX4321/Household transfer', 25000, 'D');
      add(S, m, 14, 'NEFT CR-ICIC0000104-STRIPE PAYMENTS INDIA-PAYOUT po_1Q' + MON, [0, 18400, 22650, 25900][m], 'C');
      add(S, m, 15, 'CARD/XX8832/STREAMFLIX SUBSCRIPTION', 649, 'D');
      add(S, m, 16, 'BBPS/BROADBAND/SKYNET FIBER/AC 77812', 1179, 'D');
      add(S, m, 24, 'UPI/50' + m + '412340066/FRESHBASKET MART/freshbasket@okaxis/Groceries', [0, 3420, 2960, 3010][m], 'D');
      add(S, m, 25, 'CC PAYMENT/MERIDIAN CARD XX4417/AUTOPAY', [0, 21850, 26310, 24480][m], 'D');
      if (m === 1) {
        add(S, m, 9, 'UPI/500912340022/SPICE ROUTE CAFE/spiceroute@ybl/Dinner', 1640, 'D');
        add(S, m, 10, 'UPI/501012340033/ANKIT SHARMA/ankit.s@okicici/Split dinner', 820, 'C');
        add(S, m, 11, 'NEFT DR-SBIN0001234-DPS SCHOOL TRUST-Tuition fee Q4', 36500, 'D');
        add(S, m, 12, 'POS/XX8832/CITY FUELS SECTOR 29', 3100, 'D');
        add(S, m, 13, 'ATM WDL/S1AN2231/SECTOR 29 GURUGRAM', 5000, 'D');
        add(S, m, 17, 'UPI/501712340044/CAREWELL PHARMACY/carewell@paytm/Medicines', 1260, 'D');
        add(S, m, 18, 'POS/XX8832/SHOPKART ONLINE', 4999, 'D');
        add(S, m, 20, 'UPI/502012340055/RAHUL VERMA/rahulv@oksbi/Cricket kit share', 1500, 'D');
        add(S, m, 22, 'UPI/REFUND/SHOPKART ONLINE/Order 88123 return', 4999, 'C');
        add(S, m, 27, 'TRF/0091823/MISC', 2000, 'D');
        add(S, m, 28, 'SMS ALERT CHGS QTR INCL GST', 17.70, 'D');
      }
      if (m === 2) {
        add(S, m, 5, 'ACH D-SECURELIFE INSURANCE-POLICY 88231', 6200, 'D');
        if (flags) add(S, m, 10, 'NEFT CR-HDFC0000999-QUICKCASH FINTECH-LOAN DISB LN-QC88123', 50000, 'C');
        add(S, m, 11, 'IMPS/P2A/504112340077/NEHA GUPTA/Concert tickets', 3500, 'C');
        add(S, m, 12, 'POS/XX8832/CITY FUELS SECTOR 29', 2950, 'D');
        add(S, m, 13, 'UPI/504312340088/MR K/q8x2@ybl/', 700, 'D');
        add(S, m, 18, 'UPI/504812340099/SPICE ROUTE CAFE/spiceroute@ybl/Dinner', 2280, 'D');
        add(S, m, 21, 'ATM WDL/S1AN2231/SECTOR 29 GURUGRAM', 6000, 'D');
        add(S, m, 27, 'DEBIT CARD ANNUAL FEE XX8832', 590, 'D');
      }
      if (m === 3) {
        if (flags) {
          add(S, m, 10, 'CASH DEP/BRANCH SECTOR 14/SELF', 49000, 'C');
          add(S, m, 12, 'CASH DEP/BRANCH SECTOR 14/SELF', 48500, 'C');
          add(S, m, 14, 'CASH DEP/BRANCH SECTOR 14/SELF', 49500, 'C');
          add(S, m, 17, 'IMPS/P2A/507612340111/VIKRAM TRADERS/Advance', 75000, 'C');
          add(S, m, 18, 'IMPS/P2A/507712340122/VIKRAM TRADERS/Return advance', 75000, 'D');
        }
        add(S, m, 17, 'UPI/507712340133/CAREWELL PHARMACY/carewell@paytm/Medicines', 840, 'D');
        add(S, m, 19, 'UPI/507912340144/ZOOMCAB RIDES/zoomcab@axl/Ride', 460, 'D');
        add(S, m, 20, 'UPI/508012340155/ANKIT SHARMA/ankit.s@okicici/Trip share', 2400, 'C');
        add(S, m, 22, 'POS/XX8832/SHOPKART ONLINE', 3299, 'D');
        add(S, m, 29, 'UPI/508912340166/SPICE ROUTE CAFE/spiceroute@ybl/Dinner', 1980, 'D');
        add(S, m, 31, 'SB INTEREST CREDIT Q4', 1184, 'C');
      }
      // joint account
      add(J, m, 4, 'NEFT DR-PUNB0112000-GREENVIEW RWA-Maintenance ' + MON, 4500, 'D');
      add(J, m, 8, 'IMPS/P2A/50' + m + '812340001/ROHAN MEHTA/A/C XX7812/Household transfer', 25000, 'C');
      add(J, m, 9, 'NEFT CR-UTIB0000221-PRIYA MEHTA-Household', 15000, 'C');
      add(J, m, 10, 'UPI/50' + m + '012340200/FRESHBASKET MART/freshbasket@okaxis/Monthly groceries', [0, 4200, 3980, 4410][m], 'D');
      add(J, m, 12, 'BBPS/PIPED GAS/METRO GAS/BP 55120', [0, 860, 910, 780][m], 'D');
      add(J, m, 15, 'UPI/50' + m + '512340211/KAMLA DEVI/kamla@ybl/Domestic help ' + MON, 9000, 'D');
      add(J, m, 20, 'BBPS/WATER/CITY JAL BOARD/K 8812', 410, 'D');
      add(J, m, 26, 'UPI/50' + m + '612340222/DAILYMART/dailymart@okhdfc/Groceries', [0, 2650, 2410, 2890][m], 'D');
      if (m === 3) add(J, m, 28, 'UPI/508812340233/LITTLE STARS ACADEMY/lsa@okaxis/Tuition fee March', 4800, 'D');
      // credit card
      if (m === 1) {
        add(C, m, 4, 'APPLE PAY/ZENITH ELECTRONICS/GURUGRAM', 12499, 'D');
        add(C, m, 9, 'INTL TXN/USD 24.99/CLOUDNOTE INC/APPLE PAY', 2148.36, 'D');
        add(C, m, 10, 'FOREX MARKUP FEE 3.5%', 75.19, 'D');
        add(C, m, 14, 'CARD/SKYWAYS AIRLINES/BOOKING 7XQ2', 8640, 'D');
        add(C, m, 19, 'CARD/SPICE ROUTE CAFE', 2310, 'D');
        add(C, m, 25, 'PAYMENT RECEIVED - THANK YOU', 21850, 'C');
        add(C, m, 27, 'CARD/CITY FUELS', 2000, 'D');
      }
      if (m === 2) {
        add(C, m, 3, 'REFUND/SKYWAYS AIRLINES/BOOKING 7XQ2', 8640, 'C');
        add(C, m, 7, 'APPLE PAY/URBAN THREADS', 5400, 'D');
        add(C, m, 9, 'INTL TXN/USD 24.99/CLOUDNOTE INC/APPLE PAY', 2151.20, 'D');
        add(C, m, 10, 'FOREX MARKUP FEE 3.5%', 75.29, 'D');
        if (flags) { add(C, m, 12, 'LATE PAYMENT FEE', 750, 'D'); add(C, m, 12, 'GST ON LATE PAYMENT FEE', 135, 'D'); }
        add(C, m, 18, 'CARD/PLAYARENA GAMING', 1999, 'D');
        add(C, m, 25, 'PAYMENT RECEIVED - THANK YOU', 26310, 'C');
      }
      if (m === 3) {
        add(C, m, 5, 'APPLE PAY/ZENITH ELECTRONICS', 3499, 'D');
        add(C, m, 9, 'INTL TXN/USD 24.99/CLOUDNOTE INC/APPLE PAY', 2156.05, 'D');
        add(C, m, 10, 'FOREX MARKUP FEE 3.5%', 75.46, 'D');
        add(C, m, 15, 'CARD/GRAND ORCHID HOTELS', 14200, 'D');
        add(C, m, 21, 'CARD/SPICE ROUTE CAFE', 1870, 'D');
        add(C, m, 25, 'PAYMENT RECEIVED - THANK YOU', 24480, 'C');
        add(C, m, 28, 'CARD/CITY FUELS', 2500, 'D');
      }
    }
    const order = (L) => L.map((x, i) => ({ ...x, i })).sort((a, b) => a.m - b.m || a.d - b.d || a.i - b.i);
    const rows = (L, open, card) => {
      let b = open;
      return order(L).map((x) => {
        b = Math.round((card ? (x.t === 'D' ? b + x.a : b - x.a) : (x.t === 'D' ? b - x.a : b + x.a)) * 100) / 100;
        const dt = String(x.d).padStart(2, '0') + '/0' + x.m + '/2025';
        const vd = x.n.indexOf('NEFT') === 0 && x.t === 'C' ? String(Math.min(x.d + 1, 28)).padStart(2, '0') + '/0' + x.m + '/2025' : dt;
        return { m: x.m, line: '| ' + dt + ' | ' + vd + ' | ' + x.n + ' | ' + (x.t === 'D' ? this.fmt(x.a) : '') + ' | ' + (x.t === 'C' ? this.fmt(x.a) : '') + ' | ' + this.fmt(b) + ' |' };
      });
    };
    const TH = '| Date | Value Date | Narration | Debit | Credit | Balance |\n|---|---|---|---|---|---|';
    const pages = [];
    const sRows = rows(S, 84250, false), jRows = rows(J, 32600, false), cRows = rows(C, 21850, true);
    const savHead = 'MERIDIAN BANK | Statement of Account\nAccount Holder: ROHAN MEHTA\nAccount Number: 50100234567812\nAccount Type: Savings - Individual\nCurrency: INR\nBranch: Sector 29, Gurugram\nStatement Period: 01/01/2025 to 31/03/2025\nOpening Balance: 84,250.00';
    const jHead = 'MERIDIAN BANK | Statement of Account\nAccount Holder: ROHAN MEHTA & PRIYA MEHTA (Joint)\nAccount Number: 50100987654321\nAccount Type: Savings - Joint\nStatement Period: 01/01/2025 to 31/03/2025\nOpening Balance: 32,600.00';
    const cHead = 'PLATINUM CREDIT CARD | Card Account Statement\nCardholder: ROHAN MEHTA\nCard Number: XXXX XXXX XXXX 4417\nAccount Type: Credit Card\nStatement Period: 01/01/2025 to 31/03/2025\nOpening Balance: 21,850.00 (outstanding)';
    for (const m of [1, 2, 3]) {
      const r = sRows.filter((x) => x.m === m).map((x) => x.line); const h = Math.ceil(r.length / 2);
      pages.push({ head: m === 1 ? savHead : '', body: r.slice(0, h) });
      pages.push({ head: '', body: r.slice(h) });
    }
    for (const m of [1, 2, 3]) pages.push({ head: m === 1 ? jHead : '', body: jRows.filter((x) => x.m === m).map((x) => x.line) });
    for (const m of [1, 2, 3]) pages.push({ head: m === 1 ? cHead : '', body: cRows.filter((x) => x.m === m).map((x) => x.line) });
    const N = pages.length;
    let out = pages.map((p, i) => ({ n: i + 1, text: (p.head ? p.head + '\n\n' : '') + TH + '\n' + p.body.join('\n') + '\n\nPage ' + (i + 1) + ' of ' + N }));
    if (variant === 'jumbled') { const t = out[3]; out[3] = out[4]; out[4] = t; }
    return out.map((p, i) => ({ index: i + 1, text: p.text, chars: p.text.length }));
  }

  // ---------- page conversion (PDF/text) ----------
  async ocrEngine() {
    if (this._ocrP) return this._ocrP;
    this._ocrP = (async () => {
      const T = window.Tesseract;
      if (!T) throw new Error('OCR engine script did not load');
      const t0 = Date.now(); let got = 0;
      let simd = false;
      try { simd = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])); } catch (e) {}
      const cores = (navigator && navigator.hardwareConcurrency) || 2;
      const n = Math.max(1, Math.min(4, cores >= 4 ? cores - 1 : cores));
      this.log('INFO', 'OCR', 'Loading OCR engine (about 7 MB, first use only) — ' + (simd ? 'SIMD-accelerated' : 'standard') + ' core, ' + n + ' parallel worker(s)');
      this.setState({ ocrMsg: 'Loading OCR engine…', ocrState: { st: 'loading', msg: 'Downloading engine files — 0 of 3', detail: 'About 7 MB, first use only' } });
      const get = async (u, kind) => { const r = await fetch(u); if (!r.ok) throw new Error('could not load OCR ' + kind + ' (HTTP ' + r.status + ')'); const t = await r.text(); got++; this.setState({ ocrState: { st: 'loading', msg: 'Downloading engine files — ' + got + ' of 3', detail: kind + ' downloaded' } }); return t; };
      const [wTxt, coreTxt, langB64] = await Promise.all([get('/_blob/0087241456d1e94727651e9f8590019f', 'worker'), get(simd ? '/_blob/e3a702a471db7b12836b4cbef9be0a45' : '/_blob/832811907f63931b00f56362d65c0d26', 'core'), get('/_blob/028b2e7e80ab2afb0d561411fbeed0e6', 'language data')]);
      const coreUrl = URL.createObjectURL(new Blob([coreTxt], { type: 'application/javascript' }));
      // The page blocks fetch() of blob: URLs inside workers, so the language model is embedded in the worker script itself
      // and served to Tesseract from memory instead of over the network.
      const pre = 'var __LB64=' + JSON.stringify(langB64.replace(/\s/g, '')) + ';var __LBytes=null;var __f=self.fetch?self.fetch.bind(self):null;' +
        'self.fetch=function(u,o){if(String(u).indexOf("traineddata")>=0){if(!__LBytes){var b=atob(__LB64);__LBytes=new Uint8Array(b.length);for(var i=0;i<b.length;i++)__LBytes[i]=b.charCodeAt(i);__LB64=null;}return Promise.resolve(new Response(__LBytes.slice(0)));}return __f(u,o)};\n';
      const wUrl = URL.createObjectURL(new Blob([pre + wTxt], { type: 'application/javascript' }));
      this.setState({ ocrState: { st: 'loading', msg: 'Checking browser support for OCR…', detail: 'Files downloaded' } });
      const pr = await this.ocrProbe();
      this.log(pr.ok ? 'INFO' : 'ERROR', 'OCR', 'Browser check — background worker: ' + pr.worker + ' · script loading: ' + pr.imp + ' · WebAssembly: ' + pr.wasm + ' · in-memory data: ' + pr.lang);
      if (!pr.ok) throw new Error(pr.reason);
      const opts = { workerPath: wUrl, corePath: coreUrl + (simd ? '#tesseract-core-simd-lstm.wasm.js' : '#tesseract-core-lstm.wasm.js'), langPath: 'https://lang.local', workerBlobURL: false, gzip: true, cacheMethod: 'none', logger: (m) => this.ocrProgress(m) };
      const tStart = Date.now();
      const tick = setInterval(() => { const el = Math.round((Date.now() - tStart) / 1000); this.setState({ ocrState: { st: 'loading', msg: 'Starting OCR worker… ' + el + ' s', detail: 'Initialising the recognition engine and English model (usually 2–10 s)' } }); }, 1000);
      let first;
      try {
        first = await Promise.race([T.createWorker('eng', 1, opts), new Promise((_, rej) => setTimeout(() => rej(new Error('the OCR worker did not start within 60 s')), 60000))]);
      } finally { clearInterval(tick); }
      await first.setParameters({ preserve_interword_spaces: '1' });
      const sched = T.createScheduler(); sched.addWorker(first);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      this._ocrWorkers = 1;
      this.log('INFO', 'OCR', 'OCR engine ready — loaded in ' + secs + ' s');
      this._ocrReadyAt = this.now().slice(0, 8);
      this.setState({ ocrState: { st: 'ready', msg: 'Ready — loaded in ' + secs + ' s at ' + this._ocrReadyAt, detail: 'English · ' + (simd ? 'SIMD' : 'standard') + ' · adding workers in background' } });
      // extra workers come up in the background; the first one can already work
      for (let k = 1; k < n; k++) {
        T.createWorker('eng', 1, opts).then(async (w) => { await w.setParameters({ preserve_interword_spaces: '1' }); sched.addWorker(w); this._ocrWorkers++; if (this._ocrWorkers === n) { this.log('INFO', 'OCR', n + ' OCR workers running in parallel'); if (this.state.ocrState.st === 'ready') this.setState({ ocrState: { ...this.state.ocrState, detail: 'English · ' + (simd ? 'SIMD' : 'standard') + ' · ' + n + ' parallel workers' } }); } }).catch(() => {});
      }
      return sched;
    })();
    this._ocrP.catch((e) => { this._ocrP = null; const msg = e && e.message ? e.message : String(e); this.log('ERROR', 'OCR', 'OCR engine failed to load: ' + msg); this.setState({ ocrMsg: '', ocrState: { st: 'error', msg: 'Failed to load — ' + msg, detail: 'Digital PDFs, Excel, CSV and text files still work. Try opening the canvas in full-window (Play) view and press Retry.' } }); });
    return this._ocrP;
  }
  ocrProbe() {
    return new Promise((resolve) => {
      const res = { worker: 'blocked', imp: 'not tested', wasm: 'not tested', lang: 'not tested', ok: false, reason: '' };
      let w, url, purl, done = false;
      const finish = (r) => { if (done) return; done = true; try { w && w.terminate(); } catch (e) {} Object.assign(res, r || {});
        res.ok = res.worker === 'ok' && res.imp === 'ok' && res.wasm === 'ok' && res.lang === 'ok';
        if (!res.ok) res.reason = res.worker !== 'ok' ? 'this page does not allow background workers (browser security policy), which OCR needs' : (res.wasm !== 'ok' ? 'WebAssembly is blocked in this page (' + res.wasm + ')' : (res.imp !== 'ok' ? 'scripts cannot be loaded inside the OCR worker (' + res.imp + ')' : 'the language data could not be read inside the OCR worker (' + res.lang + ')'));
        resolve(res); };
      try {
        purl = URL.createObjectURL(new Blob(['self.__p=1;'], { type: 'application/javascript' }));
        const code = 'var r={worker:"ok"};try{importScripts(' + JSON.stringify(purl + '#p.js') + ');r.imp=self.__p===1?"ok":"no effect"}catch(e){r.imp="error: "+e.message}' +
          'var p1;try{p1=WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0])).then(function(){r.wasm="ok"},function(e){r.wasm="error: "+e.message})}catch(e){r.wasm="error: "+e.message;p1=Promise.resolve()}' +
          'var p2=Promise.resolve().then(function(){return new Response(new Uint8Array([1,2,3])).arrayBuffer()}).then(function(x){r.lang=x.byteLength===3?"ok":"bad"},function(e){r.lang="error: "+e.message});' +
          'Promise.all([p1,p2]).then(function(){postMessage(r)});';
        url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
        w = new Worker(url);
        w.onmessage = (e) => finish(e.data);
        w.onerror = (e) => finish({ worker: 'error: ' + ((e && e.message) || 'worker failed to start') });
        setTimeout(() => finish({ worker: res.worker === 'blocked' ? 'no response within 8 s' : res.worker }), 8000);
      } catch (e) { finish({ worker: 'error: ' + e.message }); }
    });
  }
  ocrProgress(m) {
    if (!m || m.status !== 'recognizing text' || (this._ocrActive || 0) > 1) return;
    const pc = Math.round((m.progress || 0) * 100);
    if (pc === this._ocrPc) return; this._ocrPc = pc;
    if (pc % 10 === 0 || pc === 100) this.setState({ ocrMsg: 'OCR ' + (this._ocrLabel || '') + ' — ' + pc + '%', ocrState: { st: 'running', msg: 'Reading ' + (this._ocrLabel || '') + ' — ' + pc + '%', detail: 'Recognising text', pct: pc } });
  }
  async shrink(src) {
    // large photos slow OCR down a lot; cap the long side at ~2400 px
    try {
      const bmp = await createImageBitmap(src);
      const max = 2400; const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
      if (k >= 1) return src;
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      this.log('INFO', 'OCR', 'Image downscaled from ' + bmp.width + '×' + bmp.height + ' to ' + c.width + '×' + c.height + ' for faster OCR', false);
      return c;
    } catch (e) { return src; }
  }
  async ocrRun(src, label) {
    let sched;
    try { sched = await this.ocrEngine(); } catch (e) { throw new Error('OCR engine could not start in this browser (' + (e && e.message ? e.message : e) + ')'); }
    this._ocrActive = (this._ocrActive || 0) + 1; this._ocrQueued = (this._ocrQueued || 0) + 1;
    this._ocrLabel = label; this._ocrPc = -1;
    this.setState({ ocrMsg: 'OCR ' + label + ' — queued', ocrState: { st: 'running', msg: 'Reading ' + (this._ocrActive > 1 ? this._ocrActive + ' pages in parallel' : label), detail: 'Recognising text', pct: 0 } });
    const t0 = Date.now();
    let data;
    try { data = (await sched.addJob('recognize', await this.shrink(src))).data; } finally { this._ocrActive--; }
    const conf = Math.round(data.confidence || 0);
    this._ocrPages = (this._ocrPages || 0) + 1; this._ocrDone = (this._ocrDone || 0) + 1;
    const allDone = this._ocrActive === 0;
    this.setState({ ocrMsg: allDone ? '' : 'OCR — ' + this._ocrDone + ' of ' + this._ocrQueued + ' pages done', ocrState: allDone ? { st: 'ready', msg: 'Completed ' + (this._ocrQueued > 1 ? this._ocrQueued + ' pages' : label) + ' — last confidence ' + conf + '%', detail: 'Engine ready · ' + this._ocrPages + ' page(s) read this session', pct: 100 } : { st: 'running', msg: this._ocrDone + ' of ' + this._ocrQueued + ' pages done', detail: 'Recognising in parallel', pct: Math.round(this._ocrDone / this._ocrQueued * 100) } });
    if (allDone) { this._ocrQueued = 0; this._ocrDone = 0; }
    this.log(conf < 60 ? 'WARN' : 'INFO', 'OCR', label + ' → ' + (data.text || '').split('\n').filter((x) => x.trim()).length + ' lines, confidence ' + conf + '% (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)' + (conf < 60 ? ' — low quality scan, expect review items' : ''));
    return { text: data.text || '', conf };
  }
  xlsDate(d) { const x = new Date(d.getTime() + 500); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0') + '/' + x.getFullYear(); }
  excelToPages(buf, name) {
    const X = window.XLSX; if (!X) throw new Error('Excel reader did not load');
    const wb = X.read(buf, { type: 'array', cellDates: true });
    const q = (v) => { const t = String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const pages = [];
    wb.SheetNames.forEach((sn) => {
      const rows = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      const lines = rows.map((r) => { const c = r.map((v) => (v instanceof Date ? this.xlsDate(v) : (v === null || v === undefined ? '' : String(v).trim()))); while (c.length && c[c.length - 1] === '') c.pop(); return c; }).filter((c) => c.length).map((c) => c.map(q).join(','));
      if (lines.length) { pages.push({ index: pages.length + 1, text: lines.join('\n'), chars: lines.join('').length, sheet: sn }); this.log('INFO', 'Convert', name + ' · sheet "' + sn + '" → ' + lines.length + ' rows as CSV text', false); }
    });
    return pages;
  }
  async renderPdfPage(pg) {
    const base = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: Math.min(2, 2000 / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas'); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
  }
  async pdfToPages(buf, password, ocrName) {
    const lib = window.pdfjsLib;
    if (!lib) throw new Error('PDF engine not loaded yet — try again in a moment.');
    const doc = await lib.getDocument({ data: buf, password: password || undefined, isEvalSupported: false }).promise;
    if (doc.numPages > 300) throw new Error('the PDF has ' + doc.numPages + ' pages — the limit is 300. Split it by period and upload the parts together.');
    const pages = []; const jobs = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.getPage(p);
      const tc = await pg.getTextContent();
      const rows = {};
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = Math.round(it.transform[5] / 3) * 3;
        (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str, w: it.width || 0 });
      }
      const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
      const lines = ys.map((y) => {
        const its = rows[y].sort((a, b) => a.x - b.x); let line = '', end = null;
        for (const it of its) { if (end !== null) line += (it.x - end > 6 ? '   ' : (it.x - end > 1 ? ' ' : '')); line += it.s; end = it.x + it.w; }
        return line;
      });
      const text = lines.join('\n');
      const pageObj = { index: p, text, chars: text.replace(/\s/g, '').length, ocr: false, conf: null };
      if (pageObj.chars < 25 && ocrName) {
        if (!jobs.length) this.ocrEngine().catch(() => {});
        const canvas = await this.renderPdfPage(pg, p);
        jobs.push(this.ocrRun(canvas, ocrName + ' · page ' + p + ' of ' + doc.numPages).then((r) => { pageObj.text = r.text; pageObj.chars = r.text.replace(/\s/g, '').length; pageObj.ocr = true; pageObj.conf = r.conf; }));
      }
      pages.push(pageObj);
    }
    if (jobs.length) { this.log('INFO', 'OCR', ocrName + ': ' + jobs.length + ' scanned page(s) queued for parallel OCR'); await Promise.all(jobs); }
    return pages;
  }
  textToPages(t) {
    let parts = t.split(/\f/);
    if (parts.length === 1) parts = t.split(/\n(?=#{1,3}\s*Page\s+\d+)/i);
    return parts.filter((x) => x.trim()).map((x, i) => ({ index: i + 1, text: x.trim(), chars: x.length }));
  }

  // ---------- validation ----------
  validateOrder(pages) {
    // each uploaded file is numbered on its own ("Page 1 of 5" restarts per file), so check every file separately
    const files = []; const byFile = {};
    pages.forEach((p) => { const f = p.file || '(file)'; if (!byFile[f]) { byFile[f] = []; files.push(f); } byFile[f].push(p); });
    if (files.length > 1) {
      const res = files.map((f) => ({ f, r: this.validateOrderOne(byFile[f], f) }));
      const bad = res.find((x) => !x.r.ok); if (bad) return { ...bad.r, msg: bad.f + ': ' + bad.r.msg };
      const soft = res.filter((x) => x.r.soft); const dc = soft.reduce((a, x) => a + (x.r.datesChecked || 0), 0);
      return { ok: true, method: res.map((x) => x.f + ' — ' + x.r.method).join(' · '), soft: soft.length > 0, datesChecked: soft.length ? dc : undefined };
    }
    return this.validateOrderOne(pages);
  }
  validateOrderOne(pages) {
    if (pages.length === 1) return { ok: true, method: 'single page — nothing to order' };
    const marks = pages.map((p) => { const m = p.text.match(/page\s+(\d+)\s*(?:of|\/)\s*(\d+)/i); return m ? { n: +m[1], of: +m[2] } : null; });
    const found = marks.filter(Boolean).length;
    if (found >= Math.max(2, Math.ceil(pages.length * 0.5))) {
      for (let i = 0; i < marks.length; i++) {
        if (!marks[i]) continue;
        if (marks[i].n !== i + 1) {
          const later = marks.slice(i).filter(Boolean).map((x) => x.n); const inc = later.every((n, k) => k === 0 || n > later[k - 1]);
          if (marks[i].n > i + 1 && inc) { const missing = []; for (let q = i + 1; q < marks[i].n; q++) missing.push(q); return { ok: false, method: 'page numbers', msg: 'Page(s) missing: the file jumps from page ' + i + ' to page ' + marks[i].n + ' of ' + marks[i].of + ' (missing ' + missing.join(', ') + '). Upload the complete statement — missing pages can hide EMIs, bounces or salary.' }; }
          return { ok: false, method: 'page numbers', msg: 'Pages appear jumbled: position ' + (i + 1) + ' in the file carries footer "Page ' + marks[i].n + ' of ' + marks[i].of + '". Expected page ' + (i + 1) + '. Re-scan or re-order the document before extraction.' };
        }
      }
      return { ok: true, method: 'page-number footers (' + found + '/' + pages.length + ' pages)' };
    }
    // no page numbers: check that dates never run backwards from one page to the next (reset when a new account header starts)
    let prevLast = null, prevIdx = null, checked = 0;
    for (const p of pages) {
      const meta = this.readMeta(p.text); if (meta.account) { prevLast = null; prevIdx = null; }
      const rows = this.parseRows(p.text).filter((r) => r.date); if (!rows.length) continue;
      const first = rows[0].date, last = rows.reduce((m, r) => (r.date > m ? r.date : m), rows[0].date);
      if (prevLast) {
        checked++;
        if (this.dayNum(first) < this.dayNum(prevLast) - 1) return { ok: false, method: 'date continuity', msg: 'Pages appear jumbled: page ' + p.index + ' starts on ' + this.dispDate(first) + ', earlier than the last date on page ' + prevIdx + ' (' + this.dispDate(prevLast) + '). The file has no page numbers, so order was checked by dates. Re-order or re-scan before extraction.' };
      }
      prevLast = last; prevIdx = p.index;
    }
    if (checked) return { ok: true, method: 'date continuity across ' + checked + ' page change(s) — no page numbers in the file', soft: true, datesChecked: checked };
    return { ok: true, method: 'not verifiable — no page numbers and fewer than two pages with dates', soft: true, datesChecked: 0 };
  }

  // ---------- extraction ----------
  readMeta(text) {
    const g = (re) => { const m = text.match(re); return m ? m[1].trim() : null; };
    const meta = {};
    meta.bank = g(/(?:Bank\s*Name\s*[:\-,]\s*)([^\n|,]+)/i) || g(/^[ \t]*([A-Z][A-Za-z&. \t]*\bBANK\b(?:[ \t]+(?:LTD\.?|LIMITED))?)/im);
    meta.account = g(/(?:Account|A\/C|Card)\s*(?:Number|No\.?)\s*[:\-,]?\s*"?([X\d][X\d\s\-]{3,24}\d)/i);
    meta.currency = g(/Currency\s*[:\-,]?\s*([A-Z]{3})\b/) || g(/Amounts?\s+in\s+([A-Z]{3})\b/i);
    meta.holder = g(/(?:Account\s*Holder|Cardholder|Customer\s*Name)\s*[:\-,]\s*([^\n|,]+)/i);
    meta.type = g(/Account\s*Type\s*[:\-,]\s*([^\n|,]+)/i);
    const ob = g(/Opening\s*Balance\s*[:\-,]?\s*"?(?:INR|Rs\.?|₹)?\s*(\d[\d,]*\.\d{1,2}|\d+)/i);
    meta.opening = ob ? this.money(ob) : null;
    const cb = g(/Closing\s*Balance\s*[:\-,]?\s*"?(?:INR|Rs\.?|₹)?\s*(\d[\d,]*\.\d{1,2}|\d+)/i);
    meta.closing = cb ? this.money(cb) : null;
    const per = text.match(/(?:Statement\s*Period|Period|From)\s*[:\-,]?\s*(\d{1,2}[\/\-.](?:\d{1,2}|[A-Za-z]{3})[\/\-.]\d{2,4})\s*(?:to|-|–|To)\s*(\d{1,2}[\/\-.](?:\d{1,2}|[A-Za-z]{3})[\/\-.]\d{2,4})/i);
    if (per) { meta.periodFrom = this.parseDate(per[1].replace(/-([A-Za-z]{3})-/, ' $1 ')) || this.parseDate(per[1]); meta.periodTo = this.parseDate(per[2].replace(/-([A-Za-z]{3})-/, ' $1 ')) || this.parseDate(per[2]); }
    if (meta.account) meta.account = meta.account.replace(/\s+/g, ' ').trim();
    Object.keys(meta).forEach((k) => { if (meta[k] === null || meta[k] === undefined) delete meta[k]; });
    return meta;
  }
  csvSplit(line) { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; }
  parseRows(text) {
    const out = []; let cols = null; const lines = text.split('\n');
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      const isPipe = line.indexOf('|') >= 0 && line.split('|').length >= 5;
      let csv = null;
      if (!isPipe && line.indexOf(',') >= 0) {
        const cc = this.csvSplit(line);
        const lc0 = cc.map((c) => c.toLowerCase());
        if (cc.length >= 4 && (this.parseDate(cc[0]) || (lc0.some((c) => c.indexOf('date') >= 0) && lc0.some((c) => /balance|narration|description|particulars|debit|credit/.test(c))))) csv = cc;
      }
      if (isPipe || csv) {
        const cells = csv || line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
        if (isPipe && /^[-:\s|]+$/.test(line)) continue;
        if (!this.parseDate(cells[0])) {
          const lc = cells.map((c) => c.toLowerCase());
          if (lc.some((c) => c.indexOf('date') >= 0)) {
            cols = {
              date: lc.findIndex((c) => c === 'date' || c === 'txn date' || c === 'transaction date'), vdate: lc.findIndex((c) => c.indexOf('value') >= 0),
              narr: lc.findIndex((c) => /narration|description|particulars|details/.test(c)), dr: lc.findIndex((c) => /debit|withdrawal/.test(c)),
              cr: lc.findIndex((c) => /credit|deposit/.test(c)), bal: lc.findIndex((c) => /balance/.test(c))
            };
            if (cols.date < 0) cols.date = 0;
          }
          continue;
        }
        const c = cols || { date: 0, vdate: 1, narr: 2, dr: 3, cr: 4, bal: 5 };
        out.push({ date: this.parseDate(cells[c.date]), vdate: this.parseDate(cells[c.vdate]) || this.parseDate(cells[c.date]), narr: cells[c.narr] || '', dr: this.money(cells[c.dr]), cr: this.money(cells[c.cr]), bal: this.money(cells[c.bal]) });
        continue;
      }
      const DT = '(\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}|\\d{1,2}[\\s\\-][A-Za-z]{3}[\\s\\-,]+\\d{2,4}|\\d{4}-\\d{2}-\\d{2})';
      const re = new RegExp('^' + DT + '\\s+(?:' + DT + '\\s+)?(.*)$');
      const m = line.match(re);
      if (m && this.parseDate(m[1])) {
        const rest = m[3].replace(/\s[^\w\s₹/]{1,2}(?=\s|$)/g, ' ').replace(/\s+$/, ''); // drop stray OCR specks between columns
        // only the amounts at the END of the line are debit / credit / balance; numbers inside the narration (e.g. "USD 24.99/…") are ignored
        const tail = rest.match(/((?:\s+-?[\d,]+\.\d{2}(?:\s*(?:Cr|Dr|CR|DR)\b)?){1,3})\s*$/);
        const nums = tail ? (tail[1].match(/-?[\d,]+\.\d{2}(?:\s*(?:Cr|Dr|CR|DR)\b)?/g) || []) : [];
        if (nums.length >= 1) {
          let narr = tail ? rest.slice(0, rest.length - tail[0].length) : rest;
          narr = narr.replace(/\s{2,}/g, ' ').trim();
          const vals = nums.map((n) => this.money(n.replace(/\s*(Cr|Dr|CR|DR)$/, '')));
          const crdr = /cr$/i.test(nums[0].trim()) ? 'C' : (/dr$/i.test(nums[0].trim()) ? 'D' : null);
          const row = { date: this.parseDate(m[1]), vdate: this.parseDate(m[2]) || this.parseDate(m[1]), narr, bal: vals.length >= 2 ? vals[vals.length - 1] : null, amt: vals.length >= 2 ? vals[vals.length - 2] : vals[0], hint: crdr, loose: true };
          if (vals.length >= 3) { row.dr = vals[vals.length - 3] || null; row.cr = vals[vals.length - 2] || null; delete row.amt; delete row.loose; }
          out.push(row);
        }
      } else if (out.length && !/page\s+\d+/i.test(line) && !/balance|statement|account|period/i.test(line) && line.length < 80 && !/\d+\.\d{2}/.test(line)) {
        // a lone Cr/Dr after a wide gap is the balance's sign marker wrapped onto this line, not narration
        const last = out[out.length - 1]; const cont = line.replace(/\s{2,}(?:CR|DR)\.?$/i, '').trim(); if (last.loose && cont && !/^(?:CR|DR)\.?$/i.test(cont)) last.narr += ' ' + cont;
      }
    }
    return out;
  }

  extract(pages) {
    const batches = []; const accounts = {}; const raw = [];
    let ctx = {}; const BATCH = 3;
    for (let b = 0; b * BATCH < pages.length; b++) {
      const bp = pages.slice(b * BATCH, b * BATCH + BATCH);
      const inherited = new Set(); const startCtx = { ...ctx }; let found = 0; const accs = new Set(); const noHead = [];
      for (const p of bp) {
        const meta = this.readMeta(p.text);
        if (meta.account && meta.account !== ctx.account) {
          const keep = { bank: ctx.bank, currency: ctx.currency };
          ctx = { ...meta };
          ['bank', 'currency'].forEach((k) => { if (!ctx[k] && keep[k]) { ctx[k] = keep[k]; inherited.add(k + ' (from previous batch/page)'); } });
          if (!ctx.holder && startCtx.holder) { ctx.holder = startCtx.holder; inherited.add('holder'); }
        } else {
          Object.keys(meta).forEach((k) => { if (!ctx[k]) ctx[k] = meta[k]; });
          if (!meta.account && ctx.account) { inherited.add('account no., bank, currency'); noHead.push(p.index); }
        }
        const rows = this.parseRows(p.text);
        if (rows.length && !ctx.account) { ctx.account = 'UNKNOWN-' + (Object.keys(accounts).length + 1); }
        const key = ctx.account;
        if (key && !accounts[key]) {
          const isCard = /card/i.test((ctx.type || '') + ' ' + key);
          accounts[key] = { key, bank: ctx.bank || 'Unknown bank', currency: ctx.currency || 'INR', holder: ctx.holder || '—', type: ctx.type || (isCard ? 'Credit Card' : 'Savings'), card: isCard, opening: ctx.opening, periodFrom: ctx.periodFrom, periodTo: ctx.periodTo, last4: key.replace(/\D/g, '').slice(-4), pages: [] };
        }
        if (key) { const a = accounts[key]; if (!a.bank || a.bank === 'Unknown bank') a.bank = ctx.bank || a.bank; if (meta.closing !== undefined && meta.closing !== null) a.closing = meta.closing; a.pages.push(p.index); accs.add(key); }
        rows.forEach((r) => { raw.push({ ...r, account: key, page: p.index, batch: b + 1 }); found++; });
      }
      // a batch with no metadata at all but rows -> also try forward inheritance later
      batches.push({ n: b + 1, pages: bp.map((p) => p.index).join('–').replace(/^(\d+)–.*–(\d+)$/, '$1–$2'), rows: found, accounts: Array.from(accs).map((k) => '…' + k.replace(/\D/g, '').slice(-4)).join(', '), inherited: (Array.from(inherited).join('; ') + (noHead.length ? ' → pages ' + noHead.join(', ') + ' have no header' : '')) || '—' });
    }
    // backward fill: accounts that never got a bank/currency inherit from the next account found
    const list = Object.values(accounts);
    list.forEach((a, i) => { if (a.bank === 'Unknown bank') { const nb = list.slice(i + 1).find((x) => x.bank !== 'Unknown bank'); if (nb) { a.bank = nb.bank; a.inheritedFwd = true; } } });
    // resolve debit/credit for loose rows using running balance
    const prevBal = {};
    list.forEach((a) => { prevBal[a.key] = a.opening; });
    raw.forEach((r) => {
      const a = accounts[r.account]; const pb = prevBal[r.account];
      if (r.loose) {
        if (pb !== null && pb !== undefined && r.bal !== null) {
          const dSign = a.card ? 1 : -1;
          if (Math.abs(pb + dSign * r.amt - r.bal) < 0.02) r.dr = r.amt; else if (Math.abs(pb - dSign * r.amt - r.bal) < 0.02) r.cr = r.amt;
          else if (r.hint === 'C') r.cr = r.amt; else r.dr = r.amt;
        } else if (r.hint === 'C' || /\bCR\b|CREDIT|REFUND|SALARY/i.test(r.narr)) r.cr = r.amt; else r.dr = r.amt;
      }
      if (r.bal !== null && r.bal !== undefined) prevBal[r.account] = r.bal;
    });
    return { batches, accounts: list, raw };
  }

  // ---------- LLM step (hooks) ----------
  // The engine stays model-agnostic and runs in the browser, which holds no API key. A host (the CLI) overrides
  // llmEnabled / llmExtractBatch / llmClassify to call a real model; without one, every run is rules-only.
  llmEnabled() { return false; }
  llmExtractMode() { return 'auto'; } // auto: only batches the rules cannot read · all: every batch · off
  async llmExtractBatch(req) { throw new Error('no LLM configured'); }
  async llmClassify(req) { throw new Error('no LLM configured'); }
  // A page "looks like a statement page the rules missed" when it carries several dates but parseRows found nothing.
  llmNeedsPage(p) {
    const rows = this.parseRows(p.text).filter((r) => r.dr > 0 || r.cr > 0 || r.amt > 0);
    if (rows.length) {
      // rules read rows, but are they right? missing balances or a broken balance chain → let the model re-read the page
      const withBal = rows.filter((r) => r.bal !== null && r.bal !== undefined);
      if (withBal.length < rows.length * 0.8) return true;
      let breaks = 0;
      for (let i = 1; i < rows.length; i++) {
        const pb = rows[i - 1].bal, b = rows[i].bal, a = rows[i].dr || rows[i].cr || rows[i].amt || 0;
        if (pb === null || pb === undefined || b === null || b === undefined) continue;
        if (Math.abs(pb - a - b) > 0.02 && Math.abs(pb + a - b) > 0.02) breaks++;
      }
      return breaks > 0;
    }
    const dates = (p.text.match(/\b\d{1,2}[\/\-.](?:\d{1,2}|[A-Za-z]{3})[\/\-.]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g) || []).length;
    return dates >= 3;
  }
  // Model output -> the engine's own page format (header "Key: Value" lines + pipe table), so metadata inheritance,
  // debit/credit resolution and every validation check run on LLM output exactly as they do on rule output.
  llmPageText(pg, orig) {
    const m = pg.metadata || {}; const L = [];
    const dmy = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
    const num = (v) => (v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v).toFixed(2));
    const clean = (t) => String(t || '').replace(/[|\n\r]+/g, ' / ').replace(/\s+/g, ' ').trim();
    if (m.bank_name) L.push('Bank Name: ' + clean(m.bank_name));
    if (m.account_number) L.push('Account Number: ' + clean(m.account_number));
    if (m.account_holder) L.push('Account Holder: ' + clean(m.account_holder));
    if (m.account_type) L.push('Account Type: ' + clean(m.account_type));
    if (m.currency) L.push('Currency: ' + clean(m.currency).toUpperCase());
    if (m.opening_balance !== null && m.opening_balance !== undefined) L.push('Opening Balance: ' + num(m.opening_balance));
    if (m.closing_balance !== null && m.closing_balance !== undefined) L.push('Closing Balance: ' + num(m.closing_balance));
    if (m.period_from && m.period_to) L.push('Statement Period: ' + dmy(m.period_from) + ' to ' + dmy(m.period_to));
    L.push('| Date | Value Date | Narration | Debit | Credit | Balance |', '|---|---|---|---|---|---|');
    (pg.transactions || []).forEach((t) => {
      const d = dmy(t.date); if (!d) return;
      L.push('| ' + d + ' | ' + (dmy(t.value_date) || d) + ' | ' + clean(t.narration) + ' | ' + num(t.debit) + ' | ' + num(t.credit) + ' | ' + num(t.balance) + ' |');
    });
    const foot = (orig.match(/Page\s+\d+\s+of\s+\d+/i) || [])[0]; if (foot) L.push(foot);
    return L.join('\n');
  }
  async llmExtract(pages) {
    const mode = this.llmExtractMode(); if (mode === 'off') return pages;
    const BATCH = 3; const out = pages.slice(); let ctx = {}; let used = 0, failed = 0;
    for (let b = 0; b * BATCH < pages.length; b++) {
      const bp = pages.slice(b * BATCH, b * BATCH + BATCH);
      bp.forEach((p) => { const m = this.readMeta(p.text); ['bank', 'account', 'currency', 'holder'].forEach((k) => { if (m[k]) ctx[k] = m[k]; }); });
      const need = mode === 'all' || bp.some((p) => this.llmNeedsPage(p));
      if (!need) continue;
      try {
        const t0 = Date.now();
        const res = await this.llmExtractBatch({ batch: b + 1, pages: bp.map((p) => ({ index: p.index, text: p.text })), carried: { bank_name: ctx.bank || null, account_number: ctx.account || null, currency: ctx.currency || null, account_holder: ctx.holder || null } });
        const byIdx = {}; (res.pages || []).forEach((pg) => { byIdx[pg.page_index] = pg; });
        let rows = 0;
        bp.forEach((p) => {
          const pg = byIdx[p.index]; if (!pg) return;
          const ruleRows = this.parseRows(p.text).filter((r) => r.dr > 0 || r.cr > 0 || r.amt > 0).length; const n = (pg.transactions || []).length; rows += n;
          if (mode === 'all' && ruleRows && ruleRows !== n) this.log('WARN', 'LLM extract', 'Page ' + p.index + ': model read ' + n + ' rows, rules read ' + ruleRows + ' — balance checks will decide', false);
          const meta = pg.metadata || {}; ['bank_name', 'account_number', 'currency', 'account_holder'].forEach((k) => { if (meta[k]) ctx[{ bank_name: 'bank', account_number: 'account', currency: 'currency', account_holder: 'holder' }[k]] = meta[k]; });
          out[pages.indexOf(p)] = { ...p, text: this.llmPageText(pg, p.text), srcText: p.text, llm: true };
        });
        used++;
        this.log('INFO', 'LLM extract', 'Batch ' + (b + 1) + ' (pages ' + bp.map((p) => p.index).join(', ') + '): ' + rows + ' rows read by ' + (res.model || 'model') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s', false);
      } catch (e) {
        failed++;
        this.log('WARN', 'LLM extract', 'Batch ' + (b + 1) + ' failed (' + (e && e.message ? e.message : e) + ') — kept the rule-based reading', false);
      }
    }
    if (used || failed) this.log('INFO', 'LLM extract', used + ' batch(es) read by the model' + (failed ? ', ' + failed + ' fell back to rules' : ''), false);
    return out;
  }
  // Rows the rules are unsure about (low category or counterparty confidence, OTHER, lexical guesses) go to the model in chunks.
  async llmLabelRows(T, threshold) {
    const cand = T.filter((t) => t.method !== 'MANUAL' && (t.conf < threshold || t.cpConf < threshold || /^OTHER_/.test(t.l2) || t.lexical));
    if (!cand.length) return {};
    const tax = this.taxonomy(); const labels = {}; const CHUNK = 40; let failed = 0;
    for (let i = 0; i < cand.length; i += CHUNK) {
      const part = cand.slice(i, i + CHUNK);
      try {
        const res = await this.llmClassify({
          holders: Array.from(new Set(T.map((t) => t.acct && t.acct.holder).filter((h) => h && h !== '—'))),
          taxonomy: tax.map((x) => ({ code: x.code, level1: x.l1, group: x.group })),
          rows: part.map((t) => ({ id: t.id, narration: t.narr, level1: t.l1, amount: t.amount, channel: t.channel, rule_counterparty: t.cp, rule_counterparty_confidence: Math.round(t.cpConf * 100) / 100, rule_category: t.l2, rule_confidence: Math.round(t.conf * 100) / 100 }))
        });
        const ids = new Set(part.map((t) => t.id));
        (res.labels || []).forEach((l) => {
          const t = part.find((x) => x.id === l.id);
          // validate the model's answer against the taxonomy and Level 1 before accepting it
          if (!t || !ids.has(l.id) || !tax.some((x) => x.code === l.level2 && x.l1 === t.l1)) return;
          labels[l.id] = { l2: l.level2, conf: this.clamp(Number(l.confidence) || 0, 0, 0.95), cp: String(l.counterparty || '').trim().toUpperCase() || null, cpConf: this.clamp(Number(l.counterparty_confidence) || 0, 0, 0.95), why: String(l.reason || '').slice(0, 160), model: res.model || 'model' };
        });
      } catch (e) {
        failed++;
        this.log('WARN', 'LLM classify', 'Chunk ' + (i / CHUNK + 1) + ' failed (' + (e && e.message ? e.message : e) + ') — kept rule labels', false);
      }
    }
    this.log('INFO', 'LLM classify', cand.length + ' uncertain row(s) sent to the model · ' + Object.keys(labels).length + ' label(s) accepted' + (failed ? ' · ' + failed + ' chunk(s) failed' : ''), false);
    return labels;
  }

  // ---------- enrichment ----------
  normNarr(n) {
    // strip bank-specific wrappers so one set of patterns covers many banks
    let u = String(n || '').replace(/\s+/g, ' ').trim();
    u = u.replace(/^(?:TO|BY)\s+TRANSFER\s*-\s*/i, '').replace(/^(?:DEP|WDL)\s+TFR\s*/i, '').replace(/^TRANSFER\s+(?:FROM|TO)\s+/i, '');
    return u;
  }
  channelOf(n) {
    const u = this.normNarr(n).toUpperCase();
    const tests = [['UPI', /^UPI\b|\bUPI[\/\-]/], ['NEFT', /\bNEFT\b/], ['IMPS', /\bIMPS\b|^MMT\//], ['RTGS', /\bRTGS\b/], ['NACH/ACH', /\bN?ACH\b|\bACHDR\b|\bECS\b|\bNACH\b/],
      ['ATM', /\bATM\b|^NWD[\-\s:]|^EAW[\-\s:]|^ATW[\-\s:]|\bCASH WDL\b/], ['CHEQUE', /\bCHQ|CHEQUE|\bCLG\b|\bI\/W\b|\bO\/W\b|\bMICR\b/], ['CASH', /CASH DEP|\bBY CASH\b|\bCDM\b|CASH DEPOSIT/], ['BBPS', /\bBBPS\b|BILLPAY|\bBPAY\b|^BIL\//],
      ['CARD', /^POS\b|^CARD\/|^VPS\/|^IPS\/|^PCD\/|^ECOM\b|APPLE PAY|GOOGLE PAY|INTL TXN|\bME DC\b/], ['INTERNAL', /CHGS|CHRG|CHARGES|\bFEE\b|INTEREST|\bINT\.?\s?PD\b|\bGST\b|\bTDS\b|PAYMENT RECEIVED|^CC PAYMENT|^REFUND|\bMIN BAL|\bAMB\b/], ['TRANSFER', /^TRF|TRANSFER|^INF\/|\bINFT\b/]];
    for (const [c, re] of tests) if (re.test(u)) return c;
    return 'OTHER';
  }
  cleanCp(x) { return String(x || '').replace(/\s{2,}/g, ' ').replace(/^[\s\-*:\/]+|[\s\-*:\/]+$/g, '').trim(); }
  weakCp(x) { const t = this.cleanCp(x); return !t || t.length < 4 || /^[A-Z]{1,3}\s?[A-Z]?$/i.test(t) || /^\d+$/.test(t) || /^(PAYMENT|UPI|NA|NULL|SENT|PAY|TRANSFER|NEFT|IMPS|TXN)$/i.test(t); }
  counterpartyOf(n, ch, bank) {
    const u = this.normNarr(n); let m;
    const out = (cp, c, fmt, trusted) => { cp = this.cleanCp(cp); if (!trusted && this.weakCp(cp)) c = Math.min(c, 0.45); return { cp: cp || 'UNIDENTIFIED', c, fmt }; };
    const vpa = (u.match(/([A-Za-z0-9._]{2,})@([A-Za-z]{2,})/) || [])[1];
    if (/\bRTN\s*CHG|\bRTN\s*CHRG|RETURN\s*CHARGE|BOUNCE\s*CHG/i.test(u)) return out(bank || 'Bank', 0.9, 'Bank-generated (return charge)', true);
    // ---- UPI ----
    if ((m = u.match(/^UPI\/(?:DR|CR)\/\d{6,}\/([^\/]+)\//i))) return out(m[1], 0.93, 'UPI · SBI style');
    if ((m = u.match(/^UPI\/(?:P2[AMP]|P2PM)\/\d{6,}\/([^\/]+)/i))) return out(m[1], 0.93, 'UPI · Axis style');
    if ((m = u.match(/^UPI\/(?:REFUND|[A-Z0-9]+)\/([^\/]+)\//i)) && !/@/.test(m[1]) && !/^\d+$/.test(m[1])) {
      // ICICI puts a remark in this slot and the VPA later; prefer a name-looking field
      if (/^(PAYMENT|PAY|SENT|UPI|NA|COLLECT|REQUEST)/i.test(m[1].trim()) && vpa) return out(vpa.toUpperCase(), 0.75, 'UPI · ICICI style (VPA only)');
      return out(m[1], 0.95, 'UPI · slash');
    }
    if ((m = u.match(/^UPI\/([A-Z][A-Z .&']{2,})\/\d{6,}/i))) return out(m[1], 0.93, 'UPI · Kotak style');
    if ((m = u.match(/^UPI-([^-]+)-/i))) return out(m[1], 0.94, 'UPI · HDFC style');
    if (/^UPI/i.test(u) && vpa) return out(vpa.toUpperCase(), 0.7, 'UPI · VPA only');
    // ---- NEFT / RTGS ----
    if ((m = u.match(/^(?:NEFT|RTGS)\*[A-Z]{4}0[A-Z0-9]{6}\*[A-Z0-9]+\*([^*]+)/i))) return out(m[1], 0.92, 'NEFT · SBI style');
    if ((m = u.match(/^(?:NEFT|RTGS)\s*(?:CR|DR|IN|OUT)?\s*[-:]\s*[A-Z0-9]+\s*[-\/]\s*([^-\/]+)/i)) && !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(m[1].trim())) return out(m[1], 0.93, 'NEFT/RTGS · hyphen');
    if ((m = u.match(/^(?:NEFT|RTGS)\s*(?:CR|DR)?\s*[-:]\s*[A-Z]{4}0[A-Z0-9]{6}\s*[-\/]\s*([^-\/]+)/i))) return out(m[1], 0.93, 'NEFT/RTGS · IFSC first');
    if ((m = u.match(/^(?:NEFT|RTGS)\b.*?\b(?:FROM|TO)\s+([A-Z][A-Z .&]{2,}?)(?:\s+(?:PURPOSE|UTR|REF|INV|A\/?C|IFSC|MOBILE)\b|$)/i))) return out(m[1], 0.88, 'NEFT/RTGS · FROM/TO');
    if ((m = u.match(/^(?:NEFT|RTGS)\s+(?:CR|DR)\s+[A-Z]{4}0[A-Z0-9]{6}\s+([A-Z][A-Z .&]{2,}?)(?:\s+[A-Z]*\d|$)/i))) return out(m[1], 0.85, 'NEFT/RTGS · spaced');
    // ---- IMPS ----
    if ((m = u.match(/^MMT\/IMPS\/\d+\/[^\/]*\/([^\/]+)/i))) return out(m[1], 0.9, 'IMPS · ICICI MMT');
    if ((m = u.match(/^IMPS\/[A-Z0-9]+\/[0-9]+\/([^\/]+)\//i))) return out(m[1], 0.93, 'IMPS · slash');
    if ((m = u.match(/^IMPS[\-\/]\d{6,}[\-\/]([^\-\/]+)/i))) return out(m[1], 0.92, 'IMPS · HDFC style');
    if ((m = u.match(/^(?:INB\s+)?IMPS\b.*?\bFROM\s+([A-Z][A-Z .&]{2,}?)(?:\s+(?:MOBILE|TO|A\/?C|IFSC|REF)\b|$)/i))) return out(m[1], 0.88, 'IMPS · FROM');
    // ---- NACH / ACH / ECS ----
    if ((m = u.match(/^N?ACH\s*(?:DR|D|CR|C)\s*-?\s*([^-\/]+?)(?:-|\s+\d{6,}|$)/i))) return out(m[1], 0.92, 'NACH/ACH');
    if ((m = u.match(/^(?:DEBIT-)?ACHDR\s+([A-Z][A-Z .&]+?)(?:\s+\d|$)/i))) return out(m[1], 0.9, 'ACH · SBI style');
    if ((m = u.match(/^(?:N?ACH|ECS)\s*(?:RTN|RETURN)\s*[-:]?\s*([^-\/]+)-/i))) return out(m[1], 0.92, 'ACH return');
    if ((m = u.match(/^ECS\s*[-\/]?\s*(?:DR|CR)?\s*[-\/]?\s*([A-Z][A-Z .&]+?)(?:\s*\d|-|\/|$)/i))) return out(m[1], 0.88, 'ECS');
    if ((m = u.match(/^NACH[-\/](?:DR|CR)?[-\/]?([^-\/]+)/i))) return out(m[1], 0.9, 'NACH');
    // ---- bills, internal transfers ----
    if ((m = u.match(/^BBPS\/[^\/]+\/([^\/]+)/i))) return out(m[1], 0.92, 'BBPS');
    if ((m = u.match(/^BIL\/(?:ONL|BPAY|INFT)?\/?[^\/]*\/([^\/]+)/i))) return out(m[1], 0.88, 'Bill pay · ICICI BIL');
    if ((m = u.match(/^INF\/(?:INFT\/)?[^\/]*\/([^\/]+)/i))) return out(m[1], 0.86, 'Internal transfer · ICICI INF');
    // ---- cards ----
    if ((m = u.match(/^INTL TXN\/[A-Z]{3}\s[\d.]+\/([^\/]+)/i))) return out(m[1], 0.9, 'Card · international');
    if ((m = u.match(/^(?:POS|CARD)\/(?:XX\d{4}\/)?([^\/]+)/i))) return out(m[1].replace(/\s+SECTOR.*$/i, ''), 0.9, 'Card · POS slash');
    if ((m = u.match(/^POS\s+(?:REF\s+)?\d{4,6}X+\d{4}\s+(.+?)(?:\s+\d{2}[\/\-]\d{2}|\s*$)/i))) return out(m[1], 0.88, 'Card · HDFC POS');
    if ((m = u.match(/^(?:VPS|IPS|PCD)\/([^\/]+)/i))) return out(m[1], 0.88, 'Card · ICICI/Axis POS');
    if ((m = u.match(/^ME DC SI\s+\d+X*\d*\s+(.+)/i))) return out(m[1], 0.85, 'Card · standing instruction');
    if ((m = u.match(/^APPLE PAY\/([^\/]+)/i))) return out(m[1], 0.9, 'Card · Apple Pay');
    if ((m = u.match(/^ECOM\s+(?:PUR\s*\/?\s*)?([A-Z][^\/]+)/i))) return out(m[1], 0.85, 'Card · e-commerce');
    if ((m = u.match(/^REFUND\/([^\/]+)/i))) return out(m[1], 0.9, 'Refund');
    // ---- cash, cheque, bank-generated ----
    if (/^ATM\b|^NWD[\-\s:]|^EAW[\-\s:]|^ATW[\-\s:]|\bCASH WDL\b/i.test(u)) return out('Self (ATM cash)', 0.9, 'ATM', true);
    if (/^CASH DEP|\bBY CASH\b|\bCDM\b|CASH DEPOSIT/i.test(u)) return out('Self (cash deposit)', 0.88, 'Cash deposit', true);
    if ((m = u.match(/(?:CHQ|CHEQUE)\s*(?:PAID|DEP|ISSUED)?\b.*?(?:-|\/)\s*([A-Z][A-Z .&]{3,})$/i))) return out(m[1], 0.75, 'Cheque');
    if (/\bCLG\b|CHQ|CHEQUE|\bI\/W\b|\bO\/W\b/i.test(u)) return out('Cheque counterparty (not printed)', 0.55, 'Cheque', true);
    if (/PAYMENT RECEIVED|^CC PAYMENT/i.test(u)) return out('Own card account', 0.9, 'Card bill', true);
    if (/CHGS|CHRG|CHARGES|\bFEE\b|INTEREST|\bINT\.?\s?PD\b|\bGST\b|\bTDS\b|\bMIN BAL|\bAMB\b|\bDTAX\b/i.test(u)) return out(bank || 'Bank', 0.9, 'Bank-generated', true);
    if ((m = u.match(/\b(?:FROM|TO)\s+([A-Z][A-Z .&]{3,}?)(?:\s+(?:A\/?C|REF|MOBILE|IFSC)\b|\s*$)/i))) return out(m[1], 0.7, 'FROM/TO');
    if (vpa) return out(vpa.toUpperCase(), 0.65, 'VPA only');
    const words = (u.match(/[A-Za-z]{3,}(?:\s+[A-Za-z]{2,}){1,3}/g) || []).filter((w) => !/^(NEFT|IMPS|UPI|TRF|MISC|PAYMENT|TRANSFER)/i.test(w));
    if (words.length) return { cp: words[0], c: 0.5, fmt: 'Guess from words' };
    return { cp: 'UNIDENTIFIED', c: 0.15, fmt: 'No pattern' };
  }
  attrsOf(n) {
    const a = []; let m;
    if ((m = n.match(/\b(LN-?[A-Z]*\d{5,})/i))) a.push({ k: 'Loan a/c', v: m[1] });
    if ((m = n.match(/\bXX(\d{4})\b/i)) && !/A\/C\s*XX/i.test(n)) a.push({ k: 'Card', v: '••' + m[1] });
    if ((m = n.match(/A\/C\s*(?:NO\.?\s*)?(X*\d{4,})/i))) a.push({ k: 'Cpty a/c', v: m[1] });
    const plat = ['STRIPE', 'APPLE PAY', 'GOOGLE PAY', 'PAYPAL', 'RAZORPAY', 'PHONEPE', 'PAYTM'].find((p) => n.toUpperCase().indexOf(p) >= 0);
    if (plat) a.push({ k: 'Platform', v: plat.replace(/\b\w/g, (c) => c).toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) });
    if ((m = n.match(/\b(USD|EUR|GBP|AED|SGD)\s([\d.]+)/))) a.push({ k: 'Orig', v: m[1] + ' ' + m[2] });
    if ((m = n.match(/\b([A-Za-z0-9._]{2,}@[A-Za-z]{2,})\b/))) a.push({ k: 'VPA', v: m[1].toLowerCase() });
    if ((m = n.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i))) { const code = m[1].toUpperCase(); a.push({ k: 'IFSC', v: code }); const bn = this.ifscBanks()[code.slice(0, 4)]; if (bn) a.push({ k: 'Cpty bank', v: bn }); }
    if ((m = n.match(/\b([A-Z]{4}[A-Z0-9]?\d{11,18}|[A-Z]\d{8,15})\b/)) && /NEFT|RTGS/i.test(n) && !/^LN/i.test(m[1])) a.push({ k: 'UTR', v: m[1] });
    else if ((m = n.match(/(?:^|[\/\-\s])(\d{12})(?=$|[\/\-\s])/)) && /UPI|IMPS|MMT/i.test(n)) a.push({ k: 'RRN', v: m[1] });
    if ((m = n.match(/\b(?:CHQ|CHEQUE)\s*(?:NO\.?)?\s*[:\-]?\s*(\d{6})\b/i))) a.push({ k: 'Cheque no', v: m[1] });
    return a;
  }

  // ---------- taxonomy ----------
  defaultTaxonomy() {
    const T = (code, l1, group, kw, ess, fix) => ({ code, l1, group, kw: kw ? kw.split(';') : [], ess: ess || '', fix: fix || '', src: 'DEFAULT' });
    return [
      T('SALARY', 'CREDIT', 'income', 'SALARY;PAYROLL;SAL CR'), T('BUSINESS_INCOME', 'CREDIT', 'income', 'STRIPE;RAZORPAY;PAYPAL;PAYOUT;SETTLEMENT;INVOICE'),
      T('INTEREST', 'CREDIT', 'income', 'INTEREST CREDIT;INT CR;INT.PD;INT PD;CREDIT INTEREST;INTEREST CAPITALISED;SB INT;INTEREST PAID'), T('RENTAL_INCOME', 'CREDIT', 'income', 'RENT RECEIVED;RENTAL'),
      T('REFUND', 'CREDIT', 'credit_others', 'REFUND;CASHBACK;REVERSAL OF'), T('REVERSAL', 'CREDIT', 'credit_others', 'RTN;RETURN;REV-'),
      T('LOAN_DISBURSAL', 'CREDIT', 'credit_others', 'LOAN DISB;DISBURSAL;DISBURSEMENT'), T('CASH_DEPOSIT', 'CREDIT', 'credit_others', 'CASH DEP;BY CASH;CDM;CASH DEPOSIT'),
      T('P2P', 'CREDIT', 'credit_others', ''), T('SELF_TRANSFER', 'CREDIT', 'transfer', ''), T('CC_PAYMENT', 'CREDIT', 'transfer', 'PAYMENT RECEIVED'),
      T('REMITTANCE', 'CREDIT', 'credit_others', 'INWARD REMIT;SWIFT;WIRE'), T('OTHER_CREDIT', 'CREDIT', 'credit_others', ''),
      T('EMI', 'DEBIT', 'obligation', 'EMI;LOAN;NACH;LNPY;LOAN REPAY', 'essential', 'fixed'), T('RENT', 'DEBIT', 'essential', 'RENT', 'essential', 'fixed'),
      T('UTILITY', 'DEBIT', 'essential', 'ELECTRICITY;BROADBAND;FIBERNET;FIBRE;PIPED GAS;WATER;JAL BOARD;POWER;MOBILE;POSTPAID;DTH;RCHG;RECHARGE;BESCOM;MSEDCL;TATA POWER;ADANI ELEC;JIO;AIRTEL;BSNL;VODAFONE', 'essential', 'fixed'),
      T('GROCERY', 'DEBIT', 'essential', 'GROCER;MART;SUPERMARKET;BASKET;KIRANA;PROVISION;GENERAL STORE;BLINKIT;ZEPTO;BIGBASKET;DMART;INSTAMART', 'essential', 'variable'),
      T('EDUCATION', 'DEBIT', 'essential', 'TUITION;SCHOOL;ACADEMY;COLLEGE;UNIVERSITY;FEES', 'essential', 'fixed'),
      T('HEALTHCARE', 'DEBIT', 'essential', 'PHARMACY;HOSPITAL;CLINIC;MEDIC;DIAGNOSTIC', 'essential', 'variable'),
      T('INSURANCE', 'DEBIT', 'essential', 'INSURANCE;POLICY;PREMIUM', 'essential', 'fixed'),
      T('HOUSING', 'DEBIT', 'essential', 'MAINTENANCE;RWA;SOCIETY', 'essential', 'fixed'),
      T('HOUSEHOLD_SERVICES', 'DEBIT', 'essential', 'DOMESTIC HELP;MAID;COOK;DRIVER SALARY', 'essential', 'fixed'),
      T('FUEL', 'DEBIT', 'essential', 'FUEL;PETROL;HPCL;IOCL', 'essential', 'variable'),
      T('DINING', 'DEBIT', 'discretionary', 'CAFE;RESTAURANT;DINNER;FOOD;SWIGGY;ZOMATO;DOMINOS;MCDONALD;STARBUCKS', 'discretionary', 'variable'),
      T('SHOPPING', 'DEBIT', 'discretionary', 'SHOPKART;ONLINE;ELECTRONICS;THREADS;FASHION;STORE;AMAZON;FLIPKART;MYNTRA;AJIO;NYKAA;MEESHO', 'discretionary', 'variable'),
      T('TRAVEL', 'DEBIT', 'discretionary', 'AIRLINES;HOTEL;CAB;RIDES;RAIL;TRAVEL;IRCTC;UBER;OLA;MAKEMYTRIP;INDIGO;REDBUS;FASTAG', 'discretionary', 'variable'),
      T('ENTERTAINMENT', 'DEBIT', 'discretionary', 'SUBSCRIPTION;GAMING;MOVIE;STREAM;NETFLIX;SPOTIFY;HOTSTAR;BOOKMYSHOW', 'discretionary', 'fixed'),
      T('INVESTMENT', 'DEBIT', 'savings', 'SIP;MUTUAL FUND; MF-;FOLIO;DEMAT;FD BOOKING;PPF;TDR;TRF TO FD;ZERODHA;GROWW;NSDL;CDSL;BSE LTD;CAMS;KFINTECH', '', 'fixed'),
      T('CASH_WITHDRAWAL', 'DEBIT', 'discretionary', 'ATM WDL;CASH WDL;NWD-;EAW-;ATW-;ATM/CASH', 'discretionary', 'variable'),
      T('BANK_CHARGES', 'DEBIT', 'fees', 'CHGS;CHARGES;CHRG;ANNUAL FEE;MARKUP FEE;GST ON;MIN BAL;AMB CHG;NON MAINT;CONSOLIDATED CHARGES;SMS CHG;DC ANNUAL', '', 'variable'),
      T('PENALTY', 'DEBIT', 'fees', 'LATE PAYMENT;PENAL;OVERLIMIT', '', 'variable'),
      T('CC_PAYMENT', 'DEBIT', 'transfer', 'CC PAYMENT;CARD PAYMENT;AUTOPAY'), T('SELF_TRANSFER', 'DEBIT', 'transfer', ''),
      T('P2P', 'DEBIT', 'discretionary', '', 'discretionary', 'variable'), T('REMITTANCE', 'DEBIT', 'transfer', 'OUTWARD REMIT;SWIFT'),
      T('TAX', 'DEBIT', 'essential', 'TDS;GST PAYMENT;INCOME TAX;CHALLAN;DTAX;CBDT', 'essential', 'variable'), T('OTHER_DEBIT', 'DEBIT', 'discretionary', '', 'discretionary', 'variable')
    ];
  }
  taxonomy() {
    const base = this.defaultTaxonomy();
    (this.state.customRules || []).forEach((r) => {
      const i = base.findIndex((b) => b.code === r.code && b.l1 === r.l1);
      if (i >= 0) base[i] = { ...base[i], ...r, kw: r.kw.length ? r.kw : base[i].kw, src: 'CSV (override)' };
      else base.push({ ...r, src: 'CSV (new)' });
    });
    return base;
  }
  parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) throw new Error('Empty file');
    const head = lines[0].toLowerCase().split(',').map((s) => s.trim());
    const ix = (n) => head.indexOf(n);
    if (ix('category') < 0 || ix('level1') < 0) throw new Error('CSV needs at least "category" and "level1" columns');
    return lines.slice(1).map((l) => {
      const c = l.split(',').map((s) => s.trim());
      return { code: c[ix('category')].toUpperCase().replace(/\s+/g, '_'), l1: (c[ix('level1')] || '').toUpperCase(), group: ix('group') >= 0 ? c[ix('group')] || 'custom' : 'custom', kw: ix('keywords') >= 0 && c[ix('keywords')] ? c[ix('keywords')].split(';').map((k) => k.trim().toUpperCase()).filter(Boolean) : [], ess: ix('expense_type') >= 0 ? c[ix('expense_type')] || '' : '', fix: ix('cost_type') >= 0 ? c[ix('cost_type')] || '' : '' };
    }).filter((r) => r.code && (r.l1 === 'CREDIT' || r.l1 === 'DEBIT'));
  }

  ifscBanks() {
    return { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank', YESB: 'Yes Bank', INDB: 'IndusInd Bank', IDFB: 'IDFC First Bank', PUNB: 'Punjab National Bank', BARB: 'Bank of Baroda',
      CNRB: 'Canara Bank', UBIN: 'Union Bank of India', IDIB: 'Indian Bank', IOBA: 'Indian Overseas Bank', BKID: 'Bank of India', MAHB: 'Bank of Maharashtra', CBIN: 'Central Bank of India', UCBA: 'UCO Bank', PSIB: 'Punjab & Sind Bank',
      FDRL: 'Federal Bank', SIBL: 'South Indian Bank', KARB: 'Karnataka Bank', KVBL: 'Karur Vysya Bank', CIUB: 'City Union Bank', TMBL: 'Tamilnad Mercantile Bank', DCBL: 'DCB Bank', RATN: 'RBL Bank', BDBL: 'Bandhan Bank', JAKA: 'J&K Bank',
      CSBK: 'CSB Bank', DLXB: 'Dhanlaxmi Bank', NTBL: 'Nainital Bank', IBKL: 'IDBI Bank', AUBL: 'AU Small Finance Bank', ESFB: 'Equitas Small Finance Bank', UJVN: 'Ujjivan Small Finance Bank', JSFB: 'Jana Small Finance Bank',
      SURY: 'Suryoday Small Finance Bank', UTKS: 'Utkarsh Small Finance Bank', FSFB: 'Fincare Small Finance Bank', ESMF: 'ESAF Small Finance Bank', NESF: 'North East Small Finance Bank', AIRP: 'Airtel Payments Bank', PYTM: 'Paytm Payments Bank',
      FINO: 'Fino Payments Bank', IPOS: 'India Post Payments Bank', JIOP: 'Jio Payments Bank', NSPB: 'NSDL Payments Bank', SCBL: 'Standard Chartered', HSBC: 'HSBC', CITI: 'Citibank', DBSS: 'DBS Bank', DEUT: 'Deutsche Bank', BOFA: 'Bank of America',
      SRCB: 'Saraswat Co-op Bank', COSB: 'Cosmos Co-op Bank', SVCB: 'SVC Co-op Bank', ABHY: 'Abhyudaya Co-op Bank', TJSB: 'TJSB Sahakari Bank', NKGS: 'NKGSB Co-op Bank', HSBL: 'HDFC (erstwhile)', RSBL: 'Rajasthan Marudhara Gramin', PMEC: 'Prathama UP Gramin', APGB: 'Andhra Pragathi Grameena', KSCB: 'Kerala State Co-op Bank' };
  }
  merchantAliases() {
    // canonical brand ← patterns banks commonly print (often truncated)
    return [['AMAZON', /\bAMAZON\b|\bAMZN\b|AMAZON ?PAY|AMAZON SELLER|AMAZONIN/], ['FLIPKART', /FLIPKART/], ['SWIGGY', /SWIGGY|BUNDL TECHNOLOGIES/], ['ZOMATO', /ZOMATO|ETERNAL LIMITED/], ['BLINKIT', /BLINKIT|GROFERS/], ['ZEPTO', /ZEPTO|KIRANAKART/],
      ['BIGBASKET', /BIG ?BASKET|INNOVATIVE RETAIL CONCEPTS|SUPERMARKET GROCERY SUPPLIES/], ['UBER', /\bUBER\b/], ['OLA', /\bOLA\b|ANI TECHNOLOGIES/], ['RAPIDO', /RAPIDO|ROPPEN TRANSPORTATION/], ['IRCTC', /IRCTC|INDIAN RAILWAY/],
      ['MAKEMYTRIP', /MAKEMYTRIP|MAKE MY TRIP/], ['PAYTM', /PAYTM|ONE ?97 COMMUNICATIONS/], ['PHONEPE', /PHONEPE/], ['GOOGLE PAY', /GOOGLE ?PAY|GPAY/], ['AIRTEL', /\bAIRTEL\b|BHARTI AIRTEL|BHARTI HEXACOM/],
      ['JIO', /RELIANCE JIO|\bJIO\b|JIO ?MART/], ['VI (VODAFONE IDEA)', /VODAFONE|VODAFONE IDEA|\bVI MOBILE/], ['BSNL', /\bBSNL\b/], ['NETFLIX', /NETFLIX/], ['SPOTIFY', /SPOTIFY/], ['HOTSTAR', /HOTSTAR|NOVI DIGITAL|JIOHOTSTAR/],
      ['MYNTRA', /MYNTRA/], ['NYKAA', /NYKAA|FSN E-?COMMERCE/], ['AJIO', /\bAJIO\b/], ['MEESHO', /MEESHO|FASHNEAR/], ['DMART', /\bDMART\b|AVENUE SUPERMARTS/], ['RELIANCE RETAIL', /RELIANCE RETAIL|RELIANCE SMART|RELIANCE FRESH/],
      ['BAJAJ FINANCE', /BAJAJ FIN/], ['HDFC BANK (LOAN/CARD)', /HDFC BANK (?:LOAN|CARD|CC)/], ['ZERODHA', /ZERODHA/], ['GROWW', /GROWW|NEXTBILLION TECHNOLOGY/], ['LIC', /\bLIC\b|LIFE INSURANCE CORP/],
      ['BESCOM', /BESCOM/], ['TATA POWER', /TATA POWER/], ['ADANI ELECTRICITY', /ADANI ELEC/], ['INDIGO', /INDIGO|INTERGLOBE AVIATION/], ['STARBUCKS', /STARBUCKS|TATA STARBUCKS/], ['DOMINOS', /DOMINO|JUBILANT FOODWORKS/]];
  }
  cpKey(cp) {
    // grouping key: strip legal suffixes, truncated suffixes and punctuation so "ACME TECH PVT LTD" == "ACME TECH PRIVATE LIMI"
    let k = String(cp || '').toUpperCase().replace(/[.,'&()]/g, ' ').replace(/\s+/g, ' ').trim();
    k = k.replace(/\s+(PRIVATE|PRIVAT|PRIVA|PRIV|PVT|PRI)(\s+(LIMITED|LIMITE|LIMIT|LIMI|LIM|LTD|LT|L))?$/, '').replace(/\s+(LIMITED|LIMITE|LIMIT|LIMI|LTD|LLP|INC|CORP|CO)$/, '').replace(/\s+(INDIA|IND|IN)$/, '').replace(/\s+(PVT|PRIVATE)$/, '');
    return k.trim();
  }
  canonCp(cp) {
    const u = String(cp || '').toUpperCase();
    for (const [name, re] of this.merchantAliases()) if (re.test(u)) return name;
    return null;
  }
  suggestMatch(t) {
    const u = t.narr.toUpperCase();
    const vpa = (u.match(/([A-Z0-9._]{2,}@[A-Z]{2,})/) || [])[1];
    if (vpa) return vpa;
    const runs = (u.replace(/\d+/g, ' ').match(/[A-Z][A-Z .&]{3,}[A-Z]/g) || []).map((x) => x.trim()).filter((x) => !/^(UPI|NEFT|IMPS|RTGS|TRF|MISC|PAYMENT|TRANSFER|TO TRANSFER|BY TRANSFER|INB|MMT|ACH|NACH)$/.test(x));
    if (runs.length) return runs.sort((a, b) => b.length - a.length)[0];
    return u.replace(/\d{4,}/g, '').replace(/[\/\-]+/g, ' ').trim().slice(0, 30);
  }
  saveCpRules(rules) { try { window.localStorage.setItem('ledgerlens.cprules.v1', JSON.stringify(rules)); } catch (e) {} }
  addCpRule(rule) {
    const r = { match: String(rule.match || '').trim().toUpperCase(), cp: String(rule.cp || '').trim().toUpperCase(), cat: rule.cat || '' };
    if (r.match.length < 3 || !r.cp) return 'Enter at least 3 characters to match and a counterparty name.';
    const rules = (this.state.cpRules || []).filter((x) => x.match !== r.match).concat([r]);
    this.saveCpRules(rules);
    const hits = this.state.raw.filter((x) => x.narr.toUpperCase().indexOf(r.match) >= 0).length;
    this.log('USER', 'Counterparty rules', 'Rule saved: narration contains "' + r.match + '" → ' + r.cp + (r.cat ? ' / ' + r.cat : '') + ' — applies to ' + hits + ' row(s) in this run');
    this.setState({ cpRules: rules, cpRuleMsg: 'Rule saved — applied to ' + hits + ' row(s). It will also apply to future statements in this browser.' });
    return null;
  }

  // ---------- classification ----------
  isPerson(cp) { return /^[A-Z][A-Z]+(\s[A-Z][A-Z]+){1,2}$/i.test(cp) && !/(LTD|PVT|INC|LLP|TRADERS|MART|BANK|STORE|CAFE|SERVICES|ACADEMY|TRUST|FINTECH|POWER|FIBER|INSURANCE|PHARMACY|RIDES|HOTELS|AIRLINES|FUELS|ONLINE|ELECTRONICS|BOARD|GAS|RWA|SCHOOL)/i.test(cp); }
  classify(t, tax, ctx) {
    const u = t.narr.toUpperCase(); const L1 = t.l1;
    const pool = tax.filter((x) => x.l1 === L1);
    const custom = pool.filter((x) => x.src !== 'DEFAULT');
    const hit = (list) => { for (const r of list) for (const k of r.kw) { if (k && u.indexOf(k.toUpperCase()) >= 0) return { r, k }; } return null; };
    const out = (code, conf, method, why) => ({ l2: code, conf, method, why });
    let h = hit(custom); if (h) return out(h.r.code, 0.95, 'RULE', 'Custom CSV keyword "' + h.k + '"');
    // structural rules
    const own = ctx.ownNames.some((nm) => t.cp.toUpperCase().indexOf(nm) >= 0) || t.attrs.some((a) => a.k === 'Cpty a/c' && ctx.ownLast4.indexOf(a.v.replace(/\D/g, '').slice(-4)) >= 0);
    if (L1 === 'DEBIT' && /RTN CHG|BOUNCE|RETURN CHG|RTN CHRG|RETURN CHARGE|CHQ RTN|I\/W RTN|O\/W RTN|ECS RTN|NACH RTN|DISHONOU?R/.test(u)) return out('BANK_CHARGES', 0.97, 'RULE', 'Bounce / return charge');
    if (L1 === 'CREDIT' && /^N?ACH RTN|^N?ACH RETURN|^ECS RTN|^REV-|\bREVERSAL\b(?!.*REFUND)|RETURN.*INSUFFICIENT|INSUFFICIENT FUNDS|\bRTN\b.*(?:EMI|ACH|NACH|ECS)/.test(u)) return out('REVERSAL', 0.97, 'RULE', 'Failed debit returned (bounce)');
    if (/^CC PAYMENT|PAYMENT RECEIVED/.test(u)) return out('CC_PAYMENT', 0.96, 'RULE', 'Card bill payment between own accounts');
    if (own && t.channel !== 'CASH') return out('SELF_TRANSFER', 0.94, 'RULE', 'Counterparty matches account holder / own account');
    if (L1 === 'CREDIT' && /REFUND|CASHBACK/.test(u)) return out('REFUND', 0.96, 'RULE', 'Merchant refund — not income');
    if (L1 === 'CREDIT' && /LOAN DISB|DISBURS/.test(u)) return out('LOAN_DISBURSAL', 0.95, 'RULE', 'Loan disbursal — not income');
    if (L1 === 'CREDIT' && /SALARY|PAYROLL|\bSAL\b|\bSAL[\s\-]?(?:CR|FOR)\b/.test(u) && !this.isPerson(t.cp)) return out('SALARY', 0.95, 'RULE', 'Salary keyword from an employer');
    if (L1 === 'DEBIT' && t.attrs.some((a) => a.k === 'Loan a/c') && /EMI|ACH|NACH/.test(u)) return out('EMI', 0.96, 'RULE', 'Recurring debit with loan account number');
    // a standing-instruction (NACH / ACH / ECS) debit to a lender is almost always a loan EMI, even without the word "EMI"
    if (L1 === 'DEBIT' && t.channel === 'NACH/ACH' && /\b(CAPITAL|FINANCE|FINSERV|FINCORP|HOME ?FIN|HOUSING FIN|LOANS?|NBFC|CREDIT|LENDING|MONEY)\b/.test(u) && !/INSURANCE|MUTUAL|MF\b|SIP|BROKING|PRU|LIFE/.test(u)) return out('EMI', 0.82, 'RULE', 'Mandate debit to a lender (NACH/ACH)');
    // narration-first keyword rules (beat P2P so "Tuition fee" to a person → EDUCATION)
    h = hit(pool.filter((x) => x.src === 'DEFAULT' && x.code !== 'SALARY'));
    if (h) return out(h.r.code, this.isPerson(t.cp) ? 0.82 : 0.9, 'RULE', 'Narration keyword "' + h.k.trim() + '"');
    if ((t.channel === 'UPI' || t.channel === 'IMPS' || t.channel === 'NEFT') && this.isPerson(t.cp)) return out('P2P', 0.84, 'RULE', 'Transfer with an individual');
    // recurring-employer heuristic for unlabeled salary
    if (L1 === 'CREDIT' && ctx.recurring[t.cpKey] >= 2 && /LTD|PVT|INC|LLP|LIMI|PRIVA/.test(t.cp.toUpperCase())) return out('SALARY', 0.78, 'RULE', 'Monthly recurring credit from a company');
    // lexical fallback — these rows (and OTHER) are what the LLM step re-labels when a model is configured
    const lex = [['SHOPPING', /AMZN|FLIPKART|MYNTRA|BAZAAR|RETAIL/], ['DINING', /KITCHEN|BISTRO|DHABA|PIZZA|BURGER/], ['TRAVEL', /UBER|OLA|IRCTC|TRIP|FLIGHT/], ['UTILITY', /RECHARGE|BILL/]];
    for (const [c, re] of lex) if (L1 === 'DEBIT' && re.test(u)) return { ...out(c, 0.66, 'RULE', 'Lexical fallback on narration'), lexical: true };
    return { ...out(L1 === 'CREDIT' ? 'OTHER_CREDIT' : 'OTHER_DEBIT', 0.35, 'RULE', 'No rule matched'), lexical: true };
  }

  // ---------- full pipeline (derived) ----------
  buildTxns(st) {
    const s = st || this.state; if (!s.raw.length) return [];
    const c = this._txCache;
    if (c && c.raw === s.raw && c.ov === s.overrides && c.cov === s.cpOverrides && c.thr === s.threshold && c.cr === s.customRules && c.acc === s.accounts && c.cpr === s.cpRules && c.rm === s.reviewMode && c.llm === s.llmLabels) return c.val;
    const val = this.buildTxnsRaw(s);
    this._txCache = { raw: s.raw, ov: s.overrides, cov: s.cpOverrides, thr: s.threshold, cr: s.customRules, acc: s.accounts, cpr: s.cpRules, rm: s.reviewMode, llm: s.llmLabels, val };
    return val;
  }
  buildTxnsRaw(s) {
    const tax = this.taxonomy(); const accById = {}; s.accounts.forEach((a) => { accById[a.key] = a; });
    const holders = new Set();
    s.accounts.forEach((a) => (a.holder || '').toUpperCase().replace(/\(.*?\)/g, '').split(/&|,| AND /).map((x) => x.trim()).filter((x) => x.length > 3).forEach((x) => holders.add(x)));
    const ctx = { ownNames: Array.from(holders), ownLast4: s.accounts.map((a) => a.last4), recurring: {} };
    const base = s.raw.map((r, i) => {
      const a = accById[r.account] || {};
      const l1 = r.cr ? 'CREDIT' : 'DEBIT'; const ch = this.channelOf(r.narr);
      let cpx = this.counterpartyOf(r.narr, ch, a.bank);
      const attrs = this.attrsOf(r.narr);
      const U = r.narr.toUpperCase();
      const rule = (s.cpRules || []).find((x) => x.match && U.indexOf(x.match) >= 0);
      if (rule) cpx = { cp: rule.cp, c: 0.97, fmt: 'Your rule: contains "' + rule.match + '"', rule };
      else { const canon = this.canonCp(cpx.cp + ' ' + (cpx.c < 0.7 ? U : '')); if (canon && canon !== cpx.cp) { attrs.push({ k: 'Printed as', v: cpx.cp }); cpx = { cp: canon, c: Math.max(cpx.c, 0.9), fmt: (cpx.fmt || '') + ' · merchant alias' }; } }
      const orig = attrs.find((x) => x.k === 'Orig');
      return { id: 't' + i, ...r, l1, amount: r.cr || r.dr || 0, channel: ch, cp: cpx.cp, cpRaw: cpx.cp, cpKey: this.cpKey(cpx.cp), cpConf: cpx.c, cpFmt: cpx.fmt || '', cpRule: cpx.rule || null, attrs, currency: orig ? orig.v.slice(0, 3) : (a.currency || 'INR'), month: r.date.slice(0, 7), acct: a, accLabel: (a.card ? 'Card ' : 'A/c ') + '…' + (a.last4 || '') };
    });
    const months = {}; base.filter((t) => t.l1 === 'CREDIT').forEach((t) => { months[t.cpKey] = months[t.cpKey] || new Set(); months[t.cpKey].add(t.month); });
    Object.keys(months).forEach((k) => { ctx.recurring[k] = months[k].size; });
    const out0 = base.map((t) => {
      const lab = (s.llmLabels || {})[t.id];
      if (lab && lab.cp && !t.cpRule && lab.cpConf > t.cpConf) { t.cp = lab.cp; t.cpKey = this.cpKey(t.cp); t.cpConf = lab.cpConf; t.cpFmt = 'LLM (' + lab.model + ')'; }
      if (s.cpOverrides[t.id]) { t.cp = s.cpOverrides[t.id]; t.cpKey = this.cpKey(t.cp); t.cpConf = 1; }
      let c = this.classify(t, tax, ctx);
      if (lab && (c.lexical || lab.conf > c.conf)) c = { l2: lab.l2, conf: lab.conf, method: 'LLM', why: lab.why || 'Model label' };
      if (t.cpRule && t.cpRule.cat && tax.some((x) => x.code === t.cpRule.cat && x.l1 === t.l1)) c = { l2: t.cpRule.cat, conf: 0.97, method: 'RULE', why: 'Your counterparty rule' };
      if (s.overrides[t.id]) c = { l2: s.overrides[t.id], conf: 1, method: 'MANUAL', why: 'Set by reviewer' };
      const cat = tax.find((x) => x.code === c.l2 && x.l1 === t.l1) || {};
      const reasons = [];
      if (t.cpConf < s.threshold) reasons.push('Counterparty unclear (' + Math.round(t.cpConf * 100) + '%)');
      if (c.conf < s.threshold) reasons.push('Low classification confidence (' + Math.round(c.conf * 100) + '%)');
      return { ...t, l2: c.l2, conf: c.conf, method: c.method, why: c.why, group: cat.group || '', ess: cat.ess || '', fix: cat.fix || '', lexical: !!c.lexical, flagged: reasons.length > 0, reasons };
    });
    return this.triage(out0, s);
  }
  triage(T, s) {
    // Smart review: only queue items that can move the credit decision; small one-offs are auto-accepted.
    const months = new Set(T.map((t) => t.month)).size || 1;
    const inc = T.filter((t) => t.group === 'income').reduce((a, t) => a + t.amount, 0) / months;
    const big = Math.max(10000, inc * 0.05);
    const byKey = {};
    T.forEach((t) => { const k = t.l1 + '|' + (t.cpKey || t.cp); (byKey[k] = byKey[k] || []).push(t); });
    return T.map((t) => {
      if (!t.flagged) return t;
      const imp = [];
      if (t.amount >= big) imp.push('large amount (≥ ₹' + this.fmt0(big) + ')');
      if (t.l1 === 'CREDIT' && t.amount >= 5000) imp.push('could be income');
      const peers = (byKey[t.l1 + '|' + (t.cpKey || t.cp)] || []).filter((x) => x.cpKey && x.cpKey !== 'UNIDENTIFIED');
      const ms = new Set(peers.map((x) => x.month));
      if (ms.size >= 2 && peers.some((x) => x !== t && Math.abs(x.amount - t.amount) <= t.amount * 0.15) && t.amount >= 1000) imp.push('recurring every month — could be EMI, rent or salary');
      if (/LOAN|EMI|FINANCE|FINSERV|CREDIT|NBFC|CAPITAL/i.test(t.narr) && t.l1 === 'DEBIT') imp.push('looks loan-related');
      if (/\bRTN\b|BOUNCE|PENAL|DISHON|RETURN CH|CHQ RETURN|ACH RETURN|INSUFFICIENT/i.test(t.narr)) imp.push('possible bounce or penalty');
      const high = imp.length > 0;
      if (s.reviewMode !== 'all' && !high) return { ...t, flagged: false, autoAccepted: true, impact: 'LOW', impactS: 'Low impact: ' + this.fmt0(t.amount) + ' one-off', autoReasons: t.reasons };
      return { ...t, impact: high ? 'HIGH' : 'LOW', impactS: high ? imp.join(' · ') : 'Low impact', impactList: imp };
    });
  }

  // ---------- risk scoring ----------
  score(T, st) {
    const s0 = st || this.state;
    if (this._scCache && this._scCache.T === T && this._scCache.acc === s0.accounts) return this._scCache.val;
    const val = this.scoreRaw(T, st);
    this._scCache = { T, acc: s0.accounts, val };
    return val;
  }
  scoreRaw(T, st) {
    const s = st || this.state; if (!T.length) return null;
    const months = Array.from(new Set(T.map((t) => t.month))).sort();
    const sum = (arr) => arr.reduce((a, b) => a + b, 0);
    const byM = (f) => months.map((m) => sum(T.filter((t) => t.month === m && f(t)).map((t) => t.amount)));
    const incomeCats = Array.from(new Set(T.filter((t) => t.group === 'income').map((t) => t.l2)));
    const incomeByCat = incomeCats.map((c) => ({ cat: c, vals: byM((t) => t.l2 === c && t.group === 'income') }));
    const income = byM((t) => t.group === 'income');
    const avgInc = sum(income) / months.length;
    const primary = incomeByCat.slice().sort((a, b) => sum(b.vals) - sum(a.vals))[0];
    const pv = primary ? primary.vals : [0];
    const mean = sum(pv) / pv.length; const sd = Math.sqrt(sum(pv.map((v) => (v - mean) ** 2)) / pv.length);
    const cv = mean ? sd / mean : 1;
    const growth = income[0] ? (income[income.length - 1] - income[0]) / income[0] : 0;
    const shareTop = primary && sum(income) ? sum(primary.vals) / sum(income) : 1;
    // history: regularity needs >= 2 months of income, growth >= 3; with less they score neutral (50), never perfect
    const spanDays = (() => { const d = T.map((t) => this.dayNum(t.date)); return Math.max(...d) - Math.min(...d) + 1; })();
    const MIN_MONTHS = 3, MIN_DAYS = 75;
    const historyOk = months.length >= MIN_MONTHS && spanDays >= MIN_DAYS;
    const sReg = months.length < 2 ? 50 : this.clamp(100 - cv * 250, 0, 100) * (months.every((m, i) => pv[i] > 0) ? 1 : 0.6);
    const sDiv = incomeCats.length >= 3 ? 100 : incomeCats.length === 2 ? 85 : incomeCats.length === 1 ? 60 : 0;
    const sGrow = months.length < MIN_MONTHS ? 50 : growth >= 0.05 ? 100 : growth >= 0 ? 80 : growth >= -0.1 ? 60 : 30;
    const sLvl = this.clamp(avgInc / 100000 * 100, 0, 100);
    const incomeScore = 0.4 * sReg + 0.2 * sDiv + 0.2 * sGrow + 0.2 * sLvl;

    // debt service
    const emiTx = T.filter((t) => t.l2 === 'EMI' && t.l1 === 'DEBIT');
    const loanKey = (t) => { const a = t.attrs.find((x) => x.k === 'Loan a/c'); return a ? a.v : (t.cpKey || t.cp); };
    const loans = {};
    emiTx.forEach((t) => { const k = loanKey(t); loans[k] = loans[k] || { loan: k, lender: t.cp, amount: t.amount, presented: 0, bounced: 0, months: new Set() }; loans[k].presented++; loans[k].amount = t.amount; loans[k].months.add(t.month); });
    const rev = T.filter((t) => t.l2 === 'REVERSAL');
    rev.forEach((r) => { const a = r.attrs.find((x) => x.k === 'Loan a/c'); const k = a ? a.v : (r.cpKey || r.cp); if (loans[k]) loans[k].bounced++; });
    const loanList = Object.values(loans).map((l) => ({ ...l, months: l.months.size, monthly: l.amount, ontime: l.presented ? (l.presented - 2 * l.bounced) / (l.presented - l.bounced) : 1 }));
    const monthlyEmi = sum(loanList.map((l) => l.monthly));
    const foir = avgInc ? monthlyEmi / avgInc : 1;
    const presented = sum(loanList.map((l) => l.presented)); const bounced = sum(loanList.map((l) => l.bounced));
    const bounceRate = presented ? bounced / presented : 0;
    const ontimeRate = presented ? 1 - bounced / Math.max(1, presented - bounced) : 1;
    const sFoir = foir <= 0.3 ? 100 : foir <= 0.4 ? 85 : foir <= 0.5 ? 70 : foir <= 0.6 ? 45 : 20;
    const debtScore = 0.5 * sFoir + 0.25 * this.clamp(100 - bounceRate * 300, 0, 100) + 0.25 * this.clamp(ontimeRate * 100, 0, 100);

    // liquidity — combined EOD across deposit accounts
    const dep = s.accounts.filter((a) => !a.card);
    const allDays = T.map((t) => this.dayNum(t.date)); const d0 = Math.min(...allDays), d1 = Math.max(...allDays);
    const eod = [];
    let negDays = 0;
    const lastBal = {}; dep.forEach((a) => { lastBal[a.key] = a.opening || 0; });
    const byDay = {}; T.filter((t) => !t.acct.card && t.bal !== null).forEach((t) => { const d = this.dayNum(t.date); (byDay[d] = byDay[d] || []).push(t); });
    for (let d = d0; d <= d1; d++) {
      (byDay[d] || []).forEach((t) => { lastBal[t.account] = t.bal; });
      const tot = sum(Object.values(lastBal)); eod.push(tot);
      if (Object.values(lastBal).some((v) => v < 0)) negDays++;
    }
    const avgEod = sum(eod) / eod.length; const minEod = Math.min(...eod);
    const r1 = avgInc ? avgEod / avgInc : 0;
    const sAvg = r1 >= 1 ? 100 : r1 >= 0.5 ? 80 : r1 >= 0.25 ? 60 : r1 >= 0.1 ? 40 : 20;
    const r2 = monthlyEmi ? minEod / monthlyEmi : 2;
    const sMin = r2 >= 1 ? 100 : r2 >= 0.5 ? 75 : r2 >= 0.2 ? 50 : 25;
    const liqScore = 0.5 * sAvg + 0.3 * sMin + 0.2 * this.clamp(100 - negDays * 10, 0, 100);

    // banking behaviour
    const bounceCharges = T.filter((t) => t.l2 === 'BANK_CHARGES' && /RTN|BOUNCE|RETURN/.test(t.narr.toUpperCase()));
    const penalties = T.filter((t) => t.l2 === 'PENALTY');
    const charges = T.filter((t) => t.l2 === 'BANK_CHARGES' || t.l2 === 'PENALTY');
    const chargeAmt = sum(charges.map((t) => t.amount));
    const bankScore = this.clamp(100 - bounced * 25 - penalties.length * 10 - negDays * 5 - Math.min(20, chargeAmt / 250), 0, 100);

    // fraud
    const integrity = [];
    s.accounts.forEach((a) => {
      let pb = a.opening; T.filter((t) => t.account === a.key).forEach((t) => {
        if (pb !== null && pb !== undefined && t.bal !== null) {
          const exp = a.card ? pb + (t.dr || 0) - (t.cr || 0) : pb - (t.dr || 0) + (t.cr || 0);
          if (Math.abs(exp - t.bal) > 0.5) integrity.push({ t, exp });
        }
        if (t.bal !== null) pb = t.bal;
      });
    });
    const circular = []; const used = new Set();
    T.filter((t) => t.l1 === 'CREDIT' && t.amount >= 10000 && !['SELF_TRANSFER', 'CC_PAYMENT', 'SALARY', 'REVERSAL', 'REFUND'].includes(t.l2)).forEach((c) => {
      const d = T.find((x) => x.l1 === 'DEBIT' && (x.cpKey || x.cp) === (c.cpKey || c.cp) && Math.abs(x.amount - c.amount) <= c.amount * 0.02 && Math.abs(this.dayNum(x.date) - this.dayNum(c.date)) <= 3 && !used.has(x.id));
      if (d) { used.add(d.id); used.add(c.id); circular.push({ a: c, b: d }); }
    });
    const overnight = [];
    T.filter((t) => t.l1 === 'CREDIT' && t.amount >= 50000 && !used.has(t.id) && t.l2 !== 'SALARY' && t.l2 !== 'SELF_TRANSFER').forEach((c) => {
      const d = T.find((x) => x.l1 === 'DEBIT' && x.account === c.account && x.amount >= c.amount * 0.9 && this.dayNum(x.date) - this.dayNum(c.date) >= 0 && this.dayNum(x.date) - this.dayNum(c.date) <= 1 && !used.has(x.id));
      if (d) overnight.push({ a: c, b: d });
    });
    const cash = T.filter((t) => t.l2 === 'CASH_DEPOSIT' && t.amount >= 40000 && t.amount < 50000);
    const structuring = [];
    cash.forEach((c, i) => { const win = cash.filter((x) => this.dayNum(x.date) >= this.dayNum(c.date) && this.dayNum(x.date) - this.dayNum(c.date) <= 30); if (win.length >= 3 && !structuring.length) structuring.push({ count: win.length, total: sum(win.map((x) => x.amount)), from: c.date, to: win[win.length - 1].date }); });
    // a balance check that could not run is not a pass: if the balance column was not read on most rows, extraction is unverified
    const balRows = T.filter((t) => t.bal !== null && t.bal !== undefined).length;
    const balCoverage = T.length ? balRows / T.length : 0;
    const fraudScore = this.clamp(100 - (integrity.length || balCoverage < 0.8 ? 40 : 0) - circular.length * 20 - overnight.length * 15 - structuring.length * 35, 0, 100);

    // expenses
    const isExp = (t) => t.l1 === 'DEBIT' && !used.has(t.id) && !['transfer', 'savings', 'obligation'].includes(t.group);
    const exp = byM(isExp);
    const essM = byM((t) => isExp(t) && t.ess === 'essential');
    const discM = byM((t) => isExp(t) && t.ess !== 'essential');
    const fixM = byM((t) => isExp(t) && t.fix === 'fixed');
    const totExp = sum(exp);
    const discShare = totExp ? sum(discM) / totExp : 0; const fixedShare = totExp ? sum(fixM) / totExp : 0;
    const expTrend = exp[0] ? (exp[exp.length - 1] - exp[0]) / exp[0] : 0;
    const savingsRate = avgInc ? (avgInc - totExp / months.length - monthlyEmi) / avgInc : 0;
    const sDisc = discShare <= 0.3 ? 100 : discShare <= 0.4 ? 85 : discShare <= 0.5 ? 70 : 50;
    const sTrend = expTrend <= 0.05 ? 100 : expTrend <= 0.15 ? 75 : 50;
    const sSav = savingsRate >= 0.25 ? 100 : savingsRate >= 0.15 ? 80 : savingsRate >= 0.05 ? 60 : 30;
    const expScore = 0.4 * sDisc + 0.3 * sTrend + 0.3 * sSav;

    const comps = [
      { key: 'income', name: 'Income Stability', w: 0.25, s: incomeScore },
      { key: 'debt', name: 'Debt Service', w: 0.20, s: debtScore },
      { key: 'liq', name: 'Liquidity', w: 0.15, s: liqScore },
      { key: 'bank', name: 'Banking Behaviour', w: 0.10, s: bankScore },
      { key: 'fraud', name: 'Fraud Indicators', w: 0.15, s: fraudScore },
      { key: 'exp', name: 'Expense Management', w: 0.15, s: expScore }
    ];
    const total = Math.round(sum(comps.map((c) => c.s * c.w)) * 10);
    const band = total >= 800 ? 'Excellent' : total >= 700 ? 'Good' : total >= 600 ? 'Fair' : total >= 500 ? 'Below Average' : 'Poor';
    const bandDecision = { Excellent: 'APPROVE', Good: 'APPROVE', Fair: 'APPROVE WITH CONDITIONS', 'Below Average': 'REFER', Poor: 'DECLINE' }[band];
    let decision = bandDecision;
    const why = [];
    if (foir > 0.65) { decision = 'DECLINE'; why.push('FOIR above 65% hard limit'); }
    if (integrity.length) { decision = 'REFER'; why.push('Statement balance arithmetic broken on ' + integrity.length + ' row(s) — possible tampering'); }
    if (balCoverage < 0.8) { decision = 'REFER'; why.push('Running balance read on only ' + balRows + ' of ' + T.length + ' rows — extraction cannot be verified against the balance column'); }
    // income must be explainable: large unclassified inflows mean the income figure (and FOIR) cannot be trusted
    const inflow = sum(T.filter((t) => t.l1 === 'CREDIT' && !['SELF_TRANSFER', 'CC_PAYMENT', 'REVERSAL'].includes(t.l2)).map((t) => t.amount));
    const unexplained = sum(T.filter((t) => t.l2 === 'OTHER_CREDIT').map((t) => t.amount));
    const unexplainedShare = inflow ? unexplained / inflow : 0;
    if (unexplainedShare > 0.3) { if (decision.indexOf('APPROVE') === 0) decision = 'REFER'; why.push(Math.round(unexplainedShare * 100) + '% of inflows are unclassified (OTHER_CREDIT) — income cannot be verified'); }
    if (structuring.length) { if (decision !== 'DECLINE') decision = 'REFER'; why.push('Cash deposits structured just below ₹50,000 reporting threshold'); }
    if (circular.length) { if (decision.indexOf('APPROVE') === 0) decision = 'REFER'; why.push('Circular fund movement with the same counterparty within 3 days'); }
    if (bounced) { if (decision === 'APPROVE') decision = 'APPROVE WITH CONDITIONS'; why.push('EMI bounce in the period — condition: NACH mandate on the salary account'); }
    if (!historyOk) { if (decision !== 'DECLINE') decision = 'REFER'; why.push('Only ' + months.length + ' month(s) / ' + spanDays + ' days of history — at least ' + MIN_MONTHS + ' months are required to decide; request more statements'); }
    if (penalties.length) why.push(penalties.length + ' penalty fee(s) on the credit card');
    if (!why.length) why.push('Band "' + band + '" maps to ' + decision + ' under the default policy');
    return {
      bandDecision, overridden: decision !== bandDecision, months, spanDays, historyOk, minMonths: MIN_MONTHS, balRows, balCoverage, unexplainedShare, comps, total, band, decision, why, incomeByCat, income, avgInc, cv, growth, shareTop, incomeCats, loanList, monthlyEmi, foir, bounceRate, ontimeRate, bounced, presented,
      avgEod, minEod, negDays, eodDays: eod.length, bounceCharges, penalties, chargeAmt, integrity, circular, overnight, structuring, exp, essM, discM, fixM, discShare, fixedShare, expTrend, savingsRate, totExp
    };
  }

  // "901/1000 · Excellent · REFER" reads as a contradiction; say when policy overrode the band
  verdict(R) { return R.total + '/1000 · ' + R.band + (R.overridden ? ' score, overridden → ' : ' → ') + R.decision; }

  // ---------- actions ----------
  componentDidMount() { this._warm = setTimeout(() => { if (this.state.ocrState && this.state.ocrState.st === 'idle') { this.log('INFO', 'OCR', 'Warming up OCR engine in the background'); this.ocrEngine().catch(() => {}); } }, 2500); }
  componentWillUnmount() { clearTimeout(this._warm); }
  now() { const d = new Date(); return d.toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0'); }
  today() { return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  saveLog() { try { window.localStorage.setItem('ledgerlens.log.v1', JSON.stringify(this._log)); } catch (e) {} }
  newRun() { this._runSeq += 1; this._runId = this._runSeq; return this._runId; }
  log(level, step, msg, push, meta) { const e = { ts: this.now(), day: this.today(), level, step, msg, run: this._runId || 0 }; if (meta) e.meta = meta; this._log.push(e); if (this._log.length > 2000) this._log = this._log.slice(-2000); this.saveLog(); if (push !== false) this.setState({ log: this._log.slice() }); }
  acctMissing(a) {
    const m = [];
    if (/^UNKNOWN-/.test(a.key)) m.push('account number');
    if (!a.bank || a.bank === 'Unknown bank') m.push('bank');
    if (!a.holder || a.holder === '—') m.push('account holder');
    if (a.opening === undefined || a.opening === null) m.push('opening balance');
    return m;
  }
  acctAnyMissing() { return this.state.accounts.some((a) => this.acctMissing(a).length); }
  applyAcctDetails() {
    const s = this.state; const d = s.acctDraft || {};
    const keyMap = {}; const changes = [];
    const accounts = s.accounts.map((a) => {
      const f = d[a.key]; if (!f) return a;
      const n = { ...a }; const man = new Set(a.manual || []);
      const num = (f.number || '').trim();
      if (num && num !== a.key) { if (s.accounts.some((x) => x.key === num && x !== a)) { changes.push('skipped duplicate number ' + num); } else { keyMap[a.key] = num; n.key = num; n.last4 = num.replace(/\D/g, '').slice(-4) || n.last4; man.add('account number'); } }
      if ((f.holder || '').trim() && f.holder.trim() !== a.holder) { n.holder = f.holder.trim(); man.add('account holder'); }
      if ((f.bank || '').trim() && f.bank.trim() !== a.bank) { n.bank = f.bank.trim(); man.add('bank'); }
      if (f.type && f.type !== a.type) { n.type = f.type; n.card = /card/i.test(f.type); man.add('account type'); }
      if ((f.currency || '').trim() && f.currency.trim().toUpperCase() !== a.currency) { n.currency = f.currency.trim().toUpperCase().slice(0, 3); man.add('currency'); }
      if (String(f.opening || '').trim() !== '') { const v = this.money(f.opening); if (v !== null) { n.opening = v; man.add('opening balance'); } else changes.push('opening balance "' + f.opening + '" is not a number'); }
      n.manual = Array.from(man);
      if (n.manual.length > (a.manual || []).length) changes.push((num || a.key) + ': ' + n.manual.join(', '));
      return n;
    });
    const raw = Object.keys(keyMap).length ? s.raw.map((r) => (keyMap[r.account] ? { ...r, account: keyMap[r.account] } : r)) : s.raw.slice();
    const st2 = { ...s, accounts, raw };
    const T = this.buildTxns(st2); const R = this.score(T, st2);
    this.log('USER', 'Account details', 'Entered manually — ' + (changes.join(' · ') || 'no changes') + (R ? ' → re-scored ' + R.total + '/1000 · ' + R.band + ' · ' + R.decision : ''));
    const rs = s.runStatus && s.runStatus.state === 'done' && R ? { ...s.runStatus, total: R.total, band: R.band, decision: R.decision, overridden: R.overridden, nAcc: accounts.length, flagged: T.filter((t) => t.flagged).length } : s.runStatus;
    if (rs && this._lastSummary && this._lastSummary.run === rs.run) this._lastSummary = { ...this._lastSummary, total: rs.total, band: rs.band, decision: rs.decision, overridden: rs.overridden };
    this.setState({ accounts, raw, acctDraft: {}, showAcctForm: false, acctSkipped: true, acctMsg: 'Saved. Transactions, review queue and risk score were recalculated' + (R ? ' — now ' + R.total + '/1000 · ' + R.band + ' · ' + R.decision : '') + '.', runStatus: rs });
  }
  resetWorkspace(label) {
    // a new run always starts from a clean screen; the old run lives on only in the Activity log / Run history
    let replaced = null;
    if (this._lastSummary && (this.state.raw.length || (this.state.runStatus && this.state.runStatus.state === 'done'))) {
      replaced = this._lastSummary;
      this.log('INFO', 'Archive', 'Previous data from Run #' + replaced.run + ' (' + replaced.source + ') cleared from the screen and replaced by Run #' + this._runId + '. Its summary stays in Run history: ' + replaced.nTx + ' txns · ' + replaced.total + '/1000 · ' + replaced.decision, false);
    }
    this._replacedPending = replaced;
    this._txCache = null; this._scCache = null; this._exCache = null;
    this.setState({
      raw: [], accounts: [], batches: [], pages: [], stages: null, error: null, current: null, needPw: null, pwText: '', acctDraft: {}, showAcctForm: false, acctSkipped: false, acctMsg: '', orderCheck: null, showVal: true, groupDraft: {}, confirmAcceptAll: false,
      overrides: {}, cpOverrides: {}, llmLabels: {}, previewPage: 0, fAcct: 'ALL', fMonth: 'ALL', fFlag: false, openInfo: {}, confirmClear: false,
      source: label, logRun: String(this._runId), logLevel: 'ALL', log: this._log.slice(),
      runStatus: { state: 'running', run: this._runId, source: label, started: this.now(), day: this.today(), replaced }
    });
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {}
  }
  async runPipeline(pages, sourceLabel) {
    if (this._running) { this.log('WARN', 'Pipeline', 'A run is already in progress — request ignored'); return; }
    this._running = true;
    if (!this._runFromFile) { this.newRun(); this.resetWorkspace(sourceLabel); this._fileVal = { tooBig: [], dupFiles: [], blank: [], lowOcr: [] }; }
    this._runFromFile = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const names = ['Convert to structured text', 'Validate page order', 'Batch extraction (3 pages/batch)', 'Enrich: counterparty, channel, attributes', 'Classify (RULE → LLM → MANUAL)', 'Credit risk scoring'];
    const stages = names.map((k) => ({ k, st: 'pending', d: 'Waiting' }));
    const total = names.length;
    const push = (i, st, d, detail, extra) => { stages[i] = { ...stages[i], st, d }; this.setState({ stages: stages.slice(), current: st === 'running' ? { i, name: names[i], detail: detail || d, started: this.now(), total } : this.state.current, log: this._log.slice(), ...(extra || {}) }); };
    this.log('INFO', 'Ingest', 'Run started for ' + sourceLabel, false);
    const replaced = this._replacedPending || null; this._replacedPending = null;
    const startedAt = this.now();
    this.setState({ runStatus: { state: 'running', run: this._runId, source: sourceLabel, started: startedAt, day: this.today(), replaced } });
    this.setState({ busy: true, error: null, pages, source: sourceLabel, raw: [], accounts: [], batches: [], overrides: {}, cpOverrides: {}, llmLabels: {}, previewPage: 0, fAcct: 'ALL', fMonth: 'ALL', stages: stages.slice(), log: this._log.slice() });
    try {
      // 1 convert
      push(0, 'running', 'Converting pages…', 'Converting ' + pages.length + ' page(s) to structured text');
      await sleep(40);
      pages.forEach((p) => this.log('INFO', 'Convert', 'Page ' + p.index + ' → ' + p.chars + ' characters of structured text' + (p.ocr ? ' (OCR, confidence ' + p.conf + '%)' : (p.sheet ? ' (Excel sheet "' + p.sheet + '")' : '')), false));
      push(0, 'done', pages.length + ' page(s) → markdown/text');
      // 2 validate
      push(1, 'running', 'Checking headers, footers, page numbers…', 'Verifying chronological page order across ' + pages.length + ' pages');
      await sleep(40);
      const v = this.validateOrder(pages);
      if (!v.ok) {
        this.log('ERROR', 'Validate order', v.msg, false);
        stages.slice(2).forEach((x, k) => { stages[k + 2] = { ...x, st: 'blocked', d: 'Stopped — fix page order first' }; });
        push(1, 'error', 'Jumbled pages detected', null, { runStatus: { state: 'failed', run: this._runId, source: sourceLabel, started: startedAt, ended: this.now(), msg: 'Page order check failed', replaced }, error: v.msg, busy: false, current: { i: 1, name: names[1], detail: 'Failed — pages out of order', started: this.now(), total, failed: true } });
        return;
      }
      this.log(v.soft && !v.datesChecked ? 'WARN' : 'INFO', 'Validate order', (v.soft && !v.datesChecked ? 'Order could not be verified: ' : 'Order confirmed via ') + v.method, false);
      this.setState({ orderCheck: v });
      push(1, 'done', 'Checked via ' + v.method);
      // 3 batches — the model reads batches the rules cannot (or every batch in "all" mode); output is re-checked by the rules
      let exPages = pages;
      if (this.llmEnabled()) { push(2, 'running', 'Model reading batches…', 'Sending 3-page batches to the LLM'); exPages = await this.llmExtract(pages); }
      const ex = this.extract(exPages);
      {
        // data cleaning: exact duplicate rows (overlapping statements) and impossible dates
        const pageFile = {}; pages.forEach((p) => { pageFile[p.index] = p.file || 'file'; });
        const keyOf = (r) => [r.account, r.date, r.narr.replace(/\s+/g, ' ').toUpperCase(), r.dr || 0, r.cr || 0, r.bal].join('|');
        const seenRow = {}; const kept = []; let dups = 0, badDates = 0, badAmt = 0;
        const today = this.dayNum(new Date().toISOString().slice(0, 10));
        ex.raw.forEach((r) => {
          const y = +r.date.slice(0, 4); const dn = this.dayNum(r.date);
          if (isNaN(dn) || y < 2000 || dn > today + 1) { badDates++; return; }
          if (!(r.dr > 0) && !(r.cr > 0)) { badAmt++; return; }
          const k = keyOf(r);
          if (seenRow[k] !== undefined && pageFile[seenRow[k]] !== pageFile[r.page]) { dups++; return; }
          if (seenRow[k] === undefined) seenRow[k] = r.page;
          kept.push(r);
        });
        if (dups) this.log('WARN', 'Validation', dups + ' duplicate transaction(s) removed — the same rows appear in more than one file (overlapping statements)', false);
        if (badDates) this.log('WARN', 'Validation', badDates + ' row(s) dropped — date before 2000 or in the future (likely OCR misread)', false);
        if (badAmt) this.log('WARN', 'Validation', badAmt + ' row(s) dropped — no debit or credit amount', false);
        ex.raw = kept; this._cleanStats = { dups, badDates, badAmt, both: kept.filter((r) => r.dr > 0 && r.cr > 0).length };
      }
      push(2, 'running', '0 of ' + ex.batches.length + ' batches', 'Starting batch extraction');
      for (let b = 0; b < ex.batches.length; b++) {
        const bt = ex.batches[b];
        push(2, 'running', (b + 1) + ' of ' + ex.batches.length + ' batches', 'Batch ' + bt.n + ' of ' + ex.batches.length + ' — pages ' + bt.pages, { batches: ex.batches.slice(0, b + 1) });
        await sleep(25);
        this.log('INFO', 'Extract', 'Batch ' + bt.n + ' (pages ' + bt.pages + '): ' + bt.rows + ' rows, account ' + (bt.accounts || '—'), false);
        if (bt.inherited !== '—') this.log('WARN', 'Extract', 'Batch ' + bt.n + ' inherited metadata: ' + bt.inherited, false);
      }
      ex.accounts.forEach((a) => this.log('INFO', 'Extract', 'Account detected: ' + a.key + ' · ' + a.type + ' · ' + a.bank + ' · ' + a.currency + (a.opening !== undefined && a.opening !== null ? ' · opening ' + this.fmt(a.opening) : ''), false));
      if (!ex.raw.length) {
        const msg = 'No transaction rows were recognised. This PoC reads tables with a date column followed by amounts and a running balance.';
        this.log('ERROR', 'Extract', msg, false);
        push(2, 'error', 'No rows found', null, { runStatus: { state: 'failed', run: this._runId, source: sourceLabel, started: startedAt, ended: this.now(), msg: 'No transactions recognised', replaced }, error: msg, busy: false, current: { i: 2, name: names[2], detail: 'Failed — no rows', started: this.now(), total, failed: true } });
        return;
      }
      push(2, 'done', ex.batches.length + ' batch(es), ' + ex.raw.length + ' transactions, ' + ex.accounts.length + ' account(s)', null, { accounts: ex.accounts, batches: ex.batches });
      // 4 enrich
      push(3, 'running', 'Extracting counterparties…', 'Extracting counterparty, payment channel and special attributes for ' + ex.raw.length + ' rows');
      await sleep(40);
      const tmp = { ...this.state, raw: ex.raw, accounts: ex.accounts, overrides: {}, cpOverrides: {}, llmLabels: {} };
      let T = this.buildTxns(tmp);
      if (this.llmEnabled()) {
        push(3, 'running', 'Model labelling uncertain rows…', 'Sending low-confidence counterparties / categories to the LLM');
        tmp.llmLabels = await this.llmLabelRows(T, tmp.threshold);
        T = this.buildTxns(tmp);
      }
      const lowCp = T.filter((t) => t.cpConf < tmp.threshold).length;
      const ch = {}; T.forEach((t) => { ch[t.channel] = (ch[t.channel] || 0) + 1; });
      this.log('INFO', 'Enrich', 'Channels: ' + Object.keys(ch).map((k) => k + ' ' + ch[k]).join(', '), false);
      this.log('INFO', 'Enrich', T.filter((t) => t.attrs.length).length + ' rows carry special attributes (loan a/c, card, platform, counterparty a/c, FX)', false);
      if (lowCp) this.log('WARN', 'Enrich', lowCp + ' row(s) with unclear counterparty — counterparty is mandatory, sent to review', false);
      push(3, 'done', T.length - lowCp + ' of ' + T.length + ' counterparties confident');
      // 5 classify
      push(4, 'running', 'Applying taxonomy…', 'Classifying ' + T.length + ' transactions (Level 1 → Level 2)');
      await sleep(40);
      const mc = (m) => T.filter((t) => t.method === m).length;
      const fl = T.filter((t) => t.flagged).length;
      this.log('INFO', 'Classify', 'RULE ' + mc('RULE') + ' · LLM ' + mc('LLM') + ' · MANUAL ' + mc('MANUAL') + ' — threshold ' + Math.round(tmp.threshold * 100) + '%', false);
      if (fl) this.log('WARN', 'Manual review', fl + ' transaction(s) queued for manual review', false);
      push(4, 'done', 'Two-level taxonomy + confidence', null, { raw: ex.raw, llmLabels: tmp.llmLabels });
      // 6 score
      push(5, 'running', 'Scoring 6 components…', 'Computing income, debt, liquidity, banking, fraud and expense metrics');
      await sleep(40);
      const R = this.score(T, tmp);
      R.comps.forEach((c) => this.log('INFO', 'Score', c.name + ': ' + Math.round(c.s) + '/100 × ' + Math.round(c.w * 100) + '%', false));
      [['circular', 'Circular transaction'], ['overnight', 'Overnight pass-through'], ['structuring', 'Structuring pattern'], ['integrity', 'Balance mismatch']].forEach(([k, l]) => { if (R[k].length) this.log('WARN', 'Fraud check', R[k].length + ' × ' + l, false); });
      this.log(R.decision === 'APPROVE' ? 'INFO' : 'WARN', 'Decision', this.verdict(R), false);
      const summary = { run: this._runId, source: sourceLabel, day: this.today(), started: startedAt, ended: this.now(), nTx: T.length, nAcc: ex.accounts.length, nPages: pages.length, total: R.total, band: R.band, decision: R.decision, overridden: R.overridden, flagged: fl };
      this._lastSummary = summary;
      push(5, 'done', this.verdict(R), null, { busy: false, current: null, runStatus: { ...summary, state: 'done', replaced } });
      this.log('INFO', 'Run summary', 'Run #' + summary.run + ' completed — ' + summary.nTx + ' txns, ' + summary.nAcc + ' accounts, ' + summary.nPages + ' pages · ' + summary.total + '/1000 ' + summary.band + ' · ' + summary.decision, true, summary);
    } catch (e) {
      this.log('ERROR', 'Pipeline', 'Unexpected error: ' + (e && e.message ? e.message : e), false);
      this.setState({ runStatus: { state: 'failed', run: this._runId, source: sourceLabel, started: startedAt, ended: this.now(), msg: 'Unexpected error', replaced }, busy: false, error: 'Unexpected error: ' + (e && e.message ? e.message : e), log: this._log.slice(), current: null });
    } finally { this._running = false; }
  }
  async handleFiles(files) {
    if (!files || !files.length) return;
    this._files = Array.from(files); this._pwMap = {}; this._pwInput = '';
    this.newRun(); this._runFromFile = true;
    this.resetWorkspace(this._files.map((f) => f.name).join(', '));
    this._files.forEach((f) => this.log('INFO', 'Ingest', 'File received: ' + f.name + ' (' + Math.round(f.size / 1024) + ' KB)', false));
    return this.processFiles();
  }
  async submitPassword() {
    const np = this.state.needPw; if (!np) return;
    const pw = this._pwInput || this.state.pwText || '';
    if (!pw) { this.setState({ needPw: { ...np, msg: 'Enter the password to continue.' } }); return; }
    this._pwMap[np.name] = pw; this._pwInput = ''; this.setState({ pwText: '' });
    this.log('USER', 'Ingest', 'Password entered for ' + np.name + ' — retrying decryption');
    this.setState({ needPw: null });
    return this.processFiles();
  }
  cancelPassword() {
    const np = this.state.needPw;
    this.log('WARN', 'Ingest', 'Password entry cancelled for ' + (np ? np.name : 'file') + ' — upload stopped');
    this._files = []; this._pwMap = {}; this._pwInput = '';
    this.setState({ needPw: null, busy: false, error: (np ? np.name : 'The file') + ' is password-protected. Upload stopped because no password was given.' });
  }
  async processFiles() {
    const files = this._files || [];
    this.setState({ busy: true, error: null, fileNote: '' });
    let current = null;
    try {
      let pages = []; const names = [];
      const imgJobs = new Map();
      files.forEach((f) => { if (/\.(png|jpe?g|webp)$/i.test(f.name)) { const p = this.ocrRun(f, f.name); p.catch(() => {}); imgJobs.set(f, p); } });
      const seen = new Set(); const fileVal = { tooBig: [], dupFiles: [], blank: [], lowOcr: [], pw: [], fromFile: true };
      for (const f of files) {
        current = f;
        const sig = f.name + '|' + f.size;
        if (seen.has(sig)) { fileVal.dupFiles.push(f.name); this.log('WARN', 'Validation', 'Duplicate file skipped: ' + f.name + ' was selected twice'); continue; }
        seen.add(sig);
        if (f.size > 25 * 1024 * 1024) { fileVal.tooBig.push(f.name); this.log('ERROR', 'Validation', f.name + ' is ' + Math.round(f.size / 1048576) + ' MB — over the 25 MB limit'); this.setState({ busy: false, error: f.name + ' is larger than 25 MB. Split the statement or reduce scan resolution (300 dpi is enough) and upload again.' }); return; }
        if (!f.size) { this.log('ERROR', 'Validation', f.name + ' is empty (0 bytes)'); this.setState({ busy: false, error: f.name + ' is an empty file.' }); return; }
        const before = pages.length;
        names.push(f.name); const nm = f.name.toLowerCase();
        if (/\.(png|jpe?g|webp)$/.test(nm)) {
          this.log('INFO', 'OCR', f.name + ' is an image — running OCR');
          const r = await imgJobs.get(f);
          pages.push({ index: pages.length + 1, text: r.text, chars: r.text.replace(/\s/g, '').length, ocr: true, conf: r.conf });
        } else if (/\.(xlsx|xls|xlsm)$/.test(nm)) {
          pages = pages.concat(this.excelToPages(await f.arrayBuffer(), f.name));
        } else if (/\.pdf$/.test(nm)) {
          const pp = await this.pdfToPages(await f.arrayBuffer(), this._pwMap[f.name], f.name);
          if (this._pwMap[f.name]) fileVal.pw.push(f.name);
          if (this._pwMap[f.name]) this.log('INFO', 'Convert', f.name + ' decrypted successfully (' + pp.length + ' pages)', false);
          const nOcr = pp.filter((p) => p.ocr).length;
          if (nOcr) this.log('INFO', 'OCR', f.name + ': ' + nOcr + ' of ' + pp.length + ' page(s) read by OCR (scanned)');
          pages = pages.concat(pp);
        } else {
          pages = pages.concat(this.textToPages(await f.text()));
        }
        for (let k = before; k < pages.length; k++) pages[k] = { ...pages[k], file: f.name };
      }
      pages = pages.map((p, i) => ({ ...p, index: i + 1 }));
      pages.forEach((p) => { if (p.chars < 25) fileVal.blank.push(p.index); if (p.ocr && p.conf !== null && p.conf < 60) fileVal.lowOcr.push(p.index + ' (' + p.conf + '%)'); });
      this._fileVal = fileVal;
      this._pwMap = {};
      this.setState({ ocrMsg: '' });
      this.runPipeline(pages, names.join(', '));
    } catch (e) {
      if (e && (e.name === 'PasswordException' || /password/i.test(e.message || '')) && current) {
        const wrong = e.code === 2 || /incorrect/i.test(e.message || '');
        delete this._pwMap[current.name];
        this.log(wrong ? 'ERROR' : 'WARN', 'Ingest', current.name + (wrong ? ' — incorrect password' : ' is password-protected — waiting for password'));
        this.setState({ busy: false, error: null, tab: 'ingest', needPw: { name: current.name, wrong, msg: wrong ? 'That password did not work. Check it and try again.' : '' } });
        return;
      }
      this.setState({ ocrMsg: '' });
      this.log('ERROR', 'Ingest', 'Could not read file: ' + (e && e.message ? e.message : e));
      this.setState({ busy: false, error: 'Could not read file: ' + (e && e.message ? e.message : e) });
    }
  }

  stepInfo() {
    return {
      conv: 'INPUT  Digital or password-protected PDF, scanned PDF, image (PNG / JPG), Excel (XLSX / XLS), CSV, TXT / MD, or a sample.\nDIGITAL PDF  Text layer read directly; words on the same line re-joined left to right.\nSCANNED PDF / IMAGE  Page rendered and read by OCR (Tesseract, English) in the browser; confidence logged per page.\nEXCEL  Each sheet becomes one page of CSV text; dates written as DD/MM/YYYY.\nOUTPUT  One text block per page.',
      val: 'CHECKS  The "Page X of Y" footer on each page matches its position in the file.\nFAILS  If a page is out of place: the run stops and names the misplaced page.\nFALLBACK  No page footers found: the order check is skipped and noted.',
      ext: 'BATCH  3 pages at a time (sized for one model call in production).\nHEADER  Bank, account / card no., holder, account type, currency, opening balance.\nINHERITS  Pages with no header carry those fields from earlier pages; logged.\nROWS  Date, value date, narration, debit, credit, balance. Single-amount rows get debit / credit from the balance change; wrapped narrations are re-joined.',
      enr: 'COUNTERPARTY  Mandatory. Parsed from the narration format (UPI, NEFT / RTGS, IMPS, NACH, BBPS, card, Apple Pay, ATM, cash, bank charges) with a confidence score.\nCHANNEL  UPI, NEFT, IMPS, RTGS, NACH / ACH, ATM, cheque, cash, BBPS, card, internal, transfer.\nATTRIBUTES  Loan a/c no., card last 4, platform (Stripe, Apple Pay…), counterparty a/c, foreign amount and currency.',
      cls: 'IN SIMPLE WORDS  Like sorting receipts into labelled envelopes (Groceries, Rent, Salary, EMI…). Three helpers sort, one after another.\n1 RULE  The rule book: your own rules, fixed rules (salary, EMI with loan no., refund, bounce, own transfer, card bill), narration keywords (RENT, TUITION, SWIGGY…), payments to a person = P2P. Very sure: 84–97%.\n2 LLM  Leftovers (low confidence, OTHER, lexical guesses) go to Claude when an API key is configured (CLI); the answer is checked against the taxonomy. Without a key the rule guess stays (66–78%, or OTHER at 35%).\n3 MANUAL  Anything under the threshold goes to the Review queue; a person decides → 100%.\nEVERY ROW  Gets Level 1 (CREDIT / DEBIT), Level 2 category, a confidence % and the method that sorted it.',
      review: 'WHO  A person, in the Review queue.\nDOES  Fix the counterparty or category, or confirm as is. Each fix = MANUAL, 100% confidence; the score re-runs instantly.\nDONE  When no transaction is below the threshold.',
      score: 'INCOME 25%  Regularity, sources, growth, level (P2P, refunds, loans, own transfers excluded).\nDEBT 20%  EMIs per loan, FOIR, bounce rate, on-time rate.\nLIQUIDITY 15%  Avg / min end-of-day balance, negative days.\nBANKING 10%  Bounces, charges, penalties, overdraft.\nFRAUD 15%  Balance arithmetic, circular, overnight, structuring.\nEXPENSE 15%  Essential vs discretionary, fixed vs variable, trend, savings.\nTOTAL  Weighted sum × 10 → 0–1000.',
      decision: 'BAND  800+ Excellent · 700 Good → APPROVE · 600 Fair → WITH CONDITIONS · 500 Below Avg → REFER · <500 Poor → DECLINE.\nOVERRIDES  FOIR > 65% → DECLINE · balances unreadable, under 3 months of history, tampering, structuring, circular flows → REFER · >30% of inflows unclassified → no APPROVE · EMI bounce turns APPROVE into WITH CONDITIONS.\nPROVISIONAL  Until the review queue is clear.',
      text: 'Each page is converted to plain text with three parts:\n1  HEADER  "Key: Value" lines — Account Holder, Account Number, Account Type, Currency, Statement Period, Opening Balance. Continuation pages may have none.\n2  TABLE  | Date | Value Date | Narration | Debit | Credit | Balance | — one row per transaction, dates DD/MM/YYYY, amounts like 1,42,500.00.\n3  FOOTER  "Page X of Y", used for the order check.\nPDF text without pipes is read as: date  [value date]  narration  amount  balance.'
    };
  }
  examples() {
    const s = this.state;
    const live = s.raw.length > 0 && !s.busy;
    const key = live ? s.raw : 'sample';
    if (this._exCache && this._exCache.key === key && this._exCache.ov === s.overrides && this._exCache.cov === s.cpOverrides && this._exCache.thr === s.threshold && this._exCache.cr === s.customRules) return this._exCache.val;
    let st, pages;
    if (live) { st = s; pages = s.pages; }
    else { pages = this.genSample('flags'); const ex = this.extract(pages); st = { ...s, raw: ex.raw, accounts: ex.accounts, batches: ex.batches, overrides: {}, cpOverrides: {} }; }
    const T = this.buildTxns(st); const R = this.score(T, st);
    const src = live ? 'FROM CURRENT RUN — ' + (s.source || '') : 'FROM SAMPLE — Applicant with risk flags (run a file to see your own data)';
    const p1 = pages[0] ? pages[0].text.split('\n') : [];
    const v = this.validateOrder(pages);
    const bt = st.batches.find((b) => b.inherited !== '—') || st.batches[0];
    const acc = st.accounts.find((a) => a.card) || st.accounts[0];
    const rec = (t) => t ? JSON.stringify({ date: t.date, value_date: t.vdate, account: t.account, month: t.month, narration: t.narr, debit: t.dr || null, credit: t.cr || null, balance: t.bal, counterparty: t.cp, counterparty_confidence: t.cpConf, channel: t.channel, currency: t.currency, attributes: t.attrs.reduce((o, a) => { o[a.k] = a.v; return o; }, {}), level1: t.l1, level2: t.l2, classification_confidence: Math.round(t.conf * 100) / 100, method: t.method, flagged: t.flagged, reasons: t.reasons }, null, 2) : '(no transactions)';
    const good = T.find((t) => t.l2 === 'EMI') || T.find((t) => !t.flagged) || T[0];
    const bad = T.find((t) => t.flagged);
    const fl = T.filter((t) => t.flagged);
    const pad = (x, n) => (x + ' '.repeat(n)).slice(0, n);
    const val = {
      conv: src + '\n\n' + p1.slice(0, 12).join('\n') + (p1.length > 12 ? '\n…' : '') + '\n' + (pages[0] ? (pages[0].text.match(/Page\s+\d+\s*of\s*\d+/i) || [''])[0] : '') + '\n\n' + pages.length + ' page(s) converted',
      val: src + '\n\n' + (v.ok ? 'PASS  Order confirmed via ' + v.method : 'FAIL  ' + v.msg) + '\n\nOn the jumbled sample:\nFAIL  Pages appear jumbled: position 4 in the file carries footer "Page 5 of 12". Expected page 4.',
      ext: src + '\n\n' + (bt ? 'Batch #' + bt.n + ' · pages ' + bt.pages + ' · account ' + bt.accounts + ' · ' + bt.rows + ' rows\nInherited: ' + bt.inherited : '') + '\n\n' + (acc ? 'Account: ' + acc.key + ' · ' + acc.type + ' · ' + acc.holder + '\nBank ' + acc.bank + ' · Currency ' + acc.currency + ' · Opening ' + (acc.opening !== undefined && acc.opening !== null ? this.fmt(acc.opening) : '—') + ' · Pages ' + Array.from(new Set(acc.pages)).join(', ') : '') + '\n\n' + st.batches.length + ' batches · ' + T.length + ' transactions · ' + st.accounts.length + ' accounts',
      enr: src + '\n\nCounterparty / channel / attributes on one row:\n' + (good ? good.narr + '\n→ counterparty ' + good.cp + ' (' + Math.round(good.cpConf * 100) + '%) · channel ' + good.channel + ' · currency ' + good.currency + (good.attrs.length ? ' · ' + good.attrs.map((a) => a.k + ' ' + a.v).join(' · ') : '') : '') + (bad ? '\n\n' + bad.narr + '\n→ counterparty ' + bad.cp + ' (' + Math.round(bad.cpConf * 100) + '%) · channel ' + bad.channel : ''),
      cls: src + '\n\nTransaction record:\n' + rec(good) + (bad ? '\n\nFlagged record:\n' + rec(bad) : ''),
      review: src + '\n\n' + (fl.length ? fl.length + ' transaction(s) awaiting reviewer:\n' + fl.slice(0, 5).map((t) => '• ' + this.dispDate(t.date) + '  ' + t.narr + '  → ' + t.l2 + '  [' + t.reasons.join('; ') + ']').join('\n') + (fl.length > 5 ? '\n…' : '') : 'Queue clear — no transaction below threshold.'),
      score: src + '\n\n' + (R ? R.comps.map((c) => pad(c.name, 20) + pad(Math.round(c.s) + '/100', 8) + '× ' + Math.round(c.w * 100) + '%').join('\n') + '\n──────────────────────────────────\nComposite ' + R.total + ' / 1000 · ' + R.band + '\n\nAvg income ₹' + this.fmt0(R.avgInc) + '/month · EMI ₹' + this.fmt0(R.monthlyEmi) + '/month · FOIR ' + this.pct(R.foir) + '\nAvg EOD ₹' + this.fmt0(R.avgEod) + ' · Min EOD ₹' + this.fmt0(R.minEod) + ' · Negative days ' + R.negDays : ''),
      decision: src + '\n\n' + (R ? 'Decision: ' + R.decision + (fl.length ? '  (provisional until review is clear)' : '') + '\n' + R.why.map((w) => ' • ' + w).join('\n') + '\n\nOn the clean salaried sample: 931 / 1000 · Excellent · APPROVE' : ''),
      text: src + '\n\n' + p1.slice(0, 11).join('\n') + '\n…'
    };
    this._exCache = { key, ov: s.overrides, cov: s.cpOverrides, thr: s.threshold, cr: s.customRules, val };
    return val;
  }
  infoToggle(key) { const o = { ...(this.state.openInfo || {}) }; o[key] = !o[key]; this.setState({ openInfo: o }); }
  infoFor(key, label) { const open = !!(this.state.openInfo || {})[key]; const ek = key === 'textInfo' ? 'text' : key.replace(/^[IL]/, ''); return { example: open ? (this.examples()[ek] || '') : '', info: this.stepInfo()[key] || '', infoOpen: open, infoExp: open ? 'true' : 'false', infoLabel: (open ? 'Hide' : 'Show') + ' what happens in ' + label, infoToggle: () => this.infoToggle(key), infoBtn: open ? 'background:#1F4FD1;color:#FFFFFF;border-color:#1F4FD1' : 'background:#FFFFFF;color:#1F4FD1;border-color:#9EB0E6' }; }

  runVals(warns) {
    const s = this.state; const r = s.runStatus; warns = warns || [];
    const wOn = !!(r && r.state === 'done' && warns.length);
    const hist = this._log.filter((e) => e.step === 'Run summary' && e.meta).map((e) => e.meta).slice().reverse();
    const out = { hasRunDone: !!(r && r.state === 'done'), hasRunBusy: !!(r && r.state === 'running'), hasRunFail: !!(r && r.state === 'failed'), hasReplaced: !!(r && r.replaced), noReplaced: !(r && r.replaced),
      runNo: r ? r.run : '', runSrc: r ? r.source : '', runEnd: r ? (r.ended || '').slice(0, 8) : '', runStart: r ? (r.started || '').slice(0, 8) : '', runDay: r ? r.day || '' : '',
      runFacts: r && r.state === 'done' ? r.nTx + ' transactions · ' + r.nAcc + ' accounts · ' + r.nPages + ' pages' : '',
      runResult: r && r.state === 'done' ? this.verdict(r) + (r.flagged ? ' (provisional — ' + r.flagged + ' to review)' : '') : '',
      runFailMsg: r ? (r.msg || '') : '',
      repNo: r && r.replaced ? r.replaced.run : '', repSrc: r && r.replaced ? r.replaced.source : '', repFacts: r && r.replaced ? r.replaced.nTx + ' txns · ' + r.replaced.total + '/1000 · ' + r.replaced.decision : '',
      pipeHead: r ? 'Run #' + r.run + (r.state === 'done' ? ' · refreshed ' + (r.ended || '').slice(0, 8) : (r.state === 'running' ? ' · running since ' + (r.started || '').slice(0, 8) : ' · failed ' + (r.ended || '').slice(0, 8))) : 'No run yet',
      pipeHeadStyle: 'font-size:12px;font-weight:600;color:' + (r ? (r.state === 'done' ? '#1E7B45' : (r.state === 'running' ? '#8A6400' : '#B42318')) : '#4A4F58'),
      hist: hist.map((h, i) => ({ ...h, when: (h.day || '') + ' ' + (h.ended || '').slice(0, 8), score: h.total + ' · ' + h.band, status: r && r.state === 'done' && h.run === r.run ? 'Current' : 'Replaced — archived', stStyle: r && r.state === 'done' && h.run === r.run ? 'color:#1E7B45;font-weight:700' : 'color:#4A4F58' })),
      hasHist: hist.length > 0, noHist: hist.length === 0, nHist: hist.length,
      runWarn: wOn, noRunWarn: !wOn, runWarnList: warns, nWarn: warns.length,
      bannerBox: 'border:1px solid ' + (wOn ? '#D9A06B' : '#1E7B45') + ';background:' + (wOn ? '#FFF6EC' : '#EAF6EE'),
      bannerIcon: wOn ? '#B54708' : '#1E7B45', bannerTitleStyle: 'font-size:15px;color:' + (wOn ? '#7A3A06' : '#14532D'), bannerText: wOn ? 'color:#4A2A0A' : 'color:#1F3B2A',
      bannerTitle: wOn ? 'Statement processed with ' + warns.length + ' item(s) to fix' : 'Statement processed — all checks passed',
      bannerBtn: 'background:' + (wOn ? '#B54708' : '#1E7B45') + ';color:#FFFFFF;border:1px solid ' + (wOn ? '#B54708' : '#1E7B45'),
      goLog: () => this.setState({ tab: 'log' }), dismissRun: () => this.setState({ runStatus: null })
    };
    return out;
  }

  exportData(T, R) {
    const s = this.state; const r2 = (x) => (x === null || x === undefined || isNaN(x) ? null : Math.round(x * 100) / 100); const pct = (x) => (x === null || x === undefined || isNaN(x) || !isFinite(x) ? null : Math.round(x * 1000) / 10);
    const V = this.validationReport(T, R);
    const rs = s.runStatus || {};
    return {
      schema: 'ledgerlens.bsa.v1',
      generated_at: new Date().toISOString(),
      run: { id: rs.run || null, source: s.source || null, pages: (s.pages || []).length, batches: (s.batches || []).map((b) => ({ batch: b.n, pages: b.pages, rows: b.rows, accounts: b.accounts, metadata_inherited: b.inherited })) },
      accounts: s.accounts.map((a) => ({ account_number: a.key, bank: a.bank, holder: a.holder, account_type: a.type, is_credit_card: !!a.card, currency: a.currency, opening_balance: r2(a.opening), closing_balance: r2(a.closing), statement_period: a.periodFrom ? { from: a.periodFrom, to: a.periodTo } : null, pages: Array.from(new Set(a.pages)), entered_manually: a.manual || [] })),
      data_validation: { summary: { total: V.length, passed: V.filter((v) => v.st === 'pass').length, warnings: V.filter((v) => v.st === 'warn').length, failed: V.filter((v) => v.st === 'fail').length, not_applicable: V.filter((v) => v.st === 'na').length }, checks: V.map((v) => ({ id: v.n, group: v.group, check: v.name, status: { pass: 'PASS', warn: 'WARNING', fail: 'FAILED', na: 'N/A', pending: 'NOT_RUN' }[v.st], result: v.detail || null, rule: v.rule, on_fail: v.onFail })) },
      transactions: T.map((t) => ({
        id: t.id, date: t.date, value_date: t.vdate, account_number: t.account, month: t.month, narration: t.narr,
        debit: r2(t.dr || null), credit: r2(t.cr || null), balance: r2(t.bal), currency: t.currency,
        counterparty: t.cp, counterparty_confidence: r2(t.cpConf), counterparty_format: t.cpFmt || null,
        channel: t.channel, attributes: t.attrs.reduce((o, a) => { o[a.k.toLowerCase().replace(/[^a-z0-9]+/g, '_')] = a.v; return o; }, {}),
        level1: t.l1, level2: t.l2, category_group: t.group || null, essential: t.ess || null, fixed_or_variable: t.fix || null,
        classification_confidence: r2(t.conf), method: t.method, method_reason: t.why,
        review: { flagged: !!t.flagged, reasons: t.reasons, impact: t.impact || null, auto_accepted_low_impact: !!t.autoAccepted },
        source_page: t.page, batch: t.batch
      })),
      credit_risk_summary: R ? {
        customer: (s.accounts[0] && s.accounts[0].holder) || null,
        period: { from_month: R.months[0], to_month: R.months[R.months.length - 1], months: R.months.length, days_covered: R.spanDays, minimum_months: R.minMonths, sufficient_history: R.historyOk },
        composite_score: R.total, scale: '0-1000', rating_band: R.band, band_decision: R.bandDecision, decision: R.decision, decision_overridden: R.overridden, decision_reasons: R.why,
        provisional: T.some((t) => t.flagged), pending_review_items: T.filter((t) => t.flagged).length,
        components: R.comps.map((c) => ({ component: c.name, weight_pct: Math.round(c.w * 100), score_0_100: Math.round(c.s * 10) / 10, points: Math.round(c.s * c.w * 10) })),
        metrics: {
          income_stability: { avg_monthly_income: r2(R.avgInc), unclassified_inflow_share_pct: pct(R.unexplainedShare), monthly_income: R.months.map((m, i) => ({ month: m, total: r2(R.income[i]) })), income_by_category: R.incomeByCat.map((c) => ({ category: c.cat, by_month: c.vals.map((v, i) => ({ month: R.months[i], amount: r2(v) })) })), regularity_cv_pct: pct(R.cv), source_count: R.incomeCats.length, primary_source_share_pct: pct(R.shareTop), growth_first_to_last_pct: pct(R.growth) },
          debt_service: { emi_obligations: R.loanList.map((l) => ({ loan_account: l.loan, lender: l.lender, monthly_emi: r2(l.monthly), presented: l.presented, bounced: l.bounced })), monthly_emi_total: r2(R.monthlyEmi), foir_pct: pct(R.foir), emi_bounce_rate_pct: pct(R.bounceRate), on_time_payment_rate_pct: pct(R.ontimeRate) },
          liquidity: { avg_eod_balance: r2(R.avgEod), min_eod_balance: r2(R.minEod), negative_balance_days: R.negDays, days_observed: R.eodDays },
          banking_behaviour: { bounces: R.bounced, bounce_charges: R.bounceCharges.map((t) => ({ date: t.date, amount: r2(t.amount), narration: t.narr })), penalty_fees: R.penalties.map((t) => ({ date: t.date, amount: r2(t.amount), narration: t.narr })), total_fees_and_charges: r2(R.chargeAmt), overdraft_days: R.negDays },
          fraud_indicators: { balance_arithmetic_breaks: R.integrity.length, rows_with_printed_balance_pct: pct(R.balCoverage), circular_transactions: R.circular.map((x) => ({ counterparty: x.a.cp, in: { date: x.a.date, amount: r2(x.a.amount) }, out: { date: x.b.date, amount: r2(x.b.amount) } })), overnight_pass_through: R.overnight.map((x) => ({ in: { date: x.a.date, amount: r2(x.a.amount) }, out: { date: x.b.date, amount: r2(x.b.amount) } })), structuring: R.structuring.map((x) => ({ cash_deposits: x.count, total: r2(x.total), from: x.from, to: x.to })) },
          expense_management: { monthly_spend: R.months.map((m, i) => ({ month: m, total: r2(R.exp[i]), essential: r2(R.essM[i]), discretionary: r2(R.discM[i]), fixed: r2(R.fixM[i]) })), essential_share_pct: pct(1 - R.discShare), discretionary_share_pct: pct(R.discShare), fixed_share_pct: pct(R.fixedShare), variable_share_pct: pct(1 - R.fixedShare), spend_trend_first_to_last_pct: pct(R.expTrend), savings_rate_after_emi_pct: pct(R.savingsRate) }
        }
      } : null
    };
  }
  valCatalog() {
    // every validation point: group, name, what is checked, what happens when it fails
    return [
      ['On upload', 'Password-protected PDF', 'Locked PDFs are detected; you enter the password, which is used once in the browser and never stored or logged.', 'Upload pauses until the right password is entered; a wrong password shows an error.'],
      ['On upload', 'Empty file', 'Files of 0 bytes are rejected.', 'Upload stops with a message naming the file.'],
      ['On upload', 'Scanned PDF / image detected', 'Pages with no text layer, and PNG / JPG images, are sent to OCR automatically.', 'Not a failure — the page is read by OCR instead.'],
      ['On upload', 'OCR engine available', 'Before OCR, the browser is checked for background workers, script loading, WebAssembly and in-memory data.', 'Clear error naming what is blocked; digital PDFs, Excel, CSV and text still work.'],
      ['On upload', 'Transactions found', 'At least one row with a date and an amount must be recognised.', 'Run stops: “No transaction rows were recognised”.'],
      ['File', 'Supported type, size and page limits', 'PDF, PNG / JPG, Excel, CSV or text; ≤ 25 MB per file; ≤ 300 pages per PDF.', 'Upload stops with advice to split or compress the file.'],
      ['File', 'Duplicate files in the upload', 'The same file (name + size) selected twice.', 'Second copy skipped; warning shown.'],
      ['File', 'Readable text on every page', 'Each page must yield some text after conversion / OCR.', 'Warning listing the blank pages.'],
      ['File', 'OCR quality (scans and images)', 'OCR confidence per page must be ≥ 60%.', 'Warning listing low-quality pages; expect more review items.'],
      ['Structure', 'Page order', '“Page X of Y” footers per file; if absent, dates must not run backwards between pages.', 'Run stops: “Pages appear jumbled” or “Page(s) missing … (missing 3, 4)”.'],
      ['Structure', 'Account details present', 'Account number, bank, holder and opening balance for every account.', 'Warning plus a form to fill in the missing details.'],
      ['Structure', 'Transactions inside the stated statement period', 'Every row date falls within the printed “Statement Period”.', 'Warning: possible merged or edited file.'],
      ['Structure', 'Statement covers the full stated period', 'Data starts / ends within 10 days of the stated period.', 'Warning: missing weeks can hide income or EMIs.'],
      ['Integrity', 'Running balance arithmetic (every row)', 'Previous balance ± amount must equal the printed balance on every row; the balance must be readable on 80%+ of rows.', 'FAILED; decision forced to REFER (possible tampering, or unverified extraction).'],
      ['Integrity', 'Opening + transactions = closing balance', 'Per account, opening balance plus all movements must equal the closing balance.', 'FAILED; points to deleted rows or missing pages.'],
      ['Integrity', 'Duplicate transactions (overlapping statements)', 'Identical rows (account, date, narration, amount, balance) appearing in two files.', 'Duplicates removed before scoring; warning shown.'],
      ['Integrity', 'Valid dates', 'No dates before 2000 or in the future.', 'Bad rows dropped (usually OCR misreads); warning shown.'],
      ['Integrity', 'Valid amounts', 'Each row moves money one way: a debit or a credit, not both and not neither.', 'Rows without an amount dropped; rows with both flagged.'],
      ['Completeness', 'No missing months / long gaps', 'No account goes more than 35 days without a transaction.', 'Warning: a missing month can hide a bounce or salary gap.'],
      ['Completeness', 'Enough history to score', 'At least 3 months (75+ days) and 20 transactions.', 'Under 3 months: decision forced to REFER. Under 20 transactions: warning.'],
      ['Consistency', 'Currency', 'All accounts in one currency; foreign card spends noted.', 'Warning: mixed currencies must not be added together.'],
      ['Consistency', 'All accounts belong to the same applicant', 'Holder names across accounts match (joint accounts allowed).', 'Warning: another person’s statement would inflate income.']
    ];
  }
  validationReport(T, R) {
    const s = this.state; const cat = this.valCatalog();
    const ran = s.raw.length > 0 && !s.busy;
    const live = ran ? this.validations(T, R) : [];
    const fv = this._fileVal || {};
    const ocrPages = (s.pages || []).filter((p) => p.ocr).length;
    const up = {
      'Password-protected PDF': fv.pw && fv.pw.length ? { st: 'pass', detail: 'Unlocked: ' + fv.pw.join(', ') } : { st: 'na', detail: 'No password needed' },
      'Empty file': fv.fromFile ? { st: 'pass', detail: 'All files have content' } : { st: 'na', detail: 'Built-in sample — no file uploaded' },
      'Scanned PDF / image detected': ocrPages ? { st: 'pass', detail: ocrPages + ' page(s) read by OCR' } : { st: 'na', detail: 'Digital text — OCR not needed' },
      'OCR engine available': ocrPages ? { st: 'pass', detail: 'OCR engine started and read ' + ocrPages + ' page(s)' } : { st: 'na', detail: 'Not needed for this run' },
      'Transactions found': { st: 'pass', detail: T.length + ' transaction(s) recognised' }
    };
    return cat.map(([group, name, rule, onFail], i) => {
      let r = null;
      if (ran) { r = up[name] || live.find((v) => v.name === name) || null; }
      const why = (live.find((v) => v.name === name) || {}).why || '';
      return { n: i + 1, group, name, rule, onFail, why, st: r ? r.st : 'pending', detail: r ? r.detail : '' };
    });
  }
  validations(T, R) {
    const s = this.state; if (!s.raw.length || s.busy) return [];
    const out = []; const add = (group, name, st, detail, why) => out.push({ group, name, st, detail, why });
    const fv = this._fileVal || { tooBig: [], dupFiles: [], blank: [], lowOcr: [] }; const cs = this._cleanStats || { dups: 0, badDates: 0, badAmt: 0, both: 0 };
    const oc = s.orderCheck || {};
    // FILE
    add('File', 'Supported type, size and page limits', 'pass', 'PDF / image / Excel / CSV / text · ≤ 25 MB · ≤ 300 pages', 'Rejects files the pipeline cannot read reliably.');
    add('File', 'Duplicate files in the upload', fv.dupFiles.length ? 'warn' : 'pass', fv.dupFiles.length ? 'Skipped: ' + fv.dupFiles.join(', ') : 'No file selected twice', 'The same file twice would double income and spend.');
    add('File', 'Readable text on every page', fv.blank.length ? 'warn' : 'pass', fv.blank.length ? 'Blank or unreadable page(s): ' + fv.blank.join(', ') : s.pages.length + ' page(s) with text', 'Blank pages can hide missing transactions.');
    const ocrPages = s.pages.filter((p) => p.ocr);
    add('File', 'OCR quality (scans and images)', !ocrPages.length ? 'na' : (fv.lowOcr.length ? 'warn' : 'pass'), !ocrPages.length ? 'No OCR needed — digital text' : (fv.lowOcr.length ? 'Low confidence on page(s) ' + fv.lowOcr.join(', ') : ocrPages.length + ' OCR page(s), all ≥ 60% confidence'), 'Misread digits change amounts and balances.');
    // STRUCTURE
    add('Structure', 'Page order', oc.soft && !oc.datesChecked ? 'warn' : 'pass', oc.method ? 'Checked via ' + oc.method : 'Checked', 'Jumbled pages break running balances and dates.');
    const miss = s.accounts.filter((a) => this.acctMissing(a).length);
    add('Structure', 'Account details present', miss.length ? 'warn' : 'pass', miss.length ? miss.map((a) => a.key + ': missing ' + this.acctMissing(a).join(', ')).join(' · ') : s.accounts.length + ' account(s) with number, bank, holder and opening balance', 'Needed to group transactions and run the balance check.');
    const outP = []; const cov = [];
    s.accounts.forEach((a) => {
      if (!a.periodFrom || !a.periodTo) return;
      const rows = T.filter((t) => t.account === a.key); if (!rows.length) return;
      const n = rows.filter((t) => t.date < a.periodFrom || t.date > a.periodTo).length; if (n) outP.push(a.key + ': ' + n + ' row(s) outside ' + this.dispDate(a.periodFrom) + '–' + this.dispDate(a.periodTo));
      const first = rows[0].date, last = rows[rows.length - 1].date;
      if (this.dayNum(first) - this.dayNum(a.periodFrom) > 10 || this.dayNum(a.periodTo) - this.dayNum(last) > 10) cov.push(a.key + ': data ' + this.dispDate(first) + '–' + this.dispDate(last) + ' vs stated ' + this.dispDate(a.periodFrom) + '–' + this.dispDate(a.periodTo));
    });
    const hasPeriod = s.accounts.some((a) => a.periodFrom);
    add('Structure', 'Transactions inside the stated statement period', !hasPeriod ? 'na' : (outP.length ? 'warn' : 'pass'), !hasPeriod ? 'No statement period printed' : (outP.length ? outP.join(' · ') : 'All rows inside the period'), 'Rows outside the period suggest a merged or edited file.');
    add('Structure', 'Statement covers the full stated period', !hasPeriod ? 'na' : (cov.length ? 'warn' : 'pass'), !hasPeriod ? 'No statement period printed' : (cov.length ? cov.join(' · ') : 'Data spans the stated period'), 'Missing start or end weeks hide income or EMIs.');
    // INTEGRITY
    const integ = R ? R.integrity.length : 0;
    const balMissing = T.filter((t) => t.bal === null || t.bal === undefined).length;
    if (T.length && balMissing / T.length > 0.2) add('Integrity', 'Running balance arithmetic (every row)', 'fail', 'Balance column read on only ' + (T.length - balMissing) + ' of ' + T.length + ' rows — arithmetic cannot be checked, so the extraction is unverified', 'The strongest tamper signal: edited amounts break the arithmetic.');
    else add('Integrity', 'Running balance arithmetic (every row)', integ ? 'fail' : (s.accounts.every((a) => a.opening !== undefined && a.opening !== null) ? 'pass' : 'warn'), integ ? integ + ' row(s) where previous balance ± amount ≠ printed balance' : (s.accounts.every((a) => a.opening !== undefined && a.opening !== null) ? 'All ' + T.length + ' rows reconcile' : 'Checked from the 2nd row (opening balance missing for some accounts)'), 'The strongest tamper signal: edited amounts break the arithmetic.');
    const rec = [];
    s.accounts.forEach((a) => {
      const rows = T.filter((t) => t.account === a.key); if (!rows.length || a.opening === undefined || a.opening === null) return;
      const net = rows.reduce((x, t) => x + (a.card ? (t.dr || 0) - (t.cr || 0) : (t.cr || 0) - (t.dr || 0)), 0);
      const expect = Math.round((a.opening + net) * 100) / 100; const last = rows[rows.length - 1].bal;
      const closing = a.closing !== undefined && a.closing !== null ? a.closing : last;
      if (Math.abs(expect - closing) > 1) rec.push(a.key + ': opening ' + this.fmt(a.opening) + ' + net ' + this.fmt(net) + ' = ' + this.fmt(expect) + ', statement shows ' + this.fmt(closing));
    });
    const anyOpening = s.accounts.some((a) => a.opening !== undefined && a.opening !== null);
    add('Integrity', 'Opening + transactions = closing balance', rec.length ? 'fail' : (anyOpening ? 'pass' : 'na'), rec.length ? rec.join(' · ') : (anyOpening ? 'Reconciles for every account with an opening balance' : 'No opening balance read — cannot reconcile'), 'Catches missing pages or deleted rows.');
    add('Integrity', 'Duplicate transactions (overlapping statements)', cs.dups ? 'warn' : 'pass', cs.dups ? cs.dups + ' duplicate row(s) removed before scoring' : 'No duplicates across files', 'Overlapping uploads would double count income.');
    add('Integrity', 'Valid dates', cs.badDates ? 'warn' : 'pass', cs.badDates ? cs.badDates + ' row(s) with impossible dates dropped' : 'All dates valid and not in the future', 'OCR can misread years; future dates indicate errors.');
    add('Integrity', 'Valid amounts', cs.badAmt || cs.both ? 'warn' : 'pass', (cs.badAmt ? cs.badAmt + ' row(s) without an amount dropped. ' : '') + (cs.both ? cs.both + ' row(s) with both debit and credit' : (cs.badAmt ? '' : 'Every row has exactly one of debit or credit')), 'A row must move money in one direction.');
    // COMPLETENESS
    const gaps = [];
    s.accounts.forEach((a) => {
      const rows = T.filter((t) => t.account === a.key); if (rows.length < 2) return;
      for (let i = 1; i < rows.length; i++) { const g = this.dayNum(rows[i].date) - this.dayNum(rows[i - 1].date); if (g > 35) gaps.push(a.key + ': no transactions ' + this.dispDate(rows[i - 1].date) + ' → ' + this.dispDate(rows[i].date) + ' (' + g + ' days)'); }
    });
    add('Completeness', 'No missing months / long gaps', gaps.length ? 'warn' : 'pass', gaps.length ? gaps.join(' · ') : 'No gap longer than 35 days', 'A missing month can hide an EMI bounce or salary gap.');
    const months = new Set(T.map((t) => t.month)).size;
    add('Completeness', 'Enough history to score', (R && !R.historyOk) || T.length < 20 ? 'warn' : 'pass', months + ' month(s), ' + T.length + ' transactions' + (R && !R.historyOk ? ' — under 3 months, decision forced to REFER' : '') + (T.length < 20 ? ' — very few transactions' : ''), 'Regularity and trends need several months.');
    // CONSISTENCY
    const curs = Array.from(new Set(s.accounts.map((a) => a.currency)));
    const fx = T.filter((t) => t.currency !== (t.acct && t.acct.currency)).length;
    add('Consistency', 'Currency', curs.length > 1 ? 'warn' : 'pass', 'Account currency: ' + curs.join(', ') + (fx ? ' · ' + fx + ' foreign-currency card row(s), amounts already in account currency' : ''), 'Mixed currencies must not be added together.');
    const names = Array.from(new Set(s.accounts.map((a) => (a.holder || '').toUpperCase().replace(/\(.*?\)/g, '').trim()).filter((x) => x && x !== '—')));
    const people = names.map((n) => n.split(/\s*&\s*|\s+AND\s+/)[0].trim());
    const distinct = Array.from(new Set(people)).filter((p, i, arr) => !arr.some((q, j) => j !== i && (q.indexOf(p) >= 0 || p.indexOf(q) >= 0) && q.length > p.length));
    add('Consistency', 'All accounts belong to the same applicant', !names.length ? 'na' : (distinct.length > 1 ? 'warn' : 'pass'), !names.length ? 'No holder name printed' : (distinct.length > 1 ? 'Different holders: ' + names.join(' · ') : 'Holder: ' + names.join(' · ')), 'Someone else\'s statement would inflate income.');
    return out;
  }
  stageOverlay(T, flagged) {
    // a step is only green if its output is complete; otherwise it is "done with warnings" until the user fixes it
    const s = this.state; const st = (s.stages || []).map((x) => ({ ...x }));
    if (s.busy || !st.length) return { stages: st, warns: [] };
    const warns = [];
    const missAcc = s.accounts.filter((a) => this.acctMissing(a).length);
    const lowCp = T.filter((t) => t.flagged && t.cpConf < s.threshold).length;
    const lowCls = T.filter((t) => t.flagged && t.conf < s.threshold).length;
    const autoN = T.filter((t) => t.autoAccepted).length;
    const oc = s.orderCheck;
    const w = (i, msg, go) => { if (st[i] && st[i].st === 'done') { st[i].st = 'warn'; st[i].d = st[i].d + ' — ' + msg; } warns.push({ w: msg, go }); };
    if (oc && oc.soft && !oc.datesChecked) w(1, 'page order not verified (no page numbers, too few dated pages)');
    if (missAcc.length) w(2, missAcc.length + ' account(s) missing ' + Array.from(new Set([].concat(...missAcc.map((a) => this.acctMissing(a))))).join(', ') + ' — fill in the form on the Ingest page');
    if (lowCp) w(3, lowCp + ' high-impact counterparties unclear — fix in the Review queue');
    if (autoN && st[4] && st[4].st === 'done') st[4].d = st[4].d + ' · ' + autoN + ' low-impact rows auto-accepted';
    if (lowCls) w(4, lowCls + ' high-impact categories unsure — fix in the Review queue');
    const V = this.validations(T, this.score(T));
    V.filter((v) => v.st === 'fail').forEach((v) => warns.push({ w: 'Validation failed — ' + v.name + ': ' + v.detail }));
    const vw = V.filter((v) => v.st === 'warn' && !/Account details present|Page order/.test(v.name));
    if (vw.length) warns.push({ w: vw.length + ' data validation warning(s) — see Data validation on the Ingest page' });
    if (V.some((v) => v.st === 'fail') && st[2] && (st[2].st === 'done' || st[2].st === 'warn')) { st[2].st = 'warn'; if (st[2].d.indexOf('validation') < 0) st[2].d += ' — data validation failed'; }
    if (flagged.length || missAcc.length) { if (st[5] && st[5].st === 'done') { st[5].st = 'warn'; st[5].d = st[5].d + ' — provisional until the items above are fixed'; } }
    return { stages: st, warns };
  }
  logVals(T, R, flagged) {
    const s = this.state;
    const col = { done: '#1E7B45', running: '#B88A00', error: '#B42318', blocked: '#8A8F98', pending: '#8A8F98', waiting: '#B54708', warn: '#B54708' };
    const lab = { done: '✓ VERIFIED', running: 'IN PROGRESS', error: 'FAILED', blocked: 'BLOCKED', pending: 'PENDING', waiting: 'AWAITING REVIEWER', warn: '⚠ NEEDS ATTENTION' };
    const st = this.stageOverlay(T, flagged).stages;
    const g = (i, name) => st[i] ? { k: name, st: st[i].st, d: st[i].d } : { k: name, st: 'pending', d: 'Not started' };
    let review;
    if (!T.length) review = { k: 'Manual review', st: 'pending', d: 'Not started' };
    else if (flagged.length) review = { k: 'Manual review', st: 'waiting', d: flagged.length + ' transaction(s) below threshold awaiting a reviewer' };
    else review = { k: 'Manual review', st: 'done', d: 'Queue clear' + (Object.keys(s.overrides).length + Object.keys(s.cpOverrides).length ? ' · ' + (Object.keys(s.overrides).length + Object.keys(s.cpOverrides).length) + ' manual edit(s)' : '') };
    const steps = [g(0, 'Ingest & convert'), g(1, 'Validate page order'), g(2, 'Batch extraction'), g(3, 'Enrichment'), g(4, 'Classification'), review, g(5, 'Risk scoring'),
      R && !s.busy ? { k: 'Decision', st: flagged.length ? 'waiting' : 'done', d: R.decision + ' · ' + R.total + '/1000' + (flagged.length ? ' — provisional until review is complete' : '') } : { k: 'Decision', st: 'pending', d: 'Not started' }];
    let curIdx = steps.findIndex((x) => x.st === 'running' || x.st === 'error');
    if (curIdx < 0) curIdx = steps.findIndex((x) => x.st !== 'done');
    const doneN = steps.filter((x) => x.st === 'done').length;
    const cur = curIdx >= 0 ? steps[curIdx] : null;
    let curName = 'All steps verified', curDetail = 'Run complete — nothing pending', curSt = 'done';
    if (cur) { curName = cur.k; curDetail = (s.busy && s.current && cur.st === 'running') ? s.current.detail : cur.d; curSt = cur.st; }
    if (!st.length && !T.length) { curName = 'Waiting for a statement'; curDetail = 'Upload a file or run a sample on the Ingest tab'; curSt = 'pending'; }
    const levels = ['ALL', 'INFO', 'WARN', 'ERROR', 'USER'];
    const lvlCol = { INFO: '#3D5A99', WARN: '#B54708', ERROR: '#B42318', USER: '#6B3FC4' };
    const runs = []; s.log.forEach((e) => { if (/^Run started/.test(e.msg) && !runs.find((r) => r.id === e.run)) runs.push({ id: e.run, label: e.msg.replace('Run started for ', ''), day: e.day, ts: e.ts }); });
    const runOpts = [{ v: 'ALL', l: 'All runs (' + runs.length + ')' }].concat(runs.slice().reverse().map((r) => ({ v: String(r.id), l: 'Run #' + r.id + ' · ' + (r.day || '') + ' ' + (r.ts || '').slice(0, 5) + ' · ' + (r.label.length > 38 ? r.label.slice(0, 38) + '…' : r.label) })));
    const inRun = (e) => s.logRun === 'ALL' || String(e.run) === s.logRun;
    const entries = s.log.filter((e) => inRun(e) && (s.logLevel === 'ALL' || e.level === s.logLevel)).slice().reverse().map((e) => ({ ...e, runS: e.run ? '#' + e.run : '—', dayS: e.day || '', lvStyle: 'font-weight:600;font-size:11px;letter-spacing:.05em;color:' + (lvlCol[e.level] || '#16181D') }));
    return {
      steps: steps.map((x, i) => ({ ...x, ...this.infoFor('L' + ['conv', 'val', 'ext', 'enr', 'cls', 'review', 'score', 'decision'][i], x.k), info: this.stepInfo()[['conv', 'val', 'ext', 'enr', 'cls', 'review', 'score', 'decision'][i]], num: String(i + 1).padStart(2, '0'), stLabel: lab[x.st] || x.st.toUpperCase(), dot: 'width:12px;height:12px;border-radius:50%;flex-shrink:0;background:' + (col[x.st] || '#8A8F98') + (i === curIdx ? ';box-shadow:0 0 0 4px #F0DFB0' : ''), stStyle: 'font-size:11px;font-weight:600;letter-spacing:.05em;color:' + (col[x.st] || '#8A8F98'), rowStyle: i === curIdx ? 'background:#FFF8E6;border-color:#E6CD86' : 'background:#FFFFFF;border-color:#E4E1DA' })),
      curName, curDetail, curLabel: lab[curSt] || curSt.toUpperCase(), curStyle: 'font-size:12px;font-weight:700;letter-spacing:.06em;color:' + (col[curSt] || '#8A8F98'),
      curBar: 'height:8px;border-radius:4px;background:#1E7B45;width:' + Math.round(doneN / steps.length * 100) + '%', progS: doneN + ' of ' + steps.length + ' steps verified', isBusy: s.busy,
      sideStep: curName, sideStyle: 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + (col[curSt] || '#8A8F98'),
      entries, nEntries: entries.length, nLog: s.log.length, hasEntries: entries.length > 0, noEntries: entries.length === 0,
      levelBtns: levels.map((l) => ({ l, n: l === 'ALL' ? s.log.filter(inRun).length : s.log.filter((e) => inRun(e) && e.level === l).length, pressed: s.logLevel === l ? 'true' : 'false', go: () => this.setState({ logLevel: l }), style: s.logLevel === l ? 'background:#16181D;color:#FFFFFF;border-color:#16181D' : 'background:#FFFFFF;color:#16181D;border-color:#9EA2AA' })),
      runOpts, logRun: s.logRun, nRuns: runs.length, setRun: (e) => this.setState({ logRun: e.target.value }),
      clearLabel: s.confirmClear ? 'Confirm — delete all history' : 'Clear history', confirmClear: s.confirmClear,
      clearLog: () => { if (!this.state.confirmClear) { this.setState({ confirmClear: true }); return; } this._log = []; this.saveLog(); this.setState({ log: [], confirmClear: false, logRun: 'ALL' }); },
      cancelClear: () => this.setState({ confirmClear: false }), goIngest: () => this.setState({ tab: 'ingest' })
    };
  }

  renderVals() {
    const s = this.state;
    const T = this.buildTxns();
    const R = this.score(T);
    const tax = this.taxonomy();
    const flagged = T.filter((t) => t.flagged);
    const tabs = [['ingest', '01', 'Ingest'], ['txns', '02', 'Transactions'], ['review', '03', 'Review queue'], ['risk', '04', 'Risk summary'], ['log', '05', 'Activity log'], ['tax', '06', 'Taxonomy & rules']].map(([k, n, l]) => ({
      num: n, label: l, badge: k === 'review' && T.length ? String(flagged.length) : (k === 'log' && s.busy ? 'LIVE' : ''), active: s.tab === k, current: s.tab === k ? 'page' : 'false',
      style: s.tab === k ? 'background:#F3F2EE;color:#16181D' : 'background:transparent;color:#E6E8EC',
      numStyle: s.tab === k ? 'color:#1F4FD1' : 'color:#8F949D',
      go: () => { this.setState({ tab: k }); try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) {} }
    }));
    const stCol = { done: '#1E7B45', error: '#B42318', blocked: '#8A8F98', running: '#B88A00', pending: '#8A8F98', warn: '#B54708' };
    const ov = this.stageOverlay(T, flagged);
    const stages = ov.stages.map((x, i) => ({ ...x, ...this.infoFor('I' + ['conv', 'val', 'ext', 'enr', 'cls', 'score'][i], x.k), info: this.stepInfo()[['conv', 'val', 'ext', 'enr', 'cls', 'score'][i]], num: String(i + 1).padStart(2, '0'), dot: 'width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + (stCol[x.st] || '#8A8F98'), stLabel: x.st === 'done' ? '✓ DONE' : (x.st === 'warn' ? '⚠ CHECK' : x.st.toUpperCase()), stStyle: 'font-size:11px;letter-spacing:.06em;font-weight:600;color:' + (stCol[x.st] || '#8A8F98'), liStyle: x.st === 'done' ? 'background:#F0F8F2' : x.st === 'warn' ? 'background:#FFF6EC' : (x.st === 'running' ? 'background:#FFF8E6' : (x.st === 'error' ? 'background:#FDF0EE' : 'background:transparent')) }));
    const pv = s.pages[s.previewPage] || null;
    const pageBtns = s.pages.map((p, i) => ({ n: p.index, go: () => this.setState({ previewPage: i }), style: i === s.previewPage ? 'background:#16181D;color:#fff;border-color:#16181D' : 'background:#fff;color:#16181D;border-color:#C9C6BE' }));
    const accts = s.accounts.map((a) => {
      const n = T.filter((t) => t.account === a.key).length;
      const miss = this.acctMissing(a);
      return { ...a, n, label: a.card ? 'Credit card' : a.type, num: a.key, pagesStr: a.pages.length ? Array.from(new Set(a.pages)).join(', ') : '—', ob: a.opening !== undefined && a.opening !== null ? this.fmt(a.opening) : '—', hasMiss: miss.length > 0, missS: 'Missing: ' + miss.join(', '), hasManual: !!(a.manual && a.manual.length), manualS: 'Entered manually: ' + (a.manual || []).join(', ') };
    });
    const anyMissing = !s.busy && s.accounts.some((a) => this.acctMissing(a).length);
    const acctFormOn = !s.busy && s.accounts.length > 0 && ((anyMissing && !s.acctSkipped) || !!s.showAcctForm);
    const draft = s.acctDraft || {};
    const setF = (key, f) => (e) => { const v = e.target.value; const cur = this.state.acctDraft || {}; this.setState({ acctDraft: { ...cur, [key]: { ...(cur[key] || {}), [f]: v } } }); };
    const typeOpts = ['Savings', 'Savings - Individual', 'Savings - Joint', 'Current', 'Overdraft / CC', 'Credit Card'];
    const acctForms = s.accounts.map((a, i) => {
      const d0 = draft[a.key] || {}; const miss = this.acctMissing(a);
      const fv = (f, cur) => (d0[f] !== undefined ? d0[f] : cur);
      const fld = (f, label, cur, ph, req) => ({ id: 'af' + i + f, label: label + (req ? ' — missing' : ''), labelStyle: 'font-size:11px;font-weight:600;letter-spacing:.05em;color:' + (req ? '#B54708' : '#4A4F58'), val: fv(f, cur), set: setF(a.key, f), ph, inStyle: 'width:100%;box-sizing:border-box;min-height:44px;padding:8px 10px;border:1px solid ' + (req ? '#D9A06B' : '#9EA2AA') + ';border-radius:4px;background:' + (req ? '#FFF9F2' : '#FFFFFF') + ';font-size:13.5px;color:#16181D' });
      return { key: a.key, title: (a.card ? 'Credit card' : a.type) + ' · ' + T.filter((t) => t.account === a.key).length + ' txns · pages ' + Array.from(new Set(a.pages)).join(', '), missS: miss.length ? 'Missing: ' + miss.join(', ') : 'All key details present — edit if needed',
        missStyle: 'font-size:12px;font-weight:600;color:' + (miss.length ? '#B54708' : '#1E7B45'),
        fields: [fld('number', 'Account / card number', /^UNKNOWN-/.test(a.key) ? '' : a.key, 'e.g. 50100234567812', miss.indexOf('account number') >= 0), fld('holder', 'Account holder', a.holder === '—' ? '' : a.holder, 'e.g. ROHAN MEHTA', miss.indexOf('account holder') >= 0), fld('bank', 'Bank', a.bank === 'Unknown bank' ? '' : a.bank, 'e.g. HDFC Bank', miss.indexOf('bank') >= 0), fld('currency', 'Currency', a.currency, 'INR', false), fld('opening', 'Opening balance', a.opening === undefined || a.opening === null ? '' : String(a.opening), 'e.g. 84,250.00', miss.indexOf('opening balance') >= 0)],
        typeId: 'aft' + i, typeVal: fv('type', a.type), setType: setF(a.key, 'type'), typeOpts: Array.from(new Set([a.type].concat(typeOpts))).map((v) => ({ v })) };
    });

    // transactions view
    const monthsAll = Array.from(new Set(T.map((t) => t.month))).sort();
    const acctOpts = [{ v: 'ALL', l: 'All accounts' }].concat(s.accounts.map((a) => ({ v: a.key, l: (a.card ? 'Card …' : 'A/c …') + a.last4 })));
    const monthOpts = [{ v: 'ALL', l: 'All months' }].concat(monthsAll.map((m) => ({ v: m, l: this.monthLabel(m) })));
    const view = T.filter((t) => (s.fAcct === 'ALL' || t.account === s.fAcct) && (s.fMonth === 'ALL' || t.month === s.fMonth) && (!s.fFlag || t.flagged));
    const confColor = (c) => c >= 0.9 ? '#1F4FD1' : c >= s.threshold ? '#3D5A99' : '#B54708';
    const rows = view.map((t) => ({
      ...t, d: this.dispDate(t.date), vd: this.dispDate(t.vdate), dr: t.dr ? this.fmt(t.dr) : '', cr: t.cr ? this.fmt(t.cr) : '', balS: this.fmt(t.bal),
      methodS: t.autoAccepted ? t.method + ' · auto' : t.method, confS: Math.round(t.conf * 100) + '%', confStyle: 'font-weight:600;color:' + confColor(t.conf), cpStyle: t.cpConf < s.threshold ? 'color:#B54708;font-weight:600' : 'color:#16181D;font-weight:500',
      attrS: t.attrs.map((a) => a.k + ': ' + a.v).concat(t.cpFmt ? ['Format: ' + t.cpFmt] : []).join(' · '), rowStyle: t.flagged ? 'background:#FFF6EC' : 'background:#FFFFFF',
      l1Style: t.l1 === 'CREDIT' ? 'color:#1F4FD1;font-weight:600' : 'color:#16181D;font-weight:600', monthS: this.monthLabel(t.month)
    }));
    const avgConf = T.length ? T.reduce((a, t) => a + t.conf, 0) / T.length : 0;
    const methodCount = (m) => T.filter((t) => t.method === m).length;

    // review
    const optsFor = (l1) => Array.from(new Set(tax.filter((x) => x.l1 === l1).map((x) => x.code)));
    const crOpts = optsFor('CREDIT').map((v) => ({ v })); const drOpts = optsFor('DEBIT').map((v) => ({ v }));
    const reviewRows = flagged.map((t) => ({
      ...t, d: this.dispDate(t.date), amtS: (t.l1 === 'CREDIT' ? '+ ' : '− ') + this.fmt(t.amount), reasonS: t.reasons.join(' · '), opts: t.l1 === 'CREDIT' ? crOpts : drOpts,
      onCat: (e) => { const v = e.target.value; this.log('USER', 'Manual review', 'Category of "' + t.narr + '" set to ' + v + ' (was ' + t.l2 + ')'); this.setState({ overrides: { ...this.state.overrides, [t.id]: v } }); },
      onCp: (e) => { const v = e.target.value; this.log('USER', 'Manual review', 'Counterparty of "' + t.narr + '" set to ' + v); this.setState({ cpOverrides: { ...this.state.cpOverrides, [t.id]: v } }); },
      accept: () => { this.log('USER', 'Manual review', 'Confirmed "' + t.narr + '" as ' + t.l2 + ' / ' + t.cp); this.setState({ overrides: { ...this.state.overrides, [t.id]: t.l2 }, cpOverrides: t.cpConf < this.state.threshold ? { ...this.state.cpOverrides, [t.id]: t.cp } : this.state.cpOverrides }); },
      confS: Math.round(t.conf * 100) + '%',
      ruleMatch: (s.ruleDraft[t.id] !== undefined ? s.ruleDraft[t.id] : this.suggestMatch(t)), ruleId: 'rm' + t.id, ruleLabel: 'Text to match for a rule on ' + t.narr,
      onRuleMatch: (e) => { const v = e.target.value; this.setState({ ruleDraft: { ...this.state.ruleDraft, [t.id]: v } }); },
      saveRule: () => { const match = this.state.ruleDraft[t.id] !== undefined ? this.state.ruleDraft[t.id] : this.suggestMatch(t); const cp = this.state.cpOverrides[t.id] || t.cp; const cat = this.state.overrides[t.id] || ''; const err = this.addCpRule({ match, cp, cat }); if (err) this.setState({ cpRuleMsg: err }); },
      cpLabel: 'Counterparty for ' + t.narr, catLabel: 'Category for ' + t.narr
    }));
    const manualCount = Object.keys(s.overrides).length + Object.keys(s.cpOverrides).length;
    const gmap = {};
    flagged.forEach((t) => { const k = t.l1 + '|' + (t.cpKey && t.cpKey !== 'UNIDENTIFIED' ? t.cpKey : t.narr.replace(/\d+/g, '#')); (gmap[k] = gmap[k] || []).push(t); });
    const gd = s.groupDraft || {};
    const reviewGroups = Object.keys(gmap).map((k, gi) => {
      const rows = gmap[k]; const t0 = rows[0]; const ids = rows.map((x) => x.id);
      const total = rows.reduce((a, x) => a + x.amount, 0);
      const imp = Array.from(new Set([].concat(...rows.map((x) => x.impactList || []))));
      const cnt = {}; rows.forEach((x) => { cnt[x.l2] = (cnt[x.l2] || 0) + 1; });
      const sug = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
      const d = gd[k] || {};
      const cpVal = d.cp !== undefined ? d.cp : t0.cp; const catVal = d.cat !== undefined ? d.cat : sug;
      const months = Array.from(new Set(rows.map((x) => this.monthLabel(x.month))));
      const applyAll = (cp, cat, why) => {
        const ov = { ...this.state.overrides }; const cov = { ...this.state.cpOverrides };
        rows.forEach((x) => { ov[x.id] = cat; cov[x.id] = cp || x.cp; });
        this.log('USER', 'Manual review', why + ' — ' + rows.length + ' row(s) "' + (cp || t0.cp) + '" → ' + cat);
        this.setState({ overrides: ov, cpOverrides: cov });
      };
      return { key: k, n: rows.length, many: rows.length > 1, title: (cpVal || t0.cp) + ' · ' + t0.l1, sumS: (t0.l1 === 'CREDIT' ? '+ ' : '− ') + '₹' + this.fmt(total) + ' across ' + rows.length + ' row(s) · ' + months.join(', '),
        impS: imp.length ? 'Why it matters: ' + imp.join(' · ') : 'Why it matters: below confidence threshold',
        reasonS: Array.from(new Set([].concat(...rows.map((x) => x.reasons)))).join(' · '),
        samples: rows.slice(0, 3).map((x) => ({ line: this.dispDate(x.date) + ' · ' + x.accLabel + ' · ' + (x.l1 === 'CREDIT' ? '+' : '−') + this.fmt(x.amount) + ' · ' + x.narr })), more: rows.length > 3 ? '+ ' + (rows.length - 3) + ' more like this' : '', hasMore: rows.length > 3,
        cpVal, catVal, opts: t0.l1 === 'CREDIT' ? crOpts : drOpts, gid: 'g' + gi, l1: t0.l1,
        onCp: (e) => { const v = e.target.value; this.setState({ groupDraft: { ...(this.state.groupDraft || {}), [k]: { ...((this.state.groupDraft || {})[k] || {}), cp: v } } }); },
        onCat: (e) => { const v = e.target.value; this.setState({ groupDraft: { ...(this.state.groupDraft || {}), [k]: { ...((this.state.groupDraft || {})[k] || {}), cat: v } } }); },
        apply: () => applyAll(cpVal !== t0.cp ? cpVal : '', catVal, 'Group decision'),
        accept: () => applyAll('', catVal, 'Group confirmed as is'),
        ruleMatch: d.match !== undefined ? d.match : this.suggestMatch(t0),
        onMatch: (e) => { const v = e.target.value; this.setState({ groupDraft: { ...(this.state.groupDraft || {}), [k]: { ...((this.state.groupDraft || {})[k] || {}), match: v } } }); },
        saveRule: () => { const err = this.addCpRule({ match: d.match !== undefined ? d.match : this.suggestMatch(t0), cp: cpVal || t0.cp, cat: catVal }); if (err) this.setState({ cpRuleMsg: err }); },
        applyLabel: rows.length > 1 ? 'Apply to all ' + rows.length : 'Apply' };
    }).sort((a, b) => b.n - a.n);
    const autoN = T.filter((t) => t.autoAccepted).length;

    // risk
    let risk = null;
    if (R) {
      const bandCol = { Excellent: '#1F4FD1', Good: '#3D6FE0', Fair: '#B88A00', 'Below Average': '#C2620A', Poor: '#B42318' }[R.band];
      const decCol = { APPROVE: '#1F4FD1', 'APPROVE WITH CONDITIONS': '#8A6400', REFER: '#6B3FC4', DECLINE: '#B42318' }[R.decision];
      const maxBar = Math.max(1, ...R.income, ...R.exp.map((e, i) => e + 0));
      const metric = (k, v) => ({ k, v });
      const compDetail = {
        income: [metric('Avg monthly income', '₹' + this.fmt0(R.avgInc)), metric('Primary source share', this.pct(R.shareTop)), metric('Regularity (CV of primary)', (R.cv * 100).toFixed(1) + '%'), metric('Income sources', R.incomeCats.length + ' (' + R.incomeCats.join(', ') + ')'), metric('Growth first→last month', this.pct(R.growth))],
        debt: [metric('EMI obligations identified', R.loanList.length + ''), metric('Monthly EMI outflow', '₹' + this.fmt0(R.monthlyEmi)), metric('FOIR', this.pct(R.foir)), metric('EMI bounce rate', this.pct(R.bounceRate) + ' (' + R.bounced + '/' + R.presented + ')'), metric('On-time payment rate', this.pct(R.ontimeRate))],
        liq: [metric('Average EOD balance', '₹' + this.fmt0(R.avgEod)), metric('Minimum EOD balance', '₹' + this.fmt0(R.minEod)), metric('Negative-balance days', R.negDays + ' of ' + R.eodDays), metric('Avg EOD ÷ monthly income', (R.avgInc ? R.avgEod / R.avgInc : 0).toFixed(2) + '×')],
        bank: [metric('Payment bounces', R.bounced + ''), metric('Bounce charges', R.bounceCharges.length + ' (₹' + this.fmt0(R.bounceCharges.reduce((a, t) => a + t.amount, 0)) + ')'), metric('Penalty fees', R.penalties.length + ' (₹' + this.fmt0(R.penalties.reduce((a, t) => a + t.amount, 0)) + ')'), metric('All fees & charges', '₹' + this.fmt(R.chargeAmt)), metric('Overdraft usage', R.negDays ? R.negDays + ' day(s)' : 'None')],
        fraud: [metric('Balance arithmetic', R.integrity.length ? R.integrity.length + ' mismatch(es)' : 'Intact on ' + T.length + ' rows'), metric('Circular transactions', R.circular.length + ''), metric('Overnight pass-through', R.overnight.length + ''), metric('Structuring patterns', R.structuring.length ? R.structuring[0].count + ' cash deposits ₹40–50k in 30 days' : 'None')],
        exp: [metric('Essential vs discretionary', this.pct(1 - R.discShare) + ' / ' + this.pct(R.discShare)), metric('Fixed vs variable', this.pct(R.fixedShare) + ' / ' + this.pct(1 - R.fixedShare)), metric('Spend trend first→last month', this.pct(R.expTrend)), metric('Savings rate after EMI', this.pct(R.savingsRate))]
      };
      const comps = R.comps.map((c) => ({ ...c, sS: Math.round(c.s), wS: Math.round(c.w * 100) + '%', pts: Math.round(c.s * c.w * 10), barStyle: 'height:6px;border-radius:3px;width:' + Math.round(c.s) + '%;background:' + (c.s >= 75 ? '#1F4FD1' : c.s >= 55 ? '#B88A00' : '#B42318'), metrics: compDetail[c.key] }));
      const flags = [];
      R.integrity.forEach((x) => flags.push({ t: 'Balance mismatch', d: this.dispDate(x.t.date) + ' · expected ' + this.fmt(x.exp) + ', statement shows ' + this.fmt(x.t.bal) }));
      R.circular.forEach((x) => flags.push({ t: 'Circular transaction', d: x.a.cp + ': in ₹' + this.fmt0(x.a.amount) + ' on ' + this.dispDate(x.a.date) + ', out ₹' + this.fmt0(x.b.amount) + ' on ' + this.dispDate(x.b.date) }));
      R.overnight.forEach((x) => flags.push({ t: 'Overnight pass-through', d: '₹' + this.fmt0(x.a.amount) + ' in on ' + this.dispDate(x.a.date) + ', ₹' + this.fmt0(x.b.amount) + ' out by ' + this.dispDate(x.b.date) }));
      R.structuring.forEach((x) => flags.push({ t: 'Structuring', d: x.count + ' cash deposits totalling ₹' + this.fmt0(x.total) + ' between ' + this.dispDate(x.from) + ' and ' + this.dispDate(x.to) }));
      const monthsV = R.months.map((m, i) => ({
        m: this.monthLabel(m), inc: this.fmt0(R.income[i]), exp: this.fmt0(R.exp[i]), ess: this.fmt0(R.essM[i]), disc: this.fmt0(R.discM[i]),
        incBar: 'width:' + Math.round(R.income[i] / maxBar * 100) + '%;height:14px;background:#1F4FD1;border-radius:2px', expBar: 'width:' + Math.round(R.exp[i] / maxBar * 100) + '%;height:14px;background:#E08A3C;border-radius:2px'
      }));
      const incTable = R.incomeByCat.map((c) => ({ cat: c.cat, cells: c.vals.map((v) => ({ v: v ? this.fmt0(v) : '–' })) }));
      risk = {
        total: R.total, band: R.band, decision: R.decision, overrideNote: R.overridden ? 'Policy override — the score alone (' + R.band + ') would give ' + R.bandDecision : '', why: R.why.map((w) => ({ w })), comps, flags, hasFlags: flags.length > 0, monthsV, incTable, monthHeads: R.months.map((m) => ({ m: this.monthLabel(m) })),
        loans: R.loanList.map((l) => ({ ...l, mS: '₹' + this.fmt0(l.monthly), b: l.bounced ? l.bounced + ' bounce' : 'Clean', bStyle: l.bounced ? 'color:#B42318;font-weight:600' : 'color:#1F4FD1;font-weight:600' })), hasLoans: R.loanList.length > 0,
        marker: 'position:absolute;top:-6px;width:3px;height:30px;background:#16181D;left:' + (R.total / 10) + '%',
        bandStyle: 'font-size:15px;font-weight:600;color:' + bandCol, decStyle: 'display:inline-flex;padding:10px 16px;border-radius:4px;color:#FFFFFF;font-weight:700;letter-spacing:.04em;font-size:15px;background:' + decCol,
        customer: (s.accounts[0] && s.accounts[0].holder) || '—', period: R.months.length ? this.monthLabel(R.months[0]) + ' – ' + this.monthLabel(R.months[R.months.length - 1]) : '', nAcc: s.accounts.length, nTx: T.length
      };
    }
    const taxRows = tax.map((x) => ({ ...x, kwS: x.kw.join('; ') || '— (structural rule)', srcStyle: x.src === 'DEFAULT' ? 'color:#5A5F69' : 'color:#1F4FD1;font-weight:600' }));

    return {
      tabs, isLog: s.tab === 'log', isIngest: s.tab === 'ingest', isTx: s.tab === 'txns', isReview: s.tab === 'review', isRisk: s.tab === 'risk', isTax: s.tab === 'tax',
      busy: s.busy, hasError: !!s.error, error: s.error, hasStages: !!s.stages, stages, source: s.source || 'No file yet', hasData: T.length > 0, noData: T.length === 0,
      batches: s.batches, hasBatches: s.batches.length > 0, accts, hasPages: s.pages.length > 0, pageBtns, pvText: pv ? pv.text : '', pvN: pv ? pv.index : '',
      onFile: (e) => this.handleFiles(e.target.files),
      showJson: !!s.showJson, jsonText: s.showJson && T.length ? JSON.stringify(this.exportData(T, R), null, 2) : '', jsonBtn: s.showJson ? 'Hide JSON' : 'View JSON', jsonMsg: s.jsonMsg || '', hasJsonMsg: !!s.jsonMsg,
      toggleJson: () => this.setState({ showJson: !this.state.showJson, jsonMsg: '' }),
      downloadJson: () => {
        const data = JSON.stringify(this.exportData(this.buildTxns(), this.score(this.buildTxns())), null, 2);
        const name = 'ledgerlens_run' + ((this.state.runStatus && this.state.runStatus.run) || '') + '_' + new Date().toISOString().slice(0, 10) + '.json';
        try { const url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
          this.log('USER', 'Export', 'JSON downloaded: ' + name + ' (' + Math.round(data.length / 1024) + ' KB)'); this.setState({ jsonMsg: 'Download started: ' + name + '. If nothing downloads in this view, use View JSON and copy it, or open the canvas in full-window view.' });
        } catch (e) { this.setState({ showJson: true, jsonMsg: 'Download blocked here — the JSON is shown below to copy.' }); }
      },
      copyJson: async () => { const data = JSON.stringify(this.exportData(this.buildTxns(), this.score(this.buildTxns())), null, 2); try { await navigator.clipboard.writeText(data); this.setState({ jsonMsg: 'JSON copied to clipboard (' + Math.round(data.length / 1024) + ' KB).' }); } catch (e) { this.setState({ showJson: true, jsonMsg: 'Clipboard blocked here — select the text below and copy it.' }); } },
      ...(() => { const V = this.validationReport(T, R); const ic = { pass: '✓', warn: '!', fail: '✗', na: '–', pending: '•' }; const col = { pass: '#1E7B45', warn: '#B54708', fail: '#B42318', na: '#6B7079', pending: '#9EA2AA' }; const lb = { pass: 'PASS', warn: 'WARNING', fail: 'FAILED', na: 'N/A', pending: 'NOT RUN YET' };
        const groups = ['On upload', 'File', 'Structure', 'Integrity', 'Completeness', 'Consistency'].map((g) => ({ g, items: V.filter((v) => v.group === g).map((v, i) => ({ ...v, hasDetail: !!v.detail, hasWhy: !!v.why, icon: ic[v.st], lab: lb[v.st], badge: 'width:22px;height:22px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#FFFFFF;background:' + col[v.st], labStyle: 'font-size:11px;font-weight:700;letter-spacing:.05em;color:' + col[v.st] })) })).filter((g) => g.items.length);
        const c = (k) => V.filter((v) => v.st === k).length;
        const ranV = V.some((v) => v.st !== 'pending');
        return { hasVal: true, valRan: ranV, valNotRun: !ranV, valGroups: groups, valTotal: V.length, valPass: c('pass'), valWarn: c('warn'), valFail: c('fail'), valNa: c('na'), showVal: s.showVal !== false, valBtn: s.showVal !== false ? 'Hide' : 'Show', valExp: s.showVal !== false ? 'true' : 'false', toggleVal: () => this.setState({ showVal: this.state.showVal === false }) }; })(),
      showClsHelp: s.showClsHelp !== false, clsHelpBtn: s.showClsHelp !== false ? 'Hide' : 'Show', clsHelpExp: s.showClsHelp !== false ? 'true' : 'false', toggleClsHelp: () => this.setState({ showClsHelp: this.state.showClsHelp === false }),
      clsRuleN: T.filter((t) => t.method === 'RULE').length, clsLlmN: T.filter((t) => t.method === 'LLM').length, clsManN: T.filter((t) => t.method === 'MANUAL').length, clsOtherN: T.filter((t) => /^OTHER_/.test(t.l2)).length, clsLowN: T.filter((t) => t.flagged).length, clsAutoN: T.filter((t) => t.autoAccepted).length, clsThr: Math.round(s.threshold * 100) + '%',
      showAcctForm: acctFormOn, anyMissing, acctForms, hasAcctMsg: !!s.acctMsg, acctMsg: s.acctMsg,
      acctFormTitle: anyMissing ? 'Some account details could not be read — add them before scoring' : 'Edit account details',
      acctFormSub: anyMissing ? 'The statement did not show these fields (common for screenshots or cropped scans). Fill in what you know; the opening balance lets the balance check and liquidity score work. Leave a field blank to keep it as is.' : 'Correct anything the extractor read wrongly. Saving recalculates transactions, the review queue and the risk score.',
      saveAcct: () => this.applyAcctDetails(), editAcct: () => this.setState({ showAcctForm: true, acctMsg: '' }), closeAcct: () => { if (this.acctAnyMissing()) this.log('USER', 'Account details', 'Skipped entering missing account details'); this.setState({ showAcctForm: false, acctSkipped: true, acctDraft: {} }); }, canEditAcct: !s.busy && s.accounts.length > 0 && !acctFormOn,
      busyMsg: s.ocrMsg || 'Reading file and converting pages…',
      ocrSt: { idle: 'NOT LOADED', loading: 'LOADING', ready: 'READY', running: 'RUNNING', error: 'FAILED' }[s.ocrState.st], ocrLine: s.ocrState.msg, ocrDetail: s.ocrState.detail,
      ocrDot: 'width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + ({ idle: '#8A8F98', loading: '#B88A00', ready: '#1E7B45', running: '#B88A00', error: '#B42318' }[s.ocrState.st]) + (s.ocrState.st === 'loading' || s.ocrState.st === 'running' ? ';box-shadow:0 0 0 4px #F0DFB0' : ''),
      ocrStStyle: 'font-size:11px;font-weight:700;letter-spacing:.06em;color:' + ({ idle: '#4A4F58', loading: '#8A6400', ready: '#1E7B45', running: '#8A6400', error: '#B42318' }[s.ocrState.st]),
      ocrBox: 'border:1px solid ' + ({ idle: '#DAD8D2', loading: '#E6CD86', ready: '#9CCFAE', running: '#E6CD86', error: '#E3A59D' }[s.ocrState.st]) + ';background:' + ({ idle: '#FAFAF7', loading: '#FFF8E6', ready: '#EAF6EE', running: '#FFF8E6', error: '#FDF0EE' }[s.ocrState.st]),
      ocrHasBar: s.ocrState.st === 'running' || s.ocrState.st === 'loading', ocrBar: 'height:6px;border-radius:3px;background:#B88A00;width:' + (s.ocrState.st === 'running' ? (s.ocrState.pct || 0) : (s.ocrState.st === 'loading' ? 50 : 0)) + '%',
      ocrCanPreload: s.ocrState.st === 'idle' || s.ocrState.st === 'error', ocrPreloadLabel: s.ocrState.st === 'error' ? 'Retry loading' : 'Preload OCR engine',
      preloadOcr: () => { this.log('USER', 'OCR', 'OCR engine preload requested'); this.ocrEngine().catch(() => {}); },
      showFormats: s.showFormats, fmtExp: s.showFormats ? 'true' : 'false', fmtBtn: s.showFormats ? 'Hide' : 'Show', toggleFormats: () => this.setState({ showFormats: !this.state.showFormats }),
      textInfo: { ...this.infoFor('text', 'the converted text'), info: this.stepInfo().text },
      hasPw: !!s.needPw, pwName: s.needPw ? s.needPw.name : '', pwMsg: s.needPw ? s.needPw.msg : '', hasPwMsg: !!(s.needPw && s.needPw.msg),
      pwBorder: s.needPw && s.needPw.wrong ? 'border-color:#B42318' : 'border-color:#9EA2AA',
      pwText: s.pwText || '',
      onPwInput: (e) => { this._pwInput = e.target.value; this.setState({ pwText: e.target.value }); },
      onPwKey: (e) => { if (e.key === 'Enter') { if (e.preventDefault) e.preventDefault(); this.submitPassword(); } },
      onPwClick: () => { this.submitPassword(); },
      onPwSubmit: (e) => { if (e && e.preventDefault) e.preventDefault(); this.submitPassword(); },
      onPwCancel: () => this.cancelPassword(),
      runSample: () => this.runPipeline(this.genSample('flags'), 'sample_rohan_mehta_Q1-2025.pdf (12 pages, 3 accounts)'),
      runClean: () => this.runPipeline(this.genSample('clean'), 'sample_clean_salaried_Q1-2025.pdf (12 pages, 3 accounts)'),
      runJumbled: () => this.runPipeline(this.genSample('jumbled'), 'sample_jumbled_pages.pdf (pages 4 and 5 swapped)'),
      nTx: T.length, nAcc: s.accounts.length, nMonths: monthsAll.length, nFlag: flagged.length, avgConf: Math.round(avgConf * 100) + '%',
      nRule: methodCount('RULE'), nLlm: methodCount('LLM'), nManual: methodCount('MANUAL'),
      acctOpts, monthOpts, fAcct: s.fAcct, fMonth: s.fMonth, fFlag: s.fFlag, rows, nRows: rows.length,
      setAcct: (e) => this.setState({ fAcct: e.target.value }), setMonth: (e) => this.setState({ fMonth: e.target.value }), setFlag: (e) => this.setState({ fFlag: e.target.checked }),
      nRev: reviewRows.length, reviewRows, reviewGroups, nGroups: reviewGroups.length, autoN, hasAuto: autoN > 0, reviewMode: s.reviewMode,
      smartOn: s.reviewMode !== 'all', modeBtn: s.reviewMode !== 'all' ? 'Show all low-confidence rows' : 'Back to smart review',
      toggleMode: () => { const m2 = this.state.reviewMode === 'all' ? 'smart' : 'all'; this.log('USER', 'Settings', 'Review mode set to ' + (m2 === 'all' ? 'ALL low-confidence rows' : 'SMART (high-impact only)')); this.setState({ reviewMode: m2 }); },
      acceptAllLabel: s.confirmAcceptAll ? 'Confirm — accept all ' + reviewRows.length + ' as they are' : 'Accept all remaining as they are',
      acceptAll: () => { if (!this.state.confirmAcceptAll) { this.setState({ confirmAcceptAll: true }); return; } const ov = { ...this.state.overrides }; const cov = { ...this.state.cpOverrides }; flagged.forEach((t) => { ov[t.id] = t.l2; cov[t.id] = cov[t.id] || t.cp; }); this.log('USER', 'Manual review', 'Bulk-accepted ' + flagged.length + ' row(s) as suggested'); this.setState({ overrides: ov, cpOverrides: cov, confirmAcceptAll: false }); },
      cancelAcceptAll: () => this.setState({ confirmAcceptAll: false }), confirmAcceptAll: s.confirmAcceptAll,
      hasReview: reviewRows.length > 0, noReview: T.length > 0 && reviewRows.length === 0, manualCount,
      goReview: () => this.setState({ tab: 'review' }), goRisk: () => this.setState({ tab: 'risk' }), goTx: () => this.setState({ tab: 'txns' }),
      risk, hasRisk: !!risk,
      threshold: s.threshold, thrS: Math.round(s.threshold * 100) + '%', setThr: (e) => { const v = Number(e.target.value); this.log('USER', 'Settings', 'Review threshold changed to ' + v + '%'); this.setState({ threshold: v / 100 }); }, thrVal: Math.round(s.threshold * 100),
      cpRuleRows: (s.cpRules || []).map((r, i) => ({ ...r, catS: r.cat || '—', hits: s.raw.filter((x) => x.narr.toUpperCase().indexOf(r.match) >= 0).length, del: () => { const rules = this.state.cpRules.filter((x, j) => j !== i); this.saveCpRules(rules); this.log('USER', 'Counterparty rules', 'Rule removed: "' + r.match + '"'); this.setState({ cpRules: rules }); } })),
      hasCpRules: (s.cpRules || []).length > 0, noCpRules: !(s.cpRules || []).length, cpRuleMsg: s.cpRuleMsg, hasCpRuleMsg: !!s.cpRuleMsg,
      nr: s.newRule, setNrMatch: (e) => { const v = e.target.value; this.setState({ newRule: { ...this.state.newRule, match: v } }); }, setNrCp: (e) => { const v = e.target.value; this.setState({ newRule: { ...this.state.newRule, cp: v } }); }, setNrCat: (e) => { const v = e.target.value; this.setState({ newRule: { ...this.state.newRule, cat: v } }); },
      addNr: () => { const err = this.addCpRule(this.state.newRule); if (err) this.setState({ cpRuleMsg: err }); else this.setState({ newRule: { match: '', cp: '', cat: '' } }); },
      allCatOpts: [{ v: '', l: '— keep automatic —' }].concat(Array.from(new Set(tax.map((x) => x.code))).sort().map((v) => ({ v, l: v }))),
      nAliases: this.merchantAliases().length, nIfsc: Object.keys(this.ifscBanks()).length,
      taxRows, nTax: taxRows.length, nCustom: s.customRules.length, csvMsg: s.csvMsg, hasCsvMsg: !!s.csvMsg,
      onCsv: async (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; try { const r = this.parseCsv(await f.text()); this.log('USER', 'Taxonomy', 'Custom CSV loaded: ' + f.name + ' (' + r.length + ' rules) — classification re-ran'); this.setState({ customRules: r, csvMsg: 'Loaded ' + r.length + ' rule(s) from ' + f.name + '. Classification re-ran.' }); } catch (err) { this.log('ERROR', 'Taxonomy', 'CSV rejected: ' + err.message); this.setState({ csvMsg: 'CSV error: ' + err.message }); } },
      clearCsv: () => { this.log('USER', 'Taxonomy', 'Custom rules cleared'); this.setState({ customRules: [], csvMsg: 'Custom rules cleared — default taxonomy only.' }); },
      loadDemoCsv: () => { this.log('USER', 'Taxonomy', 'Demo CSV rules loaded (3 rules) — classification re-ran'); this.setState({ customRules: this.parseCsv('category,level1,group,keywords,expense_type,cost_type\nSUBSCRIPTION,DEBIT,discretionary,STREAMFLIX;CLOUDNOTE,discretionary,fixed\nCHILDCARE,DEBIT,essential,LITTLE STARS,essential,fixed\nFREELANCE_INCOME,CREDIT,income,STRIPE,,'), csvMsg: 'Loaded 3 demo rules: SUBSCRIPTION and CHILDCARE (new), FREELANCE_INCOME (new, takes Stripe payouts). Classification re-ran.' }); },
      ...this.logVals(T, R, flagged),
      ...this.runVals(ov.warns)
    };
  }
}
