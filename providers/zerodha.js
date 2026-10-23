// Zerodha Kite Connect provider (real-time). Needs the paid "Connect" plan for market data.
// Set KITE_API_KEY and KITE_ACCESS_TOKEN (the access token expires every day; see README).
// This uses the REST /quote endpoint, which is polled by the server cache. A later upgrade is the
// KiteTicker WebSocket for tick-by-tick streaming.
const API = 'https://api.kite.trade';

function headers() {
  const key = process.env.KITE_API_KEY, tok = process.env.KITE_ACCESS_TOKEN;
  if (!key || !tok) throw new Error('Set KITE_API_KEY and KITE_ACCESS_TOKEN to use the zerodha provider');
  return { 'X-Kite-Version': '3', Authorization: `token ${key}:${tok}` };
}

async function quote(instruments) {
  const data = {};
  for (let i = 0; i < instruments.length; i += 400) {
    const qs = instruments.slice(i, i + 400).map((s) => 'i=' + encodeURIComponent(s)).join('&');
    const r = await fetch(`${API}/quote?${qs}`, { headers: headers() });
    const j = await r.json();
    if (!r.ok || j.status === 'error') throw new Error('Kite quote failed: ' + (j.message || r.status));
    Object.assign(data, j.data);
  }
  return data;
}

const INDICES = [
  { key: 'NSE:NIFTY 50', name: 'NIFTY 50', exchange: 'NSE' },
  { key: 'NSE:NIFTY BANK', name: 'BANK NIFTY', exchange: 'NSE' },
  { key: 'BSE:SENSEX', name: 'SENSEX', exchange: 'BSE' }
];

async function getIndices() {
  const d = await quote(INDICES.map((i) => i.key));
  return INDICES.map((ix) => {
    const q = d[ix.key] || {};
    const o = q.ohlc || {};
    const change = q.last_price - o.close;
    return {
      name: ix.name, exchange: ix.exchange,
      price: q.last_price, change, pct: (change / o.close) * 100,
      open: o.open, high: o.high, low: o.low,
      series: [] // TODO: fill from the historical API (5minute candles) for the sparkline
    };
  });
}

async function getQuotes(symbols) {
  const d = await quote(symbols.map((s) => 'NSE:' + s));
  return Object.entries(d).map(([k, q]) => {
    const close = q.ohlc && q.ohlc.close;
    return { symbol: k.replace(/^NSE:/, ''), price: q.last_price, pct: close ? ((q.last_price - close) / close) * 100 : NaN, volume: q.volume };
  });
}

module.exports = { getIndices, getQuotes };
