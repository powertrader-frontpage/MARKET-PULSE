// Market Pulse backend: zero dependencies, Node 18+.
// Run: npm start   (DATA_PROVIDER=yahoo by default; mock | yahoo | zerodha)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getNews } = require('./news');
const constituents = require('./constituents');

const PORT = Number(process.env.PORT) || 3000;
const PROVIDERS = ['yahoo', 'zerodha', 'fyers', 'mock'];
const providerName = (process.env.DATA_PROVIDER || 'yahoo').toLowerCase();
if (!PROVIDERS.includes(providerName)) {
  console.error(`DATA_PROVIDER must be one of: ${PROVIDERS.join(', ')}`);
  process.exit(1);
}
const provider = require('./providers/' + providerName);
const INDEX_TTL = (Number(process.env.INDEX_TTL_SEC) || 5) * 1000;
const MOVERS_TTL = (Number(process.env.MOVERS_TTL_SEC) || 30) * 1000;
const NEWS_TTL = 10 * 60 * 1000;

// Small cache: dedupes concurrent calls and serves stale data if a refresh fails.
const cache = new Map();
function cached(key, ttl, fn) {
  const e = cache.get(key) || {};
  const now = Date.now();
  if (e.v !== undefined && now - e.t < ttl) return Promise.resolve(e.v);
  if (e.p) return e.p;
  e.p = fn().then(
    (v) => { e.v = v; e.t = Date.now(); e.p = null; return v; },
    (err) => { e.p = null; if (e.v !== undefined) return e.v; throw err; }
  );
  cache.set(key, e);
  return e.p;
}

const INDEX_KEYS = ['nifty', 'midcap', 'smallcap'];

async function universe(key) {
  if (provider.universe) return provider.universe(key);
  return constituents.get(key);
}

async function movers(key) {
  const uni = await universe(key);
  const bySym = new Map(uni.map((u) => [u.symbol, u]));
  const quotes = (await provider.getQuotes(uni.map((u) => u.symbol)))
    .filter((q) => Number.isFinite(q.pct) && Number.isFinite(q.price));
  quotes.sort((a, b) => b.pct - a.pct);
  const top = quotes.slice(0, 10);
  const newsFn = provider.news || getNews;
  const rows = await Promise.all(top.map(async (q, i) => {
    const u = bySym.get(q.symbol) || { name: q.symbol, sector: '' };
    const news = await cached('news:' + q.symbol, NEWS_TTL, () => newsFn(u.name)).catch(() => null);
    return { rank: i + 1, symbol: q.symbol, name: u.name, sector: u.sector, price: q.price, pct: q.pct, news };
  }));
  return { updatedAt: new Date().toISOString(), scanned: quotes.length, rows };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const PUBLIC = path.join(__dirname, 'public');

function sendJson(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    // Optional password for the whole site: set DASH_PASSWORD (any username works).
    if (process.env.DASH_PASSWORD) {
      const given = Buffer.from((req.headers.authorization || '').replace(/^Basic /, ''), 'base64').toString().split(':').slice(1).join(':');
      if (given !== process.env.DASH_PASSWORD) {
        res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Market Pulse"' });
        return res.end('Password required');
      }
    }
    if (provider.handle && (await provider.handle(req, res, url))) return;
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, provider: providerName });
    if (url.pathname === '/api/indices') {
      return sendJson(res, 200, { updatedAt: new Date().toISOString(), indices: await cached('indices', INDEX_TTL, () => provider.getIndices()) });
    }
    const m = url.pathname.match(/^\/api\/movers\/(\w+)$/);
    if (m) {
      if (!INDEX_KEYS.includes(m[1])) return sendJson(res, 404, { error: 'Unknown index' });
      return sendJson(res, 200, await cached('movers:' + m[1], MOVERS_TTL, () => movers(m[1])));
    }
    // static files
    let rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (err) {
    console.error(err.message);
    sendJson(res, 502, { error: err.message });
  }
});

server.listen(PORT, () => console.log(`Market Pulse on http://localhost:${PORT} (provider: ${providerName})`));
