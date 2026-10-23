// Fyers API v3 provider (official, real-time). Needs a Fyers app: https://myapi.fyers.in
// Env vars: FYERS_APP_ID (like ABCD1234EF-100), FYERS_SECRET, FYERS_REDIRECT_URI
// (must exactly match the redirect URL in your Fyers app, e.g. https://your-app.onrender.com/fyers/callback).
// The access token expires daily: open /fyers/login once each morning.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://api-t1.fyers.in';
const TOKEN_FILE = path.join(__dirname, '..', 'data', 'fyers-token.json');
const TOKEN_MAX_AGE = 20 * 3600 * 1000;
let token = process.env.FYERS_ACCESS_TOKEN || null;
let tokenAt = token ? Date.now() : 0;
const states = new Set();

try {
  const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  if (!token && saved.token && Date.now() - saved.savedAt < TOKEN_MAX_AGE) { token = saved.token; tokenAt = saved.savedAt; }
} catch { /* no saved token */ }

function cfg() {
  const { FYERS_APP_ID: id, FYERS_SECRET: secret, FYERS_REDIRECT_URI: redirect } = process.env;
  if (!id || !secret || !redirect) throw new Error('Set FYERS_APP_ID, FYERS_SECRET and FYERS_REDIRECT_URI');
  return { id, secret, redirect };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function gate() { // keeps well under Fyers' per-second request limit
  const wait = Math.max(0, last + 150 - Date.now());
  last = Date.now() + wait;
  if (wait) await sleep(wait);
}

function authHeader() {
  const { id } = cfg();
  if (!token || Date.now() - tokenAt > TOKEN_MAX_AGE) throw new Error('Fyers login needed: open /fyers/login (once per day)');
  return { Authorization: `${id}:${token}` };
}

async function get(pathAndQuery) {
  await gate();
  const r = await fetch(API + pathAndQuery, { headers: authHeader() });
  const j = await r.json().catch(() => ({}));
  if (j.s !== 'ok') {
    const msg = j.message || 'HTTP ' + r.status;
    if (j.code === -16 || j.code === -15 || /token|authenticat/i.test(msg)) { token = null; throw new Error('Fyers login expired: open /fyers/login'); }
    throw new Error('Fyers: ' + msg);
  }
  return j;
}

async function quotes(symbols) {
  const out = [];
  for (let i = 0; i < symbols.length; i += 50) {
    const j = await get('/data/quotes?symbols=' + encodeURIComponent(symbols.slice(i, i + 50).join(',')));
    for (const d of j.d || []) if (d.s === 'ok' && d.v) out.push({ name: d.n, v: d.v });
  }
  return out;
}

const INDICES = [
  { key: 'NSE:NIFTY50-INDEX', name: 'NIFTY 50', exchange: 'NSE' },
  { key: 'NSE:NIFTYBANK-INDEX', name: 'BANK NIFTY', exchange: 'NSE' },
  { key: 'BSE:SENSEX-INDEX', name: 'SENSEX', exchange: 'BSE' }
];

function istDate() { return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10); }

async function intraday(symbol) {
  try {
    const d = istDate();
    const j = await get(`/data/history?symbol=${encodeURIComponent(symbol)}&resolution=5&date_format=1&range_from=${d}&range_to=${d}&cont_flag=1`);
    return (j.candles || []).map((c) => c[4]).filter(Number.isFinite);
  } catch { return []; }
}

async function getIndices() {
  const [qs, series] = await Promise.all([quotes(INDICES.map((i) => i.key)), Promise.all(INDICES.map((i) => intraday(i.key)))]);
  return INDICES.map((ix, n) => {
    const q = (qs.find((x) => x.name === ix.key) || {}).v || {};
    return { name: ix.name, exchange: ix.exchange, price: q.lp, change: q.ch, pct: q.chp, open: q.open_price, high: q.high_price, low: q.low_price, series: series[n] };
  });
}

async function getQuotes(symbols) {
  const qs = await quotes(symbols.map((s) => `NSE:${s}-EQ`));
  return qs.map(({ name, v }) => ({ symbol: name.replace(/^NSE:/, '').replace(/-EQ$/, ''), price: v.lp, pct: v.chp, volume: v.volume }));
}

// /fyers/login -> Fyers sign-in -> /fyers/callback exchanges the code for today's access token.
async function handle(req, res, url) {
  if (url.pathname === '/fyers/login') {
    const { id, redirect } = cfg();
    const state = crypto.randomBytes(12).toString('hex');
    states.add(state);
    const q = new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: 'code', state });
    res.writeHead(302, { Location: `${API}/api/v3/generate-authcode?${q}` });
    res.end();
    return true;
  }
  if (url.pathname === '/fyers/callback') {
    const page = (msg) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;background:#0E1116;color:#E6EDF3;padding:32px"><p>${msg}</p><p><a style="color:#7AB8FF" href="/">Open dashboard</a></p>`); return true; };
    const state = url.searchParams.get('state'), code = url.searchParams.get('auth_code');
    if (!code || !states.delete(state)) return page('Login failed or expired. Open /fyers/login to try again.');
    try {
      const { id, secret } = cfg();
      const appIdHash = crypto.createHash('sha256').update(`${id}:${secret}`).digest('hex');
      const r = await fetch(`${API}/api/v3/validate-authcode`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', appIdHash, code }) });
      const j = await r.json();
      if (j.s !== 'ok' || !j.access_token) return page('Fyers rejected the login: ' + String(j.message || 'unknown error').replace(/[<>&]/g, ''));
      token = j.access_token; tokenAt = Date.now();
      try { fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true }); fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token, savedAt: tokenAt })); } catch { /* read-only disk is fine */ }
      return page('Fyers connected for today.');
    } catch (e) { return page('Login error: ' + String(e.message).replace(/[<>&]/g, '')); }
  }
  return false;
}

module.exports = { getIndices, getQuotes, handle };
