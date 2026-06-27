# LLM 开放式养成游戏研究笔记

## 结论

当前原型最值得优先强化的不是更多固定剧情，而是长期一致性的角色循环：

```text
观察/行动结果 -> 事件记忆 -> 高层反思 -> 下一步计划/行动
```

这个循环能让开放式养成从“每次生成一段故事”变成“角色逐渐形成偏好、目标和人际轨迹”。本轮已经把“高层反思、今日计划、NPC 个人反思、隐藏牵挂、羁绊事件、羁绊 follow-up、NPC 关系任务线和连续性追踪”落到规则层、UI 层和导演上下文里。

## 参考资料

- [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)：提出用自然语言记忆流、反思和计划来支持可信的长线行为。论文消融也强调 observation、planning、reflection 都会影响角色可信度。
- [A Survey on Large Language Model-Based Game Agents](https://arxiv.org/html/2404.02039v3)：把 LLM 游戏智能体抽象为 perception、memory、thinking、role-playing、action、learning 等部件，适合作为后续架构拆分参考。
- [Stanford HAI: Computational Agents Exhibit Believable Humanlike Behavior](https://hai.stanford.edu/news/computational-agents-exhibit-believable-humanlike-behavior)：用更产品化的角度说明生成式角色需要记住经历、反思经历并形成计划，才能出现可信的日常与社交行为。
- [Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Challenges](https://arxiv.org/html/2603.07670v1)：把 agent memory 抽象为紧密耦合感知与行动的 write/manage/read 循环，说明长期体验不能只保存最近记录，还要管理和读取相关记忆。
- [STALE: Can LLM Agents Know When Their Memories Are No Longer Valid?](https://arxiv.org/html/2605.06527v1)：指出长期记忆系统不仅要检索新证据，还要知道旧记忆何时被后续状态改写；这支持在行动前展示本次读取到的上下文，方便观察导演层是否仍在依赖过期依据。
- [Cognitive Architectures for Language Agents](https://arxiv.org/html/2309.02427v3)：强调模块化记忆、结构化行动空间和决策过程，适合作为后续拆分“计划、记忆、工具/行动接口”的参考。
- [LLM-Driven NPCs: Cross-Platform Dialogue System for Games and Social Software](https://arxiv.org/html/2504.13928v1)：强调 NPC 对话日志和跨平台记忆同步，用于保持长期互动一致性。
- [Collaborative Quest Completion with LLM-driven Non-Player Characters in Minecraft](https://arxiv.org/html/2407.03460v1)：把 LLM NPC 放入需要协作完成的任务场景，说明 NPC 互动需要连接到明确的游戏目标和玩家行动。
- [AgentOdyssey: Open-Ended Long-Horizon Text Game Generation and Agent Learning](https://arxiv.org/html/2606.24893v1)：强调开放式长线游戏需要世界知识、经验保留和长程规划，这支持把关系事件转成可继续执行的行动钩子。
- [A Dependency-Driven Prompt Pipeline for Coherent RPG Generation](https://arxiv.org/html/2604.25482v1)：强调用结构化中间表示显式建模 RPG 内容之间的依赖关系，说明任务线、NPC 关系和后续行动不应只靠自然语言隐式串联。
- [On Training Large Language Models for Long-Horizon Tasks](https://arxiv.org/html/2605.02572v1)：指出长程任务中早期决策会持续约束后续状态，支持在游戏状态机里显式保存任务进度和下一步，而不是只让 LLM 从上下文里猜。
- [Game Quest Design: Definition, Process, Examples](https://gamedesignskills.com/game-design/quest-design/)：从产品设计角度强调任务需要目标、奖励，以及从开始到结束的结构；这支持在羁绊任务完成时提供可见结算。
- [Trust, Lies, and Long Memories: Emergent Social Dynamics and Reputation in Multi-Round Avalon with LLM Agents](https://arxiv.org/abs/2604.20582)：重复互动和跨局记忆会自然产生声誉、信任和谨慎等社交动态，适合作为 NPC 关系阶段的设计依据。
- [LLM-enabled Social Agents](https://arxiv.org/html/2605.02335v1)：把 social agent 定义为由 persona、价值、目标、关系和承诺共同约束的角色扮演 agent，说明 NPC 不应只有单轮对话状态。
- [The Many Challenges of Human-Like Agents in Virtual Game Environments](https://arxiv.org/html/2505.20011v1)：指出虚拟游戏环境里的类人智能体需要面对长期一致性、可信行为、评估和可控性问题，适合作为开放式养成的风险清单。
- [Are We Ready For An Agent-Native Memory System?](https://arxiv.org/abs/2606.24775)：把 agent memory 拆成表示与存储、抽取、检索路由、维护等模块，并指出只看端到端任务分数会把记忆系统当成黑盒；这支持在游戏内记录每次行动到底触发了哪些长期状态变化。
- [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/abs/2502.12110)：强调记忆不应只是静态条目，而应能动态建立链接、演化上下文表示；这支持后续把行动轨迹、计划、记忆和 NPC 关系事件连接成更可解释的网络。
- [Memory is Reconstructed, Not Retrieved: Graph Memory for LLM Agents](https://arxiv.org/html/2606.06036v1)：用 Cue-Tag-Content 图表示记忆，说明 tag 可以作为线索和内容之间的语义桥；这支持先在游戏状态机里建立轻量标签层，再逐步升级为图检索。

## 已落地

- `src/game/data.js`：初始存档新增 `reflections`。
- `src/game/engine.js`：每天结束时生成一条 `reflection`，并限制最近 24 条，避免上下文无限增长。
- `src/main.jsx`：新增“洞察”面板；回响里的后续线索可以一键填入下一次自由行动。
- `server.js`：导演层上下文新增 `recentReflections`，让 LLM 能读到角色的高层记忆。
- `tests/engine.test.js`：覆盖跨天反思生成和老存档迁移。
- `src/game/engine.js`：新增 `buildDailyPlans` 与 `selectRelevantContext`，每天生成三条可行动计划，并按当前行动检索相关计划、记忆和反思。
- `src/main.jsx`：新增“今日计划”面板，点击计划会设置行动类型、地点/NPC 和自由行动文本。
- `server.js`：导演层上下文新增 `plans` 和 `relevantContext`，让 LLM 不只看最近记录，也能看当前行动最相关的记忆。
- `src/main.jsx`：行动区新增“行动依据”预览，把 `selectRelevantContext` 命中的计划、记忆、洞察、羁绊和目标展示在执行按钮之前，让玩家能看到导演层将优先带入哪些长期上下文。
- `src/game/engine.js`：新增 `commitments` 状态；玩家从回响中选择后续线索时会记录承诺，匹配行动会兑现承诺，逾期会标记错过；兑现/失约会改变绑定 NPC 的信任，并写入可关联记忆和连续性 trace。
- `src/main.jsx`：新增“承诺”面板，展示待兑现、已兑现和错过的后续线索；待兑现承诺可一键填入下一次行动。
- `server.js`：导演提示和模型摘要新增 `commitments`，让 LLM 把玩家选择过的后续线索视为长期承诺，而不是一次性的按钮文案。
- `src/game/engine.js`：NPC 增加 `relationshipStage`、`stance` 和 `reflections`，社交行动会生成 NPC 对主角的个人判断。
- `src/main.jsx`：同伴面板展示关系阶段、当前立场和最近一次 NPC 反思。
- `server.js`：导演提示明确要求使用 NPC 关系阶段、立场和个人反思保持社交连续性。
- `src/game/data.js`：每个 NPC 增加 `hiddenGoal` 和 `concern`，作为不会立即暴露的长期动机。
- `src/game/engine.js`：当关系进入更高阶段或信任达到阈值时，触发 `bondEvents`，并把隐藏牵挂标记为已透露。
- `src/main.jsx`：同伴面板展示“未透露/已透露的牵挂”和最新羁绊事件，让关系推进有明确反馈。
- `server.js`：导演提示新增隐藏目标与羁绊事件约束，避免 LLM 在未解锁前直接泄露 NPC 私人动机。
- `src/game/engine.js`：`bondEvents` 新增 `followUp`，包含 `intent/actionType/locationId/npcId`，让羁绊节点能转成下一次可执行行动。
- `src/main.jsx`：同伴面板新增“追问牵挂/稳住关系”按钮，一键把羁绊 follow-up 填入自由行动，并同步设置地点和同伴。
- `server.js`：导演提示新增 `bondEvents.followUp` 说明，让 LLM 在玩家跟进羁绊时沿着具体关系线继续生成后果。
- `src/game/engine.js`：羁绊事件会启动 `questLines`，记录 `progress/dueDay/pressure/currentStep/risk/reward`；匹配同伴、地点、行动类型和文本关键词的行动会推进关系任务线。
- `src/game/engine.js`：任务线完成时会生成 `completion` 结算，并写入一条 `quest-complete` 羁绊事件，让完成结果能进入 UI、连续性 trace 和 LLM 上下文。
- `src/game/engine.js`：逾期未推进的任务会累积 `pressure`，达到阈值后生成 `quest-pressure/quest-strained` 羁绊事件，并提供“回应牵挂/修复羁绊”后续行动。
- `src/game/engine.js`：修复行动会被显式识别，不再依赖原任务的地点/行动类型碰巧匹配；修复后会降低压力、刷新期限、清空提醒，并回到正常任务推进。
- `src/main.jsx`：同伴面板展示“羁绊任务”的进度条、当前步骤、风险和奖励；完成后展示“羁绊完成”、结算文本和奖励。
- `src/main.jsx`：同伴面板展示任务期限、压力、提醒和“羁绊紧张”状态，让忽视关系线的代价可见。
- `src/main.jsx`：新增全局“羁绊任务”面板，按紧张度、压力、期限和进度排序显示所有 NPC 关系任务；面板提供全部、紧张、进行中、完成筛选，并提供推进、修复、沉淀入口。
- `server.js`：导演提示新增 `questLines` 说明，让 LLM 能把当前行动解释为关系任务线推进，并把完成态当作已确立的人际历史。
- `tests/engine.test.js`：新增羁绊任务创建、跟进行动推进、逾期压力、修复恢复、完成结算和老存档任务线迁移测试。
- `logger.js`：摘要日志新增 NPC 羁绊事件计数，用于后续评估关系弧线是否真的被触发。
- `src/game/engine.js`：新增 `continuityTraces`，每次行动记录检索了多少计划/记忆/反思、写入了多少记忆、是否推进目标、关系、NPC 反思和羁绊事件。
- `src/main.jsx`：新增“连续性”面板，让玩家和开发者能看到最近行动的连续性分数、证据摘要和关键锚点。
- `server.js`：导演层上下文新增 `recentContinuityTraces`，让 LLM 能沿着已经被证明产生长期影响的行动继续发展。
- `logger.js`：摘要日志新增连续性 trace 数量和最近连续性分数，用于后续观察开放式体验的状态粘性。
- `src/game/engine.js`：记忆条目新增 `actionType`、地点、NPC 和 `tags` 等结构化字段；相关上下文检索会使用这些 facets 提升匹配分数。
- `src/main.jsx`：记忆面板展示可读标签，让玩家能看到一条记忆为什么可能被后续行动召回。
- `server.js`：导演提示明确把记忆标签、地点、NPC 和行动类型当作检索线索使用，避免把记忆当平铺文本列表。
- `src/game/engine.js`：新记忆会根据共享标签、地点、NPC、行动类型和时间接近度自动生成 `relatedMemoryIds` / `relatedMemoryLabels`，形成轻量记忆图边。
- `src/main.jsx`：记忆面板展示“关联记忆”，把纯列表记忆升级为玩家可读的记忆链。
- `server.js`：导演提示新增记忆图边说明，让 LLM 能把 linked memories 当作支撑上下文。

## 下一步路线

1. 语义检索记忆：当前已有结构化 tags/facets 和规则加权，后续可接 embedding 或轻量 BM25，按地点、NPC、目标和行动意图检索最相关的记忆。
2. 计划质量升级：当前计划由规则生成，后续可让 LLM 在规则计划上润色，但保留 `actionType/locationId/npcId` 等结构化字段。
3. 羁绊任务线升级下一阶段：当前任务线已有进度、期限、压力、步骤、风险、奖励和完成结算，后续可以加入分支选择、专属场景和完成后的新长期动机。
4. 承诺分支升级：当前承诺已有创建、兑现、错过、NPC 信任影响、记忆写入和 trace 记录；后续可以继续细分私人动机分支和不同失约后果。
5. 连续性追踪升级：当前 trace 记录计数和锚点，记忆已有轻量图边；后续可以把 trace、commitments 和 memory links 合并成完整因果图，显示“哪条记忆影响了哪个目标/NPC 关系/羁绊事件/承诺”。

## 设计原则

- 记忆负责保存发生过什么。
- 记忆标签负责把文本经历变成可检索、可解释、可迁移的线索。
- 记忆关联负责把相似经历连成线索链，而不是让过去只停留在平铺列表里。
- 反思负责解释这些事情对角色意味着什么。
- 计划负责把意义转成下一步倾向。
- 承诺负责把玩家主动选择的后续线索转成可兑现、可错过、可追踪的长期状态。
- NPC 反思负责把玩家行动转成可延续的人际判断。
- 隐藏牵挂负责让 NPC 在被理解之前仍保有自己的长期动机。
- 羁绊事件负责把数值变化翻译成玩家能感知的人际节点。
- 羁绊 follow-up 负责把人际节点翻译成下一次可执行行动，让关系线不只停留在文本反馈里。
- NPC 关系任务线负责把单次 follow-up 扩展成多步长期弧线，并显式记录当前步骤、风险、奖励和进度。
- 羁绊压力负责让“被忽视”成为可见状态，而不是把所有关系任务永久冻结在等待中。
- 修复动作负责给延迟后果提供可追溯的恢复路径，避免玩家觉得关系损失是不可控惩罚。
- 任务完成结算负责把长线行动转换成可见的人际结果，避免玩家完成目标后只得到一段无状态文本。
- 连续性追踪负责验证每次行动是否真的使用并改变了长期状态。
- 玩家输入负责打断、改写或强化这些倾向。

这套结构的好处是：即使 LLM 输出有波动，游戏仍然有一个可解释、可测试、可回放的状态机作为骨架。

## 2026-06-27 更新：篇章叙事单元

新增 `chapters` 作为开放式养成的中长期叙事单元。每个篇章记录 premise、objective、currentBeat、nextHook、constraint、evidence、progress 和 pressure；每天结束时推进当前篇章，必要时归档完成篇章并开启下一段长期线索。

调研依据：

- [SNAP: A Plan-Driven Framework for Controllable Interactive Narrative Generation](https://arxiv.org/html/2601.11529v1)：提出把互动叙事拆成带边界的 Cell，并给每个 Cell 配显式 Plan，以降低长上下文中的时空漂移和叙事跑偏。
- [A Survey on Large Language Model-Based Game Agents](https://arxiv.org/html/2404.02039v3)：把 LLM 游戏 agent 的核心拆成 memory、reasoning 和 perception-action interface，并强调长期记忆要解决何时整合、如何组织和如何检索。
- [Memory for Autonomous LLM Agents](https://arxiv.org/html/2603.07670v1)：把 agent memory 描述为 write/manage/read 循环，并把 open-world game agents 的关键挑战归纳为长程规划和组合式复用。
- [LLM-enabled Social Agents](https://arxiv.org/html/2605.02335v1)：强调 social agent 的长期一致性应由外部记忆、关系模型、承诺和环境状态共同维护，而不是完全交给 LLM prompt 自己记住。

已落地：

- `src/game/data.js`：初始存档新增开局篇章。
- `src/game/engine.js`：新增篇章归一化、日终推进、完成归档、新篇章生成、篇章压力和行动上下文检索；continuity trace 新增 `retrievedChapters` 和篇章锚点。
- `src/main.jsx`：新增“篇章”面板，展示当前篇章、进度、压力、下一步和证据，可一键填入行动。
- `server.js`：导演提示和模型摘要新增 `chapters`，让 LLM 把当前行动放进活跃篇章中解释。
- `tests/engine.test.js` / `tests/logger.test.js`：覆盖旧档迁移、日终篇章推进、上下文命中、trace 锚点和日志摘要。

## 2026-06-27 更新：中文线索检索与命中解释

在 `selectRelevantContext` 中新增轻量中文 cue overlap：从自由行动、地点、NPC 和 tags 中抽取中文 2-4 字线索，并与记忆、计划、篇章、承诺、洞察文本做加权重合评分。返回的上下文条目新增 `matchReasons` 与 `matchedTerms`，前端“行动依据”面板会显示“命中”原因，方便玩家和开发者判断导演层为什么拿到了某条长期上下文。

调研依据：

- [Memory is Reconstructed, Not Retrieved: Graph Memory for LLM Agents](https://arxiv.org/html/2606.06036v1)：提出 Cue-Tag-Content graph，让 tag 成为 cue 与 content 之间的语义桥，避免只做静态 top-k 检索。
- [Are We Ready For An Agent-Native Memory System?](https://arxiv.org/html/2606.24775v1)：把 agent memory 拆成 representation/storage、extraction、retrieval/routing 和 maintenance，说明检索路由需要作为独立模块观察和优化。
- [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/html/2502.12110v1)：强调记忆条目应包含 keywords/tags 等结构化属性，并通过动态链接形成可演化的知识网络。

本轮没有直接引入向量库或外部搜索服务，原因是当前项目仍是浏览器存档 + 小型 Node 服务原型；先用可测试、可解释、无依赖的 cue overlap 补足中文自由文本匹配，后续可以把同一套 `matchReasons/matchedTerms` 接到 BM25、embedding 或图遍历服务上。

## 2026-06-27 更新：记忆主题与维护层

新增 `memoryTopics`，把零散事件记忆按承诺、NPC、地点、行动类型和可读标签聚合成轻量主题文档。每个主题保存标题、摘要、证据片段、关联记忆 ID、标签、强度、创建/更新时间和可检索 facet；`selectRelevantContext` 会把命中的主题和单条记忆一起返回，连续性 trace 也会记录本次行动读到了多少个记忆主题。

调研依据：

- [Infini Memory: Maintainable Topic Documents for Long-Term LLM Agent Memory](https://arxiv.org/html/2606.10677v1)：把 agent memory 组织成可维护的 topic documents，并用缓冲区、元数据和 consolidation 解决长期记忆膨胀问题；本轮实现先落地“主题文档 + 证据片段 + 检索命中”，后续再补真正的增量维护队列。
- [MemForest: Efficient Agent Memory System with Hierarchical Temporal Indexing](https://arxiv.org/html/2605.23986v1)：强调长期记忆需要层次化、时间感知的索引，而不是只按最近若干条记录读取；这支持把 `memoryTopics` 的 `createdDay/updatedDay/strength` 暴露给检索和 UI。
- [STALE: Can LLM Agents Know When Their Memories Are No Longer Valid?](https://arxiv.org/html/2605.06527v1)：指出长期记忆系统要识别旧证据何时被新状态覆盖；当前先保留每个主题的证据链和更新时间，为后续“过期/被改写”判断留位置。

已落地：

- `src/game/data.js`：初始存档新增开局记忆主题。
- `src/game/engine.js`：新增记忆主题归一化、构建、分组和检索；每次行动后根据当前记忆重建轻量主题；continuity trace 记录 `retrievedMemoryTopics` 和主题锚点。
- `src/main.jsx` / `src/styles.css`：新增“记忆主题”面板，展示主题强度、证据数量、标签和最近证据片段；行动依据里新增“主题”分组。
- `server.js`：导演层上下文新增 `memoryTopics`，并在系统提示中说明主题文档是压缩证据组，具体细节仍应回看单条记忆。
- `tests/engine.test.js` / `tests/logger.test.js`：覆盖旧档迁移、导入归一化、中文线索命中、连续性 trace 和日志摘要。

边界说明：这不是完整的 Infini Memory 复刻。当前版本是可测试、无外部依赖的轻量 consolidation 层，会从当前记忆重建最多 12 个主题，并提供基础 freshness / maintenanceStatus；后续如果记忆量变大，再引入增量 buffer、语义级冲突判断、主题拆分/合并和向量或图索引。

## 2026-06-27 更新：记忆主题新鲜度与过期降权

在 `memoryTopics` 上新增 `freshness`、`maintenanceStatus`、`maintenanceLabel`、`maintenanceReason`、`nextMaintenanceAction`、`ageDays` 和 `staleEvidenceCount`。主题会按最近证据日期、旧证据数量和兑现/错过/修复/结算等改写信号计算维护状态：

- `active`：证据足够新，可以直接作为当前行动依据。
- `watch`：已经一段时间没有新证据，引用时需要结合最近行动判断。
- `stale`：旧证据太久没有刷新，检索时会降权，导演层应先确认再使用。
- `revised`：主题包含兑现、错过、修复或结算证据，应优先采用最新证据。

调研依据：

- [STALE: Can LLM Agents Know When Their Memories Are No Longer Valid?](https://arxiv.org/html/2605.06527v1)：把长期记忆重构为 latent state tracking，并指出系统常见失败不是拿不到新证据，而是拿到后仍按旧状态行动；本轮先做可见的新鲜度和过期降权，避免旧主题静默成为当前事实。
- [Infini Memory: Maintainable Topic Documents for Long-Term LLM Agent Memory](https://arxiv.org/html/2606.10677v1)：强调 topic documents 应支持 evidence aggregation、fact revision 和 maintenance；本轮把维护状态挂在主题文档上，并让 UI、日志和导演提示都能看到。
- [A Survey on Large Language Model-Based Game Agents](https://arxiv.org/html/2404.02039v5)：指出冒险/角色扮演/沙盒类游戏分别需要 stateful world modeling、role fidelity 和 open-ended goal progression；记忆新鲜度能帮助长期世界状态和角色关系不被旧证据拖偏。

已落地：

- `src/game/engine.js`：主题构建和归一化时计算维护状态；相关上下文检索会按 `freshness` 加权，并对 `watch/stale` 主题降权。
- `src/main.jsx` / `src/styles.css`：记忆主题卡新增维护状态说明和“新鲜度”进度条，不再只展示强度。
- `server.js`：导演提示说明 `watch/stale/revised` 的使用方式，避免 LLM 把旧主题当作当前事实。
- `logger.js`：状态摘要新增 `staleMemoryTopicCount` 和 `watchMemoryTopicCount`。
- `tests/engine.test.js` / `tests/logger.test.js`：新增旧证据被标记为 `stale` 的测试，并覆盖日志摘要字段。

## 2026-06-27 更新：世界发现与可复用世界知识

新增 `worldFacts`，把行动中获得的地点、NPC 和世界规则层知识从主观记忆中拆出来，作为可检索、可展示、可进入导演层上下文的结构化世界知识。每条发现保存标题、正文、地点、NPC、行动类型、标签、证据、置信度和状态；重复行动命中同一发现会提高置信度，旧存档会从既有记忆里迁移出基础发现。

调研依据：

- [AgentOdyssey: Open-Ended Long-Horizon Text Game Generation for Test-Time Continual Learning Agents](https://arxiv.org/html/2606.24893v1)：把开放式长程文本游戏中的关键能力拆成 exploration、episodic memory、world knowledge acquisition、skill learning 和 long-horizon planning；本轮对应补上 world knowledge acquisition 的状态层。
- [A Survey on Large Language Model-Based Game Agents](https://arxiv.org/html/2404.02039v5)：指出冒险游戏的核心挑战是 stateful world modeling，需要维护不断演化的环境记录和依赖；`worldFacts` 让世界知识不再只藏在最近日记或主观记忆里。
- [A Dependency-Driven Prompt Pipeline for Coherent RPG Generation](https://arxiv.org/html/2604.25482v1)：强调复杂 RPG 内容需要结构化中间表示和显式依赖流；`worldFacts` 给地点、NPC、篇章和任务线之间的后续依赖提供更稳定的事实层。

已落地：

- `src/game/data.js`：初始存档新增第一条世界发现。
- `src/game/engine.js`：新增世界发现归一化、旧档迁移、行动后更新、相关上下文检索和连续性 trace 计数/锚点。
- `src/main.jsx` / `src/styles.css`：新增“世界发现”面板，展示置信度、状态、标签和证据；“行动依据”和“连续性”面板能显示命中的世界发现。
- `server.js`：导演提示和模型摘要新增 `worldFacts`，让 LLM 区分世界层事实、主观记忆和记忆主题。
- `logger.js`：状态摘要新增 `worldFactCount` 和 `confirmedWorldFactCount`。
- `tests/engine.test.js` / `tests/logger.test.js`：覆盖行动写入、旧档迁移、行动依据检索和日志摘要。

边界说明：当前 `worldFacts` 仍是轻量规则抽取，不做复杂实体消歧或矛盾推理；它先承担“把已学到的世界知识显式化”的职责。后续可把它和篇章、羁绊任务线、记忆主题合成依赖图，显示某条世界发现如何支撑后续目标或关系分支。

## 2026-06-27 更新：能力库与可复用技能成长

新增 `hero.skills`，把重复行动沉淀为可复用能力。每项能力保存名称、行动类型、等级、进度、总经验、标签、证据、当前状态和下一里程碑；行动后会推进匹配能力，必要时创建新能力，并把能力命中写入行动依据、导演上下文和连续性 trace。

调研依据：

- [AgentOdyssey: Open-Ended Long-Horizon Text Game Generation for Test-Time Continual Learning Agents](https://arxiv.org/html/2606.24893v1)：把开放式长程文本游戏中的能力拆成 exploration、episodic memory、world knowledge acquisition、skill learning 和 long-horizon planning；本轮对应补上 skill learning 的状态层。
- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291)：强调 lifelong skill library 能让 agent 把成功经验积累成可复用行为程序；本项目先用等级、证据和检索命中实现轻量技能库，而不是直接生成代码技能。
- [A Survey on Large Language Model-Based Game Agents](https://arxiv.org/html/2404.02039v5)：把 learning 作为游戏 agent 的核心组件之一；养成游戏如果只改数值而不记录“能力如何形成”，长期成长就缺少可解释锚点。

已落地：

- `src/game/data.js`：初始主角新增星图判读、共情沟通、传闻追踪三项能力。
- `src/game/engine.js`：新增技能定义、归一化、旧档迁移、行动后技能推进、等级突破、技能检索和 continuity trace 信号。
- `src/main.jsx` / `src/styles.css`：新增“能力库”面板，展示等级、进度、状态、下一里程碑、标签和证据；行动依据和连续性面板显示命中的能力。
- `server.js`：导演提示和模型摘要新增 `skills`，让 LLM 能把角色当前能力当成已学习的长期状态。
- `logger.js`：状态摘要新增 `skillCount` 和 `skillLevelTotal`。
- `tests/engine.test.js` / `tests/logger.test.js`：覆盖行动推进能力、旧档迁移、技能检索和日志摘要。

边界说明：当前能力成长是规则型经验系统，不是复杂技能树，也不生成可执行策略。它先解决“重复行动能否沉淀为可见、可检索、可解释的成长”这个核心问题；后续可以把技能等级作为行动解锁、任务分支和世界发现置信度的输入。

## 2026-06-27 更新：行动机会与状态驱动规划入口

新增 `buildActionOpportunities`，把当前状态里的开放循环整理成带优先级的行动入口。机会来源包括：待兑现承诺、羁绊任务压力、需复核记忆主题、待确认世界发现、接近突破的能力、篇章压力。每日计划会吸收一个不重复的高优先级机会；行动依据、导演上下文和连续性 trace 也会看到机会命中。

调研依据：

- [Why Reasoning Fails to Plan: A Planning-Centric Analysis of Long-Horizon Decision Making in LLM Agents](https://arxiv.org/html/2601.22311v1)：指出只靠局部 step-wise reasoning 容易变成短视策略，长程任务需要显式计划机制和长期评估；行动机会层把当前最重要的开放循环先显式排序，避免纯靠最近文本反应。
- [SNAP: A Plan-Driven Framework for Controllable Interactive Narrative Generation](https://arxiv.org/html/2601.11529v1)：用带边界的叙事 Cell 和显式 Plan 控制互动叙事漂移；本轮把篇章、承诺、羁绊、记忆和世界发现都转成可执行机会，继续强化“计划先于生成”。
- [Affordances Enable Partial World Modeling with LLMs](https://arxiv.org/html/2602.10390v1)：把 affordances 视为环境和 agent 交界处的行动可能性；`buildActionOpportunities` 在当前规则层里承担同样职责：把状态事实转成“现在可以做什么”。
- [AgentOdyssey](https://arxiv.org/html/2606.24893v1)：强调开放式长程文本游戏需要在探索、世界知识、技能、记忆和长期计划之间持续切换；机会层把这些子系统汇总成统一行动入口。

已落地：

- `src/game/engine.js`：新增 `buildActionOpportunities`、机会去重、机会转计划、机会检索和 continuity trace 信号。
- `src/main.jsx` / `src/styles.css`：新增“行动机会”面板，展示优先级、来源、意图、原因和标签；底部导航增加“机会”入口。
- `server.js`：导演提示和模型摘要新增 `opportunities`，让 LLM 知道当前最值得处理的开放循环。
- `tests/engine.test.js`：覆盖机会生成、计划吸收和行动依据检索。
- `package.json`：新增 `screenshot:opportunities` 视觉验收脚本。

边界说明：机会层目前是规则排序，不是搜索树或 RL planner；它优先解决“状态越来越多后玩家和导演层如何知道下一步最值得做什么”。后续可以把机会完成率、玩家采纳率和连续性分数结合起来，形成更强的长期规划评估。

## 2026-06-27 更新：体验诊断与长线评估指标

新增 `buildExperienceDiagnostics`，把开放式养成的长期状态整理成一组可读的健康指标：连续性、行动多样性、开放循环、记忆健康、成长势能和世界知识。它不写入存档，只从现有 `continuityTraces`、`memories`、`commitments`、`questLines`、`memoryTopics`、`worldFacts`、`hero.skills` 和 `buildActionOpportunities` 派生分数、警告和下一步建议。这样可以在 UI 上直接看到当前体验是否正在形成正反馈，还是已经变成碎片化行动。

调研依据：
- [AgentOdyssey: Open-Ended Long-Horizon Text Game Generation for Test-Time Continual Learning Agents](https://arxiv.org/html/2606.24893v1)：把开放式长程文本游戏 agent 的关键能力拆成 exploration、episodic memory、world knowledge acquisition、skill learning 和 long-horizon planning，并提出除游戏进度外，还要诊断世界知识、情景记忆、对象/行动探索和行动多样性。本轮诊断面板把这些能力映射到项目已有状态层。
- [AgentOdyssey project page](https://agentodyssey.github.io/)：强调 test-time continual learning 需要持续探索、保留相关情景经验、学习世界知识与技能，并管理数百步的子目标；这支持把“当前是否还能长期推进”做成实时健康仪表，而不是只看最近一次回响文案。
- [Evaluation and Benchmarking of LLM Agents: A Survey](https://arxiv.org/html/2507.21504v1)：在长程 agent 评估里列出 progress rate、step success rate、memory/context retention、factual recall 和 consistency score 等指标；本项目先用轻量规则近似这些维度，尤其是 continuity trace、开放循环负载和记忆新鲜度。
- [EMemBench: Interactive Benchmarking of Episodic Memory for VLM Agents](https://openreview.net/forum?id=dFQLfagXEK)：提出从 agent 自身轨迹生成可验证的长程记忆问题，覆盖单跳/多跳、时间、空间、逻辑等能力；这说明仅保存最近事件不够，后续诊断可以继续升级为“能否回答自己轨迹里的问题”。

已落地：

- `src/game/engine.js`：新增 `buildExperienceDiagnostics`，从现有状态派生综合分、六类指标、警告、建议和来源计数。
- `src/main.jsx` / `src/styles.css`：新增“体验诊断”面板，展示健康分、连续性、行动多样性、开放循环、记忆健康、成长势能和世界知识。
- `server.js`：导演层上下文新增 `experienceDiagnostics`，并在系统提示里说明诊断是节奏指导，不是新剧情事实。
- `tests/engine.test.js`：覆盖初始局面的诊断结构，以及过期记忆和开放循环过载时的警告能力。
- `package.json`：新增 `screenshot:diagnostics` 视觉验收脚本。

边界说明：当前诊断是规则型派生层，不是离线评测基准，也不替代真实玩家反馈。它先解决“开发者和玩家能否看到开放式系统的健康度”这个问题；后续可以把机会采纳率、承诺兑现率、trace 分数趋势、记忆问答正确率和 LLM 生成质量结合起来，形成更完整的长期体验评估。
