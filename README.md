# 星港日记

一个开放式 LLM 养成游戏 Web 原型。前端使用 React + Tailwind + Vite，服务端使用 Node 原生 HTTP，账号登录后按账号隔离服务器存档，并保留浏览器 localStorage 镜像。

## 运行

前端开发服务器：

```powershell
npm run dev
```

默认地址：

```text
http://localhost:5173
```

生产构建并由 Node 服务托管：

```powershell
npm run build
npm start
```

Node 服务默认地址：

```powershell
http://localhost:4177
```

如果需要使用真实 LLM，启动 Node 服务前设置：

```powershell
$env:OPENAI_API_KEY="你的 key"
$env:OPENAI_MODEL="gpt-5.5"
npm start
```

未设置 `OPENAI_API_KEY` 时，服务端会使用本地模拟导演，完整玩法仍可运行。开发服务器会把 `/api` 代理到 `http://127.0.0.1:4177`；如果未启动 Node 服务，前端会 fallback 到浏览器本地模拟。

## 账号与敏感配置

登录账号从本地配置文件读取，默认路径：

```text
config/accounts.local.json
```

生产环境默认读取：

```text
/etc/starharbor/accounts.json
```

账号文件格式见 `config/accounts.example.json`。密码只保存 PBKDF2 哈希，可用下面命令生成：

```powershell
node scripts/hash-password.mjs "your-password"
```

以下内容已在 `.gitignore` 中排除，不应提交到 GitHub：

- `.env` / `.env.*`
- `config/*.local.json`
- `data/`
- `logs/`
- `dist/`
- `node_modules/`

模型调用配置建议放在 `.env` 或服务器 `/etc/starharbor.env`。账号存档默认写入 `data/saves`，生产环境写入 `/var/lib/starharbor/saves`。

## 构建

```powershell
npm run build
```

产物输出到 `dist/`。

## 测试

```powershell
npm test
```

## 部署

默认部署到 ECS `starharbor-ecs`，公网入口：

```text
http://39.106.56.69:7001
```

一键部署：

```powershell
npm run deploy:ecs
```

等价命令：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-ecs.ps1
```

脚本会执行：

- 本地 `node --check` 和 `npm test`
- `npm run build` 构建 React 前端
- 打包当前项目，排除 `logs/`、`screenshots/`、Chrome/Edge 临时 profile
- 上传到 ECS `/tmp`
- 解压到 `/opt/starharbor/releases/<timestamp>`
- 更新 `/opt/starharbor/current`
- 重启 `starharbor.service`
- 验证公网 HTML 和 `/api/director`

常用参数：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy-ecs.ps1 -SkipDirectorCheck
powershell -ExecutionPolicy Bypass -File scripts\deploy-ecs.ps1 -SkipTests
powershell -ExecutionPolicy Bypass -File scripts\deploy-ecs.ps1 -DryRun
```

脚本不保存密钥。服务器运行时配置仍在 `/etc/starharbor.env`。

## 当前功能

- 三段时间制的日常养成循环。
- 固定行动和自由文本行动。
- 主角拥有“能力库”，重复行动会推进对应能力的等级、进度和证据，并进入行动依据与导演层上下文。
- “行动机会”会把承诺、羁绊压力、技能突破、待确认世界发现和需复核记忆整理成优先级入口，并反馈到今日计划。
- 地点、NPC、关系、目标、带标签和关联边的结构化记忆、反思和日记。
- 行动会沉淀为“世界发现”，把地点、NPC 和世界规则层面的已观察知识从主观记忆里拆出来，进入行动依据和导演层上下文。
- NPC 会形成关系阶段、当前立场、对主角的个人反思、隐藏牵挂和羁绊事件。
- 羁绊事件会生成可执行 follow-up，一键填入下一次行动的意图、地点和同伴。
- 羁绊事件会启动 NPC 关系任务线，记录进度、期限、压力、当前步骤、风险和奖励；匹配行动会推进任务线，逾期会产生修复压力，修复行动会降低压力并恢复推进，完成时生成结算和新的羁绊事件。
- 全局“羁绊任务”面板汇总所有 NPC 关系任务，可按全部、紧张、进行中、完成筛选，并可一键推进、修复或沉淀。
- 每日收束生成高层洞察，并进入下一次导演层上下文。
- 每天生成 3 条“今日计划”，可一键设置行动类型、地点/NPC 和自由行动文本。
- 行动区新增“行动依据”预览，会在执行前展示导演层将带入的计划、记忆、洞察、羁绊和目标。
- 回响里的后续线索会沉淀成“承诺”，后续匹配行动会兑现承诺，逾期会标记错过；兑现/失约会影响绑定 NPC 的信任，并写入可关联记忆和连续性 trace。
- 导演层会收到当前行动相关的计划、结构化记忆、关联记忆、主角反思、NPC 反思和羁绊事件检索结果。
- 每次行动生成连续性 trace，记录上下文检索、记忆写入、目标推进、关系变化和羁绊事件触发。
- 回响里的后续线索可一键填入下一次自由行动。
- 可选 OpenAI Responses API 结构化输出。
- 无 API Key fallback。
- 账号登录后按账号隔离服务器存档，并保留 localStorage 镜像。
- JSON 导出和导入。

## 目录

- `index.html`：Vite HTML 入口。
- `src/main.jsx`：React 应用入口和界面组件。
- `src/styles.css`：Tailwind 样式入口和组件样式。
- `src/game/data.js`：初始世界、角色、地点和行动数据。
- `src/game/engine.js`：纯规则引擎、每日计划、能力成长、世界发现、承诺、结构化记忆标签与关联边、主角/NPC 反思、关系阶段、隐藏牵挂解锁、羁绊后续行动、NPC 关系任务线、连续性追踪和相关上下文检索。
- `public/assets/`：Vite 直接复制的静态资源。
- `dist/`：构建产物，由 `server.js` 优先托管。
- `server.js`：静态服务器和 `/api/director`。
- `scripts/deploy-ecs.ps1`：ECS 一键部署脚本。
- `scripts/verify-director.mjs`：部署后导演接口验收脚本。
- `scripts/capture-hidden-goal-screenshot.mjs`：NPC 隐藏牵挂、全局羁绊任务日志、行动依据、承诺、世界发现、羁绊任务完成态、羁绊压力/修复态、连续性面板和记忆标签的移动端截图验收脚本。
- `tests/engine.test.js`：核心规则测试。
- `docs/llm-raising-game-research.md`：开放式 LLM 养成游戏研究笔记和路线图。

## Recent Additions

- `chapters` stores long-horizon narrative cells with premise, objective, current beat, next hook, constraint, evidence, progress, and pressure.
- Daily rollover advances the active chapter, can archive completed chapters, and uses the active chapter to seed the next day's plans.
- `selectRelevantContext` and `/api/director` now include matching chapters so the director can keep open-ended actions inside a coherent narrative unit.
- The React UI includes a `篇章` panel and `screenshot:chapters` visual regression script.
- `worldFacts` stores structured world discoveries with confidence, evidence, location/NPC/action facets, retrieval reasons, and a `世界发现` panel.
- `hero.skills` stores reusable learned abilities with level, progress, evidence, status, next milestone, retrieval reasons, and a `能力库` panel.
- `buildActionOpportunities` derives prioritized action affordances from open loops, skills, world facts, memory maintenance, commitments, quests, and chapter pressure; the UI includes an `行动机会` panel.
- `buildExperienceDiagnostics` derives a long-horizon health check across continuity, action diversity, open loops, memory freshness, growth momentum, and world knowledge; the UI includes a `体验诊断` panel.
- Relevant-context retrieval now combines facets, graph neighbors, tags, recency, and Chinese cue overlap; UI context cards show `命中` reasons and matched cue terms.
- `memoryTopics` consolidates related memories into lightweight topic documents with evidence, strength, tags, and retrieval reasons; the UI includes a `记忆主题` panel and `screenshot:memory-topics` visual regression script.
- Memory topics now expose `freshness` and `maintenanceStatus` (`active` / `watch` / `stale` / `revised`) so old evidence is visible, logged, and down-weighted instead of silently reused as current fact.

## OpenAI-Compatible Provider

The server reads LLM settings from environment variables. Do not commit real API keys.

```powershell
$env:OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
$env:OPENAI_API_KEY="your-api-key"
$env:OPENAI_MODEL="qwen3.7-plus"
$env:OPENAI_TIMEOUT_MS="28000"
npm start
```

The game calls:

```text
POST $OPENAI_BASE_URL/chat/completions
```

If the provider call fails, `/api/director` falls back to the local director so the game remains playable.
`OPENAI_TIMEOUT_MS` controls the upstream LLM request timeout; the default is 28 seconds.

## Logs

Runtime logs are JSON Lines:

```text
logs/app.jsonl
```

The logger records:

- HTTP access logs with `requestId`, method, path, status, duration, IP, user agent.
- Client events from `/api/log`: page load, selections, action submit/result/failure, save import/export/reset, browser errors.
- LLM chain events: `director.request`, `llm.call.start`, `llm.call.success`, `llm.call.failure`, `director.fallback`, `director.local`.
- Game-state summaries include counts for memories, reflections, NPC bond events, continuity traces, and the latest continuity score.
- Provider metadata: model and base host only. API keys and authorization data are redacted.

Useful environment variables:

```powershell
$env:LOG_FILE="D:\Code\Codex\open-ended-raising-game\logs\app.jsonl"
$env:LOG_CONSOLE="1"
$env:LOG_FILE_ENABLED="1"
```

`logs/*.jsonl` is ignored by git.
