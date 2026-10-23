// Index constituent lists from NSE Indices (official CSVs). Cached in memory for 24h and on disk in
// ./data so the app still works if niftyindices.com is slow. If the download is blocked, save the CSV
// manually as data/nifty.csv, data/midcap.csv or data/smallcap.csv.
const fs = require('fs');
const path = require('path');
const URLS = {
  nifty: 'https://www.niftyindices.com/IndexConstituent/ind_nifty50list.csv',
  midcap: 'https://www.niftyindices.com/IndexConstituent/ind_niftymidcap150list.csv',
  smallcap: 'https://www.niftyindices.com/IndexConstituent/ind_niftysmallcap250list.csv'
};
const DIR = path.join(__dirname, 'data');
const mem = {};

function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = []; let cur = '', q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}

function toList(text) {
  const rows = parseCsv(text);
  const head = rows[0].map((h) => h.toLowerCase());
  const iName = head.findIndex((h) => h.startsWith('company')), iInd = head.indexOf('industry'), iSym = head.indexOf('symbol');
  if (iSym < 0) throw new Error('Unexpected constituents CSV format');
  return rows.slice(1).filter((r) => r[iSym]).map((r) => ({ symbol: r[iSym], name: r[iName] || r[iSym], sector: iInd >= 0 ? r[iInd] : '' }));
}

async function get(key) {
  const m = mem[key];
  if (m && Date.now() - m.t < 24 * 3600 * 1000) return m.list;
  const file = path.join(DIR, key + '.csv');
  try {
    const r = await fetch(URLS[key], { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/csv,*/*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text();
    const list = toList(text);
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(file, text);
    mem[key] = { list, t: Date.now() };
    return list;
  } catch (e) {
    if (fs.existsSync(file)) { const list = toList(fs.readFileSync(file, 'utf8')); mem[key] = { list, t: Date.now() }; return list; }
    throw new Error(`Could not load ${key} constituents (${e.message}). Download ${URLS[key]} and save it as data/${key}.csv`);
  }
}

module.exports = { get, parseCsv };
