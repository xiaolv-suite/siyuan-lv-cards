# [TASK-20261031-github-benchmark-fusion] 小驴闪卡 · GitHub 三大顶级对标产品深度调研与融合方案

- **任务状态**: `completed`
- **目标插件**: `小驴闪卡 (siyuan-flashcard)`
- **仓库路径**: `D:\思源插件\小驴闪卡`
- **对标产品**:
  1. [`ankitects/anki`](https://github.com/ankitects/anki) — 全球间隔重复领域权威标准（水蛭卡识别与兄弟卡埋藏标杆）
  2. [`open-spaced-repetition/fsrs4anki`](https://github.com/open-spaced-repetition/fsrs4anki) — 现代自由间隔重复算法（DSR 模型、负载平滑与临时抱佛脚标杆）
  3. [`st3v3nmw/obsidian-spaced-repetition`](https://github.com/st3v3nmw/obsidian-spaced-repetition) — 双链笔记原生标题面包屑上下文与多语法制卡标杆

---

## 一、 三大参考产品深度调研剖析

### 1. `ankitects/anki` 核心精华
- **水蛭卡自动监测与分流 (Leech Card Detection & Remedy)**：
  - 痛点：有些卡片因为写得太笼统或包含过多信息，导致用户反复背、反复忘（Lapse 次数 `>= 6`），占用了大量复习时间却毫无效果（称为“水蛭卡 Leech”）。
  - 解法：自动识别连续遗忘超阈值的卡片，打上 `🩸 水蛭卡 (Leech)` 警示徽标，并提示用户“该卡颗粒度过大，建议拆分为 2 张子卡或补充记忆口诀”。
- **同源兄弟卡自动埋藏 (Sibling Burying)**：来自同一个思源块或同一段挖空（Cloze 1 / Cloze 2）的多张卡片，不在同一天连续出现，防止因为刚看过上一张而产生短期视觉作弊记忆。

### 2. `open-spaced-repetition/fsrs4anki` 核心精华
- **可提取性（Retrievability, $R$）与目标留存率调节**：直观展示当前卡组的平均记忆留存率（如 `90%`），并预测未来 7 天的每日到期复习量（Workload Forecast）。
- **周末减负与复习负载平滑 (Load Balancer / Easy Days)**：在排期时若某一天积压卡片过多，自动在前后 $\pm 1\sim2$ 天内智能削峰填谷，避免某天突然爆发 300 张卡。

### 3. `st3v3nmw/obsidian-spaced-repetition` 核心精华
- **笔记标题层级面包屑上下文 (Automatic Heading Breadcrumbs)**：复习单张原子卡片时，顶部始终呈现淡雅的来源路径面包屑（如 `📄 计算机网络 > H2 传输层 > H3 TCP 三次握手`），彻底解决单张卡片脱离上下文后“不知道在问哪个领域”的失忆感。
- **Cram 考前突击模式 (Algorithm-Free Cram Session)**：允许用户随时按标签或来源文档拉起一轮“不影响正式排期算法”的考前强行过筛复习。

---

## 二、 适合融合进「小驴闪卡」的落地改造清单

### 改造项 A：「水蛭卡（Leech）自动预警」与「渐进式线索揭示（Graded Cueing）」（借鉴 Anki + TextFold）
- **涉及目录**：`src/core/`、`src/features/`、`src/ui/`
- **具体内容**：
  1. 当卡片遗忘重来次数 `lapses >= 5` 时，自动标记为 `isLeech: true`，在复习界面顶部显示「🩸 水蛭卡预警：已遗忘 N 次，建议精简问题或添加助记提示」。
  2. 融合 TextFold 渐进线索理念：正面卡壳时按 `H` 键不直接翻看完整答案，而是先揭示第 1 层线索（首字/关键词挖空提示或来源小标题），再按 `Space` 翻开完整背面。

### 改造项 B：卡片顶部「思源标题面包屑上下文」与「同源兄弟卡避让」（借鉴 obsidian-spaced-repetition + Anki）
- **涉及目录**：`src/core/`、`src/ui/`
- **具体内容**：
  1. 复习卡片时顶部渲染来源文档与父级标题路径面包屑，点击可一键在思源中定位原块。
  2. 构建今日复习队列时，若多张卡片共享同一个 `sourceBlockId` 或相邻段落，自动将同源兄弟卡错开排列（或延迟到队尾/次日），避免背诵串味。

### 改造项 C：未来 7 日复习负载预报与「Cram 突击快刷模式」（借鉴 FSRS4Anki + obsidian-spaced-repetition）
- **涉及目录**：`src/features/`、`src/ui/`
- **具体内容**：
  1. 在闪卡总览面板展示未来 7 天每日到期卡片柱状小图，支持开启「负载平滑」。
  2. 新增「Cram 突击快刷（不改排期）」入口：支持选定某个卡组或标签，只管快速过一遍，不污染正常复习间隔。

---

## 三、 质量门禁与验收标准 (Quality Gate)
1. 新增单元测试覆盖水蛭卡判定、同源兄弟卡队列错峰排序、7 日负载预测计算；
2. 运行 `pnpm test` 确保全量测试 100% 通过；
3. 运行 `pnpm build` 确保生产打包零错误；
4. 严格本地 Git 提交，禁止 `git push`。

---

## 四、 实施落地记录 (2026-10-31)
1. **改造项 A 已完成**：
   - 在 `src/core/revlog.ts` 中实现 `isLeechCard` 纯判定函数（lapses >= 5）；
   - 在 `src/core/review-queue-pipeline.ts` 中构建队列时自动打上 `isLeech` 标识；
   - 在 `src/ui/review.svelte` 卡片顶部展示水蛭卡预警横幅（`role="alert" aria-live="assertive"`）；
   - 在 `src/core/review-shortcuts.ts` 强化 H / h 键支持，在 `src/core/hint-ladder.ts` 实现 Graded Cueing（首字与长度线索），正面按 H 推进第 1 层线索，按 Space 翻开背面。
2. **改造项 B 已完成**：
   - 在 `src/ui/review/ReviewCardBreadcrumbs.svelte` 增加定位原块按钮与点击定位原块动作；
   - 在 `src/core/sibling-cards.ts` 统一支持 `sourceBlockId` 与 `blockID` 提取；
   - 在 `src/core/review-queue-pipeline.ts` 中当未启用埋藏时默认自动启用 `disperseSiblings` 错峰排列同源兄弟卡。
3. **改造项 C 已完成**：
   - 在 `src/core/forecast.ts` 中实现 `get7DayForecast` 与 FSRS 削峰填谷 `smoothForecastLoad`；
   - 在 `src/ui/dashboard.svelte` 总览面板中新增未来 7 日复习负载预报柱状图，支持一键切换负载平滑；
   - 在 `src/ui/dashboard.svelte` 和卡组列表新增「Cram 考前突击快刷（不改排期）」入口，并在 `src/ui/review.svelte` 中跳过修改内核排期，确保算法零污染。
4. **门禁与测试**：
   - 新增 `tests/benchmark-fusion.spec.ts` 并更新相关单测；全量 290 个测试套件、2333 项测试 100% 通过；`pnpm check` 0 错误 0 警告；`pnpm build` 生产打包完全通过。
   - 严格本地 Git 提交，无远程推送。
