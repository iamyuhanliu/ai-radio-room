import Anthropic from '@anthropic-ai/sdk';

// 默认用便宜又快的 Haiku；想要更好的中文摘要可以在 GitHub Secrets / 环境变量里设 CLAUDE_MODEL=claude-sonnet-5-5
const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const BATCH = 25;

const SYSTEM = `你是一个 AI 行业新闻编辑，负责一个中文 AI 新闻站。你会收到一批候选资料（JSON），为每一条做判断。

四个栏目：
- kol：开发者、研究者、创业者的个人观点和经验（推特、个人博客、HN 上的讨论帖）。要有具体观点或实践经验，闲聊、转发、广告、纯链接不要。
- co：AI 公司和上下游公司（模型厂商、芯片、云、应用公司）的官方动态、融资、发布、人事和媒体报道。
- prod：新出现、正在变热的 AI 产品、开源项目、工具（Show HN、GitHub 新仓库、新发布的应用）。
- paper：值得关注的论文和研究成果。

对每一条输出：
- keep：是否值得收录（与 AI 无关、营销软文、过于琐碎、重复旧闻 → false）
- cat：kol / co / prod / paper 之一
- title：中文标题，20 个汉字以内，说清楚发生了什么，不要标题党。推文用"@账号：观点"的形式。
- sum：中文摘要 1~2 句，60~110 字，写清楚"是什么"和"为什么值得看"，不要编造原文没有的信息。
- topic：2~6 个字的话题关键词，例如"Agent"、"推理模型"、"开源模型"、"算力"、"代码助手"
- heat：0~100 的重要程度。参考影响范围、新颖程度，以及给出的互动数据（点赞、points、upvotes、stars）。

只输出一个 JSON 数组，不要任何其他文字：[{"i":0,"keep":true,"cat":"co","title":"...","sum":"...","topic":"...","heat":72}, ...]`;

function compact(items) {
  return items.map((it, i) => ({
    i, source: it.source, kind: it.kind, title: it.title.slice(0, 200),
    snippet: (it.snippet || '').slice(0, 450), signals: it.signals, alsoReportedBy: it.alsoBy?.length ? it.alsoBy : undefined,
  }));
}
function parseJsonArray(text) {
  const start = text.indexOf('['), end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('模型没有返回 JSON 数组');
  return JSON.parse(text.slice(start, end + 1));
}

export async function judge(items, { log = console.log } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('缺少 ANTHROPIC_API_KEY');
  const client = new Anthropic();
  const results = new Array(items.length).fill(null);
  for (let b = 0; b < items.length; b += BATCH) {
    const chunk = items.slice(b, b + BATCH);
    let attempt = 0;
    while (attempt < 2) {
      try {
        const msg = await client.messages.create({
          model: MODEL, max_tokens: 8000, system: SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(compact(chunk)) }],
        });
        const text = msg.content.filter(c => c.type === 'text').map(c => c.text).join('');
        for (const r of parseJsonArray(text)) if (Number.isInteger(r.i) && chunk[r.i]) results[b + r.i] = r;
        log(`  · 已判断 ${Math.min(b + BATCH, items.length)}/${items.length}`);
        break;
      } catch (e) {
        attempt++;
        log(`  ! 第 ${b / BATCH + 1} 批失败（${e.message}）${attempt < 2 ? '，重试' : '，跳过'}`);
      }
    }
  }
  return results;
}

/* 离线测试用：不调模型，按来源类型粗略归类。 */
const KIND_CAT = { tweet: 'kol', developer: 'kol', hn: 'kol', company: 'co', media: 'co', 'hn-show': 'prod', github: 'prod', paper: 'paper' };
const TOPICS = [['agent', 'Agent'], ['reason', '推理模型'], ['open', '开源模型'], ['gpu', '算力'], ['chip', '芯片'], ['code', '代码助手'], ['rag', 'RAG'], ['video', '视频生成'], ['voice', '语音'], ['mcp', 'MCP']];
export function judgeOffline(items) {
  return items.map(it => {
    const low = `${it.title} ${it.snippet}`.toLowerCase();
    const topic = (TOPICS.find(([k]) => low.includes(k)) || [, 'AI'])[1];
    return { keep: true, cat: KIND_CAT[it.kind] || 'co', title: it.title.slice(0, 60), sum: (it.snippet || it.title).slice(0, 110), topic, heat: 50 };
  });
}
