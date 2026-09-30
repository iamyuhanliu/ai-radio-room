import { XMLParser } from 'fast-xml-parser';
import { FEEDS, PAGES, HN, GITHUB, WINDOW_HOURS, X_ACCOUNTS, X_MIN_LIKES } from './sources.js';

const UA = 'ai-radio-room/1.0 (+https://github.com)';
const since = () => Date.now() - WINDOW_HOURS * 3600e3;

async function get(url, { json = false, headers = {} } = {}) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return json ? res.json() : res.text();
}

const strip = s => String(s ?? '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim();
const text = v => (v && typeof v === 'object') ? (v['#text'] ?? '') : (v ?? '');
const arr = v => Array.isArray(v) ? v : v ? [v] : [];

/* ---------- RSS / Atom ---------- */
const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
export async function fetchFeed(feed) {
  const doc = xml.parse(await get(feed.url));
  const rssItems = arr(doc?.rss?.channel?.item);
  const atomItems = arr(doc?.feed?.entry);
  const rdfItems = arr(doc?.['rdf:RDF']?.item);
  const out = [];
  for (const it of [...rssItems, ...rdfItems]) {
    const date = Date.parse(text(it.pubDate) || text(it['dc:date']) || '');
    out.push({ title: strip(text(it.title)), url: text(it.link) || text(it.guid), publishedAt: date, snippet: strip(text(it.description) || text(it['content:encoded'])).slice(0, 400) });
  }
  for (const it of atomItems) {
    const links = arr(it.link);
    const link = links.find(l => !l['@_rel'] || l['@_rel'] === 'alternate') || links[0];
    const date = Date.parse(text(it.published) || text(it.updated) || '');
    out.push({ title: strip(text(it.title)), url: link?.['@_href'] ?? text(link), publishedAt: date, snippet: strip(text(it.summary) || text(it.content)).slice(0, 400) });
  }
  return out
    .filter(i => i.title && i.url && (!i.publishedAt || i.publishedAt >= since()))
    .map(i => ({ ...i, source: feed.name, kind: feed.kind, signals: {} }));
}

/* ---------- Official pages without RSS ---------- */
export async function fetchPage(page, isFirstRun) {
  const html = await get(page.url);
  const paths = [...new Set([...html.matchAll(page.linkPattern)].map(m => m[1]))];
  const take = isFirstRun ? 3 : 12;
  return paths.slice(0, take).map(p => {
    const slug = p.split('/').pop();
    return {
      title: slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      url: page.base + p, publishedAt: null, snippet: '', source: page.name, kind: page.kind, signals: {},
    };
  });
}

/* ---------- Hacker News (Algolia API) ---------- */
const kwRe = new RegExp(`\\b(${HN.keywords.map(k => k.replace(/[-]/g, '\\-')).join('|')})`, 'i');
async function hnSearch(tags, minPoints) {
  const t = Math.floor(since() / 1000);
  const url = `https://hn.algolia.com/api/v1/search?tags=${tags}&numericFilters=created_at_i>${t},points>${minPoints}&hitsPerPage=100`;
  const data = await get(url, { json: true });
  return data.hits.filter(h => h.title && kwRe.test(h.title));
}
export async function fetchHN() {
  const [stories, shows] = await Promise.all([hnSearch('story', HN.minPoints), hnSearch('show_hn', HN.minShowPoints)]);
  const seen = new Set();
  return [...shows.map(h => ({ h, kind: 'hn-show' })), ...stories.map(h => ({ h, kind: 'hn' }))]
    .filter(({ h }) => !seen.has(h.objectID) && seen.add(h.objectID))
    .map(({ h, kind }) => ({
      title: h.title,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      publishedAt: h.created_at_i * 1000,
      snippet: strip(h.story_text || '').slice(0, 300),
      source: kind === 'hn-show' ? 'Show HN' : 'Hacker News', kind,
      signals: { points: h.points, comments: h.num_comments },
    }));
}

/* ---------- Hugging Face Daily Papers ---------- */
export async function fetchPapers() {
  const headers = process.env.HF_TOKEN ? { authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  const data = await get('https://huggingface.co/api/daily_papers?limit=50', { json: true, headers });
  return arr(data).map(item => {
    const p = item.paper || item;
    return {
      title: strip(item.title || p.title),
      url: `https://huggingface.co/papers/${p.id}`,
      publishedAt: Date.parse(item.publishedAt || p.submittedOnDailyAt || p.publishedAt || '') || null,
      snippet: strip(p.summary || item.summary || '').slice(0, 500),
      source: 'HF Daily Papers', kind: 'paper',
      signals: { upvotes: p.upvotes ?? item.upvotes ?? 0, comments: item.numComments ?? 0 },
    };
  }).filter(i => i.title && !i.url.endsWith('/undefined'))
    .sort((a, b) => b.signals.upvotes - a.signals.upvotes).slice(0, 20);
}

/* ---------- GitHub: fast-rising new AI repos ---------- */
export async function fetchGitHub() {
  const d = new Date(Date.now() - GITHUB.createdWithinDays * 864e5).toISOString().slice(0, 10);
  const q = encodeURIComponent(`${GITHUB.query} created:>${d} stars:>=${GITHUB.minStars}`);
  const headers = { accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const data = await get(`https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=20`, { json: true, headers });
  return arr(data.items).map(r => ({
    title: `${r.full_name}: ${r.description || ''}`.trim(),
    url: r.html_url, publishedAt: Date.parse(r.created_at), snippet: (r.description || '').slice(0, 300),
    source: 'GitHub', kind: 'github', signals: { stars: r.stargazers_count, language: r.language },
  }));
}

/* ---------- X via SocialData (same approach as AIHOT) ---------- */
export async function fetchX() {
  const key = process.env.SOCIALDATA_API_KEY;
  if (!key) return [];
  const sinceSec = Math.floor(since() / 1000);
  const out = [];
  for (let i = 0; i < X_ACCOUNTS.length; i += 20) {
    const from = X_ACCOUNTS.slice(i, i + 20).map(h => `from:${h}`).join(' OR ');
    const query = `(${from}) -filter:replies since_time:${sinceSec}`;
    const url = `https://api.socialdata.tools/twitter/search?${new URLSearchParams({ query, type: 'Latest' })}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`SocialData ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const data = await res.json();
    for (const t of data.tweets ?? []) {
      if (t.retweeted_status) continue;
      if ((t.favorite_count ?? 0) < X_MIN_LIKES) continue;
      let body = t.full_text ?? t.text ?? '';
      for (const u of t.entities?.urls ?? []) body = body.replaceAll(u.url, u.expanded_url);
      body = body.replace(/\s*https:\/\/t\.co\/\w+\s*$/, '').trim();
      out.push({
        title: `@${t.user.screen_name}：${body.slice(0, 140)}`,
        url: `https://x.com/${t.user.screen_name}/status/${t.id_str}`,
        publishedAt: Date.parse(t.tweet_created_at),
        snippet: body.slice(0, 600), source: `X · @${t.user.screen_name}`, kind: 'tweet',
        tweet: { id: t.id_str, handle: t.user.screen_name, name: t.user.name },
        signals: { likes: t.favorite_count, retweets: t.retweet_count, replies: t.reply_count, views: t.views_count },
      });
    }
  }
  return out;
}

/* ---------- Run everything, never let one source break the day ---------- */
export async function collectAll({ isFirstRun }) {
  const jobs = [
    ...FEEDS.map(f => [f.name, () => fetchFeed(f)]),
    ...PAGES.map(p => [p.name, () => fetchPage(p, isFirstRun)]),
    ['Hacker News', fetchHN],
    ['HF Daily Papers', fetchPapers],
    ['GitHub', fetchGitHub],
    ['X（推特）', fetchX],
  ];
  const results = await Promise.allSettled(jobs.map(([, fn]) => fn()));
  const items = [], report = [];
  results.forEach((r, i) => {
    const name = jobs[i][0];
    if (r.status === 'fulfilled') { items.push(...r.value); report.push(`  ✓ ${name}: ${r.value.length}`); }
    else report.push(`  ✗ ${name}: ${r.reason?.message || r.reason}`);
  });
  return { items, report };
}
