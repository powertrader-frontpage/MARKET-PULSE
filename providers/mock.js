// Offline provider with made-up data, for developing the UI without any network or keys.
const SECTORS = ['Auto', 'Pharma', 'IT', 'Banking', 'Metals', 'FMCG', 'Energy', 'Infra'];
const SIZES = { nifty: 50, midcap: 150, smallcap: 250 };
const history = { 'NIFTY 50': [], 'BANK NIFTY': [], SENSEX: [] };

function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

function universe(key) {
  return Array.from({ length: SIZES[key] }, (_, i) => ({ symbol: `${key.toUpperCase()}${i + 1}`, name: `Mock ${key} Co ${i + 1}`, sector: SECTORS[i % SECTORS.length] }));
}

async function getIndices() {
  const t = Date.now() / 1000;
  const base = [['NIFTY 50', 'NSE', 24800], ['BANK NIFTY', 'NSE', 53200], ['SENSEX', 'BSE', 81200]];
  return base.map(([name, exchange, b], n) => {
    const price = b + Math.sin(t / 40 + n) * b * 0.006;
    const h = history[name]; h.push(price); if (h.length > 60) h.shift();
    const change = price - b;
    return { name, exchange, price, change, pct: (change / b) * 100, open: b, high: Math.max(...h), low: Math.min(...h), series: [...h] };
  });
}

async function getQuotes(symbols) {
  const t = Date.now() / 60000;
  return symbols.map((s) => {
    const h = hash(s);
    const pct = ((h % 1000) / 1000) * 8 - 2 + Math.sin(t + h) * 0.5;
    return { symbol: s, price: 100 + (h % 4000) + Math.sin(t + h), pct, volume: h % 100000 };
  });
}

async function news(name) {
  return { headline: `Sample headline about ${name}`, source: 'Mock Wire', link: 'https://example.com', publishedAt: new Date().toISOString(), tag: 'News' };
}

module.exports = { getIndices, getQuotes, universe, news };
