// Latest headline per company from Google News RSS. A headline is a hint at why a stock moved,
// not proof; the UI labels it as "latest headline" and links to the source.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const TAGS = [
  [/\b(q[1-4]|results?|profit|earnings|revenue|net income|margin)\b/i, 'Results'],
  [/\b(order|orders|contract|bags|wins?|awarded|deal worth)\b/i, 'Order / deal'],
  [/\b(upgrade|downgrade|target price|buy rating|initiates|brokerage)\b/i, 'Analyst call'],
  [/\b(block deal|bulk deal|stake|promoter|open offer)\b/i, 'Stake / deal'],
  [/\b(approval|usfda|clearance|clears|nod)\b/i, 'Approval'],
  [/\b(dividend|bonus|split|buyback)\b/i, 'Corporate action'],
  [/\b(upper circuit|52-week high|record high|rally|surge)\b/i, 'Price action']
];

function classify(headline) {
  for (const [re, tag] of TAGS) if (re.test(headline)) return tag;
  return 'News';
}

function decode(s) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function tagText(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]).trim() : '';
}

async function getNews(companyName) {
  const clean = companyName.replace(/\b(limited|ltd\.?)\b/gi, '').trim();
  const q = encodeURIComponent(`${clean} share when:2d`);
  const r = await fetch(`https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`, { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const xml = await r.text();
  const item = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!item) return null;
  let headline = tagText(item[1], 'title');
  let source = tagText(item[1], 'source');
  const cut = headline.lastIndexOf(' - ');
  if (cut > 0) { source = source || headline.slice(cut + 3); headline = headline.slice(0, cut); }
  const link = tagText(item[1], 'link');
  const pub = tagText(item[1], 'pubDate');
  return { headline, source, link, publishedAt: pub ? new Date(pub).toISOString() : null, tag: classify(headline) };
}

module.exports = { getNews, classify };
