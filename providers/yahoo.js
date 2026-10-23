// Yahoo Finance (unofficial, delayed ~15 min for NSE/BSE). Fine for a prototype;
// Yahoo can change or rate-limit this at any time. Swap to the zerodha provider for real-time.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
let auth = null;

async function getAuth(force) {
  if (auth && !force && Date.now() - auth.t < 60 * 60 * 1000) return auth;
  const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const cookies = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [];
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');
  const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
  const crumb = await cr.text();
  if (!cr.ok || !crumb || crumb.includes('<')) throw new Error('Yahoo auth (crumb) failed: HTTP ' + cr.status);
  auth = { cookie, crumb, t: Date.now() };
  return auth;
}

async function quoteBatch(symbols, retry = true) {
  const a = await getAuth(!retry);
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(symbols.join(',')) + '&crumb=' + encodeURIComponent(a.crumb);
  const r = await fetch(url, { headers: { 'User-Agent': UA, Cookie: a.cookie } });
  if ((r.status === 401 || r.status === 403) && retry) { auth = null; return quoteBatch(symbols, false); }
  if (!r.ok) throw new Error('Yahoo quote failed: HTTP ' + r.status);
  const j = await r.json();
  return (j.quoteResponse && j.quoteResponse.result) || [];
}

async function quote(symbols) {
  const out = [];
  for (let i = 0; i < symbols.length; i += 100) out.push(...(await quoteBatch(symbols.slice(i, i + 100))));
  return out;
}

async function intraday(symbol) {
  try {
    const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) + '?interval=5m&range=1d', { headers: { 'User-Agent': UA } });
    if (!r.ok) return [];
    const j = await r.json();
    const closes = j.chart.result[0].indicators.quote[0].close || [];
    return closes.filter((x) => Number.isFinite(x));
  } catch { return []; }
}

const INDICES = [
  { key: '^NSEI', name: 'NIFTY 50', exchange: 'NSE' },
  { key: '^NSEBANK', name: 'BANK NIFTY', exchange: 'NSE' },
  { key: '^BSESN', name: 'SENSEX', exchange: 'BSE' }
];

async function getIndices() {
  const [qs, series] = await Promise.all([quote(INDICES.map((i) => i.key)), Promise.all(INDICES.map((i) => intraday(i.key)))]);
  return INDICES.map((ix, n) => {
    const q = qs.find((x) => x.symbol === ix.key) || {};
    return {
      name: ix.name, exchange: ix.exchange,
      price: q.regularMarketPrice, change: q.regularMarketChange, pct: q.regularMarketChangePercent,
      open: q.regularMarketOpen, high: q.regularMarketDayHigh, low: q.regularMarketDayLow,
      series: series[n]
    };
  });
}

async function getQuotes(symbols) {
  const qs = await quote(symbols.map((s) => s + '.NS'));
  return qs.map((q) => ({
    symbol: q.symbol.replace(/\.NS$/, ''),
    price: q.regularMarketPrice,
    pct: q.regularMarketChangePercent,
    volume: q.regularMarketVolume
  }));
}

module.exports = { getIndices, getQuotes };
