// 每天跑一次：抓取 → 去重合并 → 模型判断 → 写入 public/data/
// 用法：node pipeline/run.js          真实运行（需要 ANTHROPIC_API_KEY）
//      node pipeline/run.js --mock   用 fixtures 里的样例，不联网也不调模型
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectAll } from './fetchers.js';
import { judge, judgeOffline } from './llm.js';
import { PER_CATEGORY, KEEP_DAYS } from './sources.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const DAYS_DIR = path.join(DATA, 'days');
const MOCK = process.argv.includes('--mock');
const CATS = ['kol', 'co', 'prod', 'paper'];
const MAX_CANDIDATES = 140;
const log = (...a) => console.log(...a);

const readJson = async (p, fallback) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; } };
const londonDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/* ---------- Dedupe: same link, or near-identical titles ---------- */
function urlKey(u) {
  try {
    const x = new URL(u); x.hash = '';
    [...x.searchParams.keys()].filter(k => /^utm_|^ref$|^source$/.test(k)).forEach(k => x.searchParams.delete(k));
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase();
  } catch { return String(u).toLowerCase(); }
}
const tokens = s => new Set(String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(w => w.length > 2));
function similar(a, b) {
  const A = tokens(a), B = tokens(b); if (A.size < 3 || B.size < 3) return false;
  let n = 0; for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n) >= .6;
}
function signalScore(it) {
  const s = it.signals || {};
  const raw = (s.likes || 0) / 40 + (s.points || 0) / 4 + (s.comments || 0) / 6 + (s.upvotes || 0) * 1.2 + (s.stars || 0) / 25;
  const base = { company: 18, media: 10 }[it.kind] || 0;
  return Math.min(100, base + Math.log10(1 + raw) * 38);
}
function cluster(items) {
  const groups = [];
  for (const it of items) {
    const k = urlKey(it.url);
    const g = groups.find(g => g.keys.has(k) || similar(g.lead.title, it.title));
    if (!g) { groups.push({ lead: it, keys: new Set([k]), sources: new Set([it.source]) }); continue; }
    g.keys.add(k); g.sources.add(it.source);
    if (signalScore(it) > signalScore(g.lead)) g.lead = it;
  }
  return groups.map(g => ({ ...g.lead, alsoBy: [...g.sources].filter(s => s !== g.lead.source), keys: [...g.keys] }));
}

async function main() {
  await fs.mkdir(DAYS_DIR, { recursive: true });
  const index = await readJson(path.join(DATA, 'index.json'), { days: [] });
  const today = londonDate();
  const isFirstRun = index.days.length === 0;

  /* links already shown in the last 7 days */
  const seen = new Set();
  for (const d of index.days.slice(-7)) {
    if (d.date === today) continue;
    const day = await readJson(path.join(DAYS_DIR, `${d.date}.json`), null);
    for (const c of CATS) for (const it of day?.items?.[c] ?? []) for (const k of it.keys ?? [urlKey(it.url)]) seen.add(k);
  }

  log(`▶ ${today}：开始抓取${MOCK ? '（模拟数据）' : ''}`);
  let raw;
  if (MOCK) raw = await readJson(path.join(ROOT, 'pipeline', 'fixtures', 'sample.json'), []);
  else { const r = await collectAll({ isFirstRun }); r.report.forEach(l => log(l)); raw = r.items; }
  log(`  共 ${raw.length} 条原始资料`);

  const fresh = raw.filter(it => !seen.has(urlKey(it.url)));
  const groups = cluster(fresh).sort((a, b) => (signalScore(b) + b.alsoBy.length * 10) - (signalScore(a) + a.alsoBy.length * 10)).slice(0, MAX_CANDIDATES);
  log(`  去重合并后 ${groups.length} 条候选`);

  const verdicts = MOCK && !process.env.ANTHROPIC_API_KEY ? judgeOffline(groups) : await judge(groups, { log });
  const kept = [];
  groups.forEach((it, i) => {
    const v = verdicts[i]; if (!v || !v.keep || !CATS.includes(v.cat)) return;
    const heat = Math.round(Math.min(100, .6 * (Number(v.heat) || 40) + .4 * signalScore(it) + it.alsoBy.length * 6));
    kept.push({
      cat: v.cat, title: String(v.title || it.title).trim(), sum: String(v.sum || '').trim(), topic: String(v.topic || 'AI').trim().slice(0, 8),
      heat, url: it.url, source: it.source, alsoBy: it.alsoBy.slice(0, 4), discussion: it.discussion, tweet: it.tweet,
      publishedAt: it.publishedAt ? new Date(it.publishedAt).toISOString() : null, keys: it.keys,
    });
  });

  const items = {}, rawCount = {};
  for (const c of CATS) {
    const list = kept.filter(k => k.cat === c).sort((a, b) => b.heat - a.heat);
    rawCount[c] = list.length;
    items[c] = list.slice(0, PER_CATEGORY).map(({ cat, ...rest }) => rest);
  }
  const all = CATS.flatMap(c => items[c].map(it => ({ ...it, cat: c })));
  if (!all.length) { log('✗ 今天没有可收录的内容，保留昨天的数据，不写新文件。'); return; }
  const head = all.reduce((m, it) => it.heat > m.heat ? it : m, all[0]);
  const total = CATS.reduce((s, c) => s + rawCount[c], 0);

  const prevTotals = index.days.filter(d => d.date !== today).slice(-30).map(d => d.total).sort((a, b) => a - b);
  const median = prevTotals.length ? prevTotals[Math.floor(prevTotals.length / 2)] : total;
  const big = prevTotals.length >= 5 && (total >= median * 1.5 || head.heat >= 92);

  const day = { date: today, generatedAt: new Date().toISOString(), items, raw: rawCount };
  await fs.writeFile(path.join(DAYS_DIR, `${today}.json`), JSON.stringify(day, null, 1));

  const entry = { date: today, raw: rawCount, total, big, keyword: head.topic, head: { title: head.title, cat: head.cat } };
  const days = [...index.days.filter(d => d.date !== today), entry].sort((a, b) => a.date.localeCompare(b.date));
  const keep = days.slice(-KEEP_DAYS), drop = days.slice(0, -KEEP_DAYS);
  for (const d of drop) await fs.rm(path.join(DAYS_DIR, `${d.date}.json`), { force: true });
  await fs.writeFile(path.join(DATA, 'index.json'), JSON.stringify({ updatedAt: new Date().toISOString(), days: keep }, null, 1));

  log(`✓ 写入 ${today}：${CATS.map(c => `${c} ${items[c].length}/${rawCount[c]}`).join('，')}；头条「${head.title}」${big ? '（大新闻日）' : ''}`);
  if (drop.length) log(`  已清理 ${drop.length} 天前的旧数据`);
}

main().catch(e => { console.error('✗', e); process.exit(1); });
