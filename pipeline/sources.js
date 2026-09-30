// 所有来源集中在这里。想加一个博客或媒体，往对应数组里加一行即可。
// kind 只是给 AI 的提示，最终分到哪一类由模型判断。

export const FEEDS = [
  // 信源清单参考了 AIHOT（github.com/KKKKhazix/AIHOT，MIT）的 industry/sources.json。
  // ── AI 公司官方博客 / 新闻室 ──
  { name: 'OpenAI', url: 'https://openai.com/news/rss.xml', kind: 'company' },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', kind: 'company' },
  { name: 'Google Research', url: 'https://research.google/blog/rss/', kind: 'company' },
  { name: 'Google AI', url: 'https://blog.google/technology/ai/rss/', kind: 'company' },
  { name: 'Microsoft Research', url: 'https://www.microsoft.com/en-us/research/feed/', kind: 'company' },
  { name: 'NVIDIA', url: 'https://blogs.nvidia.com/feed/', kind: 'company' },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', kind: 'company' },
  { name: 'AWS Machine Learning', url: 'https://aws.amazon.com/blogs/machine-learning/feed/', kind: 'company' },
  { name: 'GitHub Blog · AI', url: 'https://github.blog/ai-and-ml/feed/', kind: 'company' },
  { name: 'Mistral AI', url: 'https://mistral.ai/rss.xml', kind: 'company' },
  { name: 'Berkeley AI Research', url: 'https://bair.berkeley.edu/blog/feed.xml', kind: 'company' },

  // ── 科技媒体的 AI 频道 ──
  { name: 'TechCrunch', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', kind: 'media' },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', kind: 'media' },
  { name: 'Ars Technica', url: 'https://arstechnica.com/ai/feed/', kind: 'media' },
  { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', kind: 'media' },
  { name: 'The Decoder', url: 'https://the-decoder.com/feed/', kind: 'media' },

  // ── 开发者个人博客 / newsletter ──
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', kind: 'developer' },
  { name: 'Latent Space', url: 'https://www.latent.space/feed', kind: 'developer' },
  { name: 'Import AI', url: 'https://importai.substack.com/feed', kind: 'developer' },
];

// 推特：想关注谁就改这张表（不带 @）。需要 SOCIALDATA_API_KEY，没填就自动跳过。
// 按 AIHOT 的做法，每 20 个账号合并成一次搜索，排除回复，只看最新。
export const X_ACCOUNTS = [
  'thsottiaux',      // Tibo，OpenAI Codex
  'karpathy', 'simonw', 'swyx', 'levelsio', 'rauchg', 'mitchellh', 't3dotgg',
  'bcherny', 'alexalbert__', 'OfficialLoganK', 'hwchase17', 'jxnlco', 'steipete',
  'amasad', 'mckaywrigley', 'emollick', 'jeremyphoward', 'fchollet', 'DrJimFan',
  'natfriedman', 'ThePrimeagen', 'kentcdodds', '_akhaliq',
];
export const X_MIN_LIKES = 50;   // 点赞低于这个数的推文不收

// 没有 RSS 的官方新闻页：抓页面里的文章链接。
export const PAGES = [
  { name: 'Anthropic', url: 'https://www.anthropic.com/news', base: 'https://www.anthropic.com', linkPattern: /href="(\/news\/[a-z0-9-]+)"/g, kind: 'company' },
];

// Hacker News：AI 相关的热门讨论和 Show HN 新产品。
export const HN = {
  keywords: ['ai', 'llm', 'gpt', 'claude', 'gemini', 'openai', 'anthropic', 'agent', 'model', 'inference', 'rag', 'diffusion', 'transformer', 'mcp', 'copilot', 'deepseek', 'mistral', 'llama', 'embedding', 'fine-tun'],
  minPoints: 80,       // 普通讨论的热度门槛
  minShowPoints: 25,   // Show HN 的热度门槛
};

// GitHub：最近一周新建、涨星快的 AI 仓库。
export const GITHUB = {
  query: '(llm OR agent OR "ai" OR mcp OR rag) in:name,description,topics',
  createdWithinDays: 7,
  minStars: 80,
};

// 往前看多少小时的内容（每天跑一次，多留几个小时做缓冲）。
export const WINDOW_HOURS = 30;
// 每类在电视上最多播几条。
export const PER_CATEGORY = 5;
// 网站保留多少天。
export const KEEP_DAYS = 90;
