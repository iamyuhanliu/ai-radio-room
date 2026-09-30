# AI 电台小屋

每天自动抓取全网 AI 新闻，由 Claude 归类、打热度、写中文摘要，然后放进一个温暖房间里的老电视上播放。书柜里的每一本书是过去的一天，网站保留最近 90 天。

四个频道：

| 频道 | 内容 | 来源 |
|---|---|---|
| CH1 开发者观点 | 程序员、研究者的观点和经验 | 推特（可选）、开发者博客、Hacker News 讨论 |
| CH2 公司动态 | AI 公司和上下游的发布、融资、人事、报道 | 各公司官方博客和新闻室、科技媒体 AI 频道 |
| CH3 热门新产品 | 正在变热的新产品和开源项目 | Show HN、GitHub 近一周涨星最快的新仓库 |
| CH4 热门论文 | 值得看的新论文 | Hugging Face Daily Papers |

## 它是怎么运转的

```
GitHub Actions（每天早上自动跑一次）
  └─ pipeline/run.js
       1. 抓取：pipeline/fetchers.js 从各个来源拉最近 30 小时的内容
       2. 去重：同一链接、几乎相同的标题合并成一条，记下有几家来源在报道
       3. 判断：pipeline/llm.js 让 Claude 决定收不收、分到哪一类、写中文标题和摘要、打热度
       4. 写入：public/data/days/当天日期.json，并更新 public/data/index.json，超过 90 天的自动删掉
  └─ 把新数据提交回仓库 → Vercel 自动重新部署网站
```

没有数据库，也没有服务器，所有数据就是仓库里的 JSON 文件。

## 第一次部署（大约 15 分钟）

### 1. 把代码放到 GitHub

在 GitHub 新建一个仓库（公开或私有都可以），把这个文件夹里的所有文件传上去。

### 2. 填密钥

仓库页面 → **Settings → Secrets and variables → Actions → New repository secret**：

| 名称 | 必填 | 从哪里拿 |
|---|---|---|
| `ANTHROPIC_API_KEY` | 必填 | console.anthropic.com 创建 API Key |
| `SOCIALDATA_API_KEY` | 选填 | socialdata.tools 注册后获得。填了才会抓推特，按量付费 |
| `HF_TOKEN` | 选填 | huggingface.co 的 Access Token，用来读 Daily Papers 更稳定 |

如果想换模型（默认是便宜的 Haiku），在同一页的 **Variables** 里加 `CLAUDE_MODEL`，比如 `claude-sonnet-5-5`。

### 3. 手动跑第一次

仓库页面 → **Actions → 每日更新 AI 新闻 → Run workflow**。几分钟后跑完，日志里能看到每个来源抓到了多少条（✓ 成功、✗ 失败）。成功后仓库里会多出 `public/data/` 下的数据文件。

之后每天伦敦时间早上 6 点左右会自动跑。

### 4. 用 Vercel 发布网站

1. 用 GitHub 账号登录 vercel.com
2. **Add New → Project**，选这个仓库
3. Framework Preset 选 **Other**，其他保持默认（`vercel.json` 已经配置好了，网站目录是 `public`）
4. 点 **Deploy**，得到一个公开网址

之后每次每日任务提交新数据，Vercel 都会自动更新网站。

## 日常修改

- **加减来源、换关注的推特账号**：改 `pipeline/sources.js`，每一类都有注释
- **每类播几条、保留多少天**：同样在 `pipeline/sources.js` 最下面
- **分类和摘要的标准**：改 `pipeline/llm.js` 里的 `SYSTEM` 提示词
- **本地预览网站**：`npm install` 后运行 `npm run dev`，打开 http://localhost:5173
- **本地试跑流水线（不联网、不花钱）**：`npm run mock`，会用 `pipeline/fixtures/sample.json` 的样例生成一天的数据。试完记得删掉 `public/data/` 里生成的文件，别提交上去

没有数据时（比如还没跑过第一次），网站会自动显示示例数据。

## 大概花多少钱

- **GitHub Actions、Vercel**：个人项目在免费额度内
- **Claude API**：每天大约判断一百多条候选，用 Haiku 的话每月几美元，以官网价格为准
- **SocialData（推特）**：按返回的推文条数计费，每 1000 条约 0.2 美元；关注二十几个账号，每月一两美元左右

## 注意

- 某个来源临时失败（改版、限流）不会影响其他来源，当天照常更新；在 Actions 日志里能看到是哪个来源出了问题
- 背景音乐《从此江渚春水尽（氛围版）》来自你的音乐包，公开网站使用前请确认授权范围包含网站使用
- 信源清单和推特抓取方式参考了开源项目 [AIHOT](https://github.com/KKKKhazix/AIHOT)（MIT 协议）。注意 aihot.news 网站本身的数据接口不允许未经授权的公开转载，本项目没有使用它的数据
