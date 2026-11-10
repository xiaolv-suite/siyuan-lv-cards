# Changelog

## v0.233.1 · 2026-11-09

- 外部摘录与原子制卡分路，确切新对象回执、稳定请求身份与持久恢复，粗摘录不再写入FSRS。
- 未知创建只核对原目标，备份/恢复与接收用同源锁；拒绝丢失或降级当前请求的旧账本。
- 修复遮挡编辑器手机头部排版；验证范围与真宿主待验边界见 docs/2026-11-09-外部制卡契约.md。

## v0.233.0 2026-11-04 · Epoch 7 全生态协同基础设施终局落地（小驴罗盘/穿透搜索/错题自动制卡/全生态联合灾备/自省徽章/54项E2E全绿）

- **新增 (Added)**：
  - **接入小驴罗盘家族极速弹射坞（`lvLaunchpad` · Protocol v1.4.0）**：
    - **顶栏收敛与极速直达**：在 `onload` 注册专属罗盘卡片，内置 4 项核心二级业务行动（开始今日复习会话、从选区抽取制卡、重新计算排期、管理核心卡包）；
    - **角标动态自适应**：角标按到期卡数自动同步（`${due} 待复习`），未到期时自动降噪收起；
  - **接入全生态万物穿透搜索（`lvOmnisearch` · Protocol v1.6.0）**：
    - **闪卡与牌组检索切面**：注册 `siyuan-lv-cards` 检索提供者，支持对卡包名称与闪卡块内容（`content` 与 `markdown` 双字段）毫秒级穿透命中与高亮摘要呈现；
    - **结果一键直达**：点击卡包直达卡包管理，点击闪卡块直达单卡/范围复习；
  - **接入跨插件智能自动化联动引擎（`lvAutomation` · Protocol v1.6.0）**：
    - **《小驴考试》错题自动制卡规则 (`rule-exam-to-cards`)**：监听 `siyuan-exam` 错题事件（`wrong-question`），自动解析题干、答案与解析，生成原生 `==答案==` 挖空问答卡写入思源并推入卡池；
  - **接入全生态一键联合灾备（`lvBackup` · Protocol v1.3.0）**：
    - **全家桶一键联合备份/恢复**：向灾备总线注册备份与恢复切面，`dumpData()` 汇聚全部 22 槽持久化数据，`restoreData()` 采用逆序补偿回滚事务原子恢复并刷新共享缓存；
  - **接入全生态自省指示徽章（`lvEcosystem` · Protocol v1.3.0）**：
    - **仪表盘与设置中心底部胶囊**：动态展示联结插件数与今日活动总量，呈现协同自省健康度；
  - **接入去中心化统一通知中心（`lvNotify` · Protocol v1.0.0）**：
    - **批量制卡折叠计数**：大批量制卡与进度通知自动合并为 `×2`、`×3` 折叠微胶囊；
    - **每日复习卡片化**：搭载【开始复习】直达按钮与 15m/1h 稍后提醒/今日免打扰延期；
    - **复习评分原位微反馈**：移除作答期间的 Toast 打扰，采用原位微动效（`notifyInline`）；
  - **系统资源与并发加固（`lvTicker` & `withDocLock`）**：
    - 定时器收敛由 `lvTicker.onMinute` 调度，失焦自动 60s 节电；零点准点广播 `onDateCross` 滚动暂缓卡并重算 Due 池；全链路追加块操作接入 `withDocLock` 异步写锁排队；Esc 栈捕获阶段仲裁让渡前台模态弹窗；
  - **统一 AI 网关与今日活动流（`lvAi` & `lvActivity`）**：
    - `chatCompletions` 全面委托 `lvAi.chat`，共享全生态 API Key 与令牌桶并发限流；复习完成屏自动广播 `lvActivity.record`，支持一键汇编 Daily Note。
  - **全景端到端自动化走查套件全面扩容至 54 项（`scripts/e2e-isolated.mjs`）**：
    - 走查项从 49 项扩充至 54 项，涵盖生态徽章感知、通知 Coordinator 协议就绪、罗盘二级行动调度、穿透搜索切面检索（29+ 牌组命中）与自动化错题自动制卡规则，54/54 全部通过。

## v0.232.0 2026-11-03 · 公共集市全量能力深化（对齐《小驴考试》公共集市互通设计规范）、卡包品质画像、闪卡篮挑选、增量差量无损合并与49项端到端走查

- **新增 (Added)**：
  - **卡包品质画像分析引擎（`src/core/marketplace-cart.ts`）**：每一套集市卡包均内嵌卡型构成比例条（单选/多选/判断/填空/问答）、FSRS 初始难度阶梯条（基础★1-2、进阶★3-4、拔高★5）与思路拓展/助记便签覆盖率看板；
  - **跨学科闪卡篮挑卡机制（`src/core/marketplace-cart.ts` & `src/ui/marketplace-studio.svelte`）**：试看中支持单卡点选或全包加入「闪卡篮」；常驻屏幕悬浮操作抽屉，支持一键清空、单卡移除、跨学科一键打包为 `.lvcards` 分享包或直接一键克隆入库开练；
  - **增量差量更新与无损合并（`src/core/marketplace-sync.ts`）**：比对本地已安装卡包与远端新版本，支持查看新增卡数与修订卡数，一键执行非破坏性合并，**绝对保留用户历史复习排期、掌握状态与 FSRS 记忆参数**；
  - **卡包发布脱敏扫描（`src/core/marketplace-sync.ts`）**：自动排查本地文件绝对路径与思源块私有链接，确保卡包分享与发布合规；
  - **全景端到端自动化走查套件全面扩容（`scripts/e2e-isolated.mjs`）**：走查项从 47 项扩充至 49 项，新增品质画像面板与闪卡篮挑卡抽屉无头走查，49/49 全部通过。

## v0.231.0 2026-11-02 · 题库与闪卡公共集市（对齐小驴考试架构）、8大学科零版权公版卡包、第三方网络订阅源机制与闪卡原生FSRS一键入库

- **新增 (Added)**：
  - **上线「闪卡与知识公共集市」一级常驻入口（`src/ui/hub.svelte` & `src/ui/marketplace-studio.svelte`）**：
    - **高层级入口常驻**：将「集市」提升至主导航栏核心位置（与“今日”、“卡库”、“制卡”、“学习”并列），不再深藏于子菜单；
    - **沉浸式集市工作台 (`MarketplaceStudio`)**：提供大屏宽幅响应式卡片网格，展示 8 大学科体系的精选公版卡组，包含全域统计面板（8 大核心学科、150+ 深度记忆卡、100% 零版权公版认证）；
  - **对齐《小驴考试》公共集市协议契约与零服务器中立架构（`src/core/marketplace.ts` & `src/core/marketplace-service.ts`）**：
    - **中立轻量目录规范**：直接复用《小驴考试》的核心 `MarketplaceCatalog` 与 `MarketplaceItem` 契约，客户端直连拉取，官方零集中服务器，零存储成本、零版权争议；
    - **开放式第三方网络订阅源 (URL)**：支持类似《开源阅读》书源机制，用户可自行输入 GitHub Gist、Gitee 或自建服务器的 `catalog.json` 订阅直链，思源端侧安全拉取并清洗；
    - **8 大公版精选学科卡包**：高数公式、计算机408、英语词汇、法考民法典、经典物理、数据结构、近现代史、形式逻辑开箱即用；
  - **闪卡原生化特性与 FSRS 一键入库（`src/core/marketplace-service.ts` & `src/ui/marketplace-studio.svelte`）**：
    - **闪卡交互式翻面试看**：集市卡片详情与试看面板侧重展示闪卡特性——正面问题/线索、背面答案、记忆便签（memo），支持点击交互式翻面动画与 FSRS 初始难度预览；
    - **原生卡组一键入库**：点击「获取入库」直接在思源中建立对应闪卡卡组，自动去重写入思源文档并绑定 FSRS 调度参数，开箱即开练；
    - **双向生态无损互通与分享**：严格基于 `lvcards.v1` 协议流转，支持一键导出 `.lvcards` 单文件包，与《小驴考试》实现 100% 零损互读互通；
  - **全景端到端自动化走查套件全面扩容（`scripts/e2e-isolated.mjs`）**：走查项从 42 项扩充至 47 项，覆盖集市一级工作台挂载、全域统计看板、8大学科分类、卡包网格与闪卡交互式翻面试看，47/47 全部通过。

## v0.230.0 2026-11-01 · 小驴全生态深度联动（考试/打卡/常用/雷切/拾遗）、AI制卡体验与参数扩充、卡库先卡包后明细层级重构与42项端到端全绿走查

- **新增 (Added)**：
  - **小驴全生态（6大插件）深度契约与双向联动闭环（`src/libs/ecosystem-bridge-kit.ts` & `src/api/external-bridge.ts`）**：
    - **小驴考试 (`siyuan-exam`)**：首屏看板自动感知其考期设置，生成考期倒计时冲刺胶囊；卡包列表中自动识别 `小驴考试/*` 题库并显示专属徽章与直达练习台按钮；复习评分达到 Good/Easy（rating≥3）时自动联动攻克并归档考试错题本中的在册错题；
    - **小驴打卡 (`siyuan-checkin`)**：落地零配置智能自动打卡，完成复习时自动探查「闪卡复习」打卡项并记录复习卡数与命中率；设置页自动推荐对应打卡项；
    - **小驴常用 (`xiaolv-common`)**：AI 制卡工坊支持一键拉取常用语片段与精选收藏；对外提供动态宏（`getTodaySummaryText`）与规范日复习待办；
    - **小驴雷切 (`siyuan-speed-switch`)**：稳健支持 Apple WidgetKit Bento 3.0 小组件规范，自动适配流转吞吐；
    - **小驴拾遗 (`siyuan-glean`)**：卡包列表中自动标注「小驴拾遗」来源徽章。
  - **AI 制卡工坊交互体验与参数丰富（`src/ui/ai-wizard.svelte`）**：新增 5 大出题侧重风格单选标签（核心概念、对比辨析、原理机制、考试高频、实战应用）及视觉提示卡；新增快速示例一键填入与格式规整清洗工具链；全面支持从编辑器直接拖拽文本块落入素材区；
  - **卡库与卡包层次结构演进（`src/ui/hub.svelte` & `src/ui/manager.svelte`）**：重组卡库子导航标签为「卡包管理 > 闪卡明细 > 维护债务」，符合先看卡包再看卡片的自然直觉；新增单卡包钻取控制台（`lv-mgr-deck-scope`），支持返回列表、本包直接复习/突击与卡数统计；
  - **全景端到端自动化走查套件全面扩容（`scripts/e2e-isolated.mjs`）**：走查项从 37 项扩充至 42 项，覆盖卡库层级、钻取控制台、生态徽章、AI 制卡参数与规整工具，42/42 全部通过。
- **优化与细节打磨 (Changed)**：
  - **今日看板整体视觉统一与空态优化（`src/ui/dashboard.svelte`）**：将「我的卡组」封装入标准 `<LvSection>` 容器；移除今日已复习的微型迷你图使4格指标完全对齐；胶囊化待处理空态底栏并居中深度统计折叠按钮，消除大面积留白；
  - **存量卡包扫描去重（`src/core/deck-management.ts`）**：扫描时同时校验活跃原生卡包的 ID 与名称，彻底解决已导入卡包被重复识别的问题。

## v0.229.0 2026-11-01 · 全景隔离端到端自动化走查（pnpm e2e:isolated）、制卡与卡包管理关键交互与生态兼容收敛

- **新增 (Added)**：
  - **全景端到端自动化走查套件（`scripts/e2e-isolated.mjs` & `pnpm e2e:isolated`）**：支持自动探测并附着 43930 隔离环境或自起无头内核，覆盖内核鉴权、静态 Chunk 契约、Riff 完整复习闭环、文档联动与属性镜像（星标/水蛭/错因/SQL 动态看板）、生态插件语法兼容，并通过真实无头 Chrome 浏览器深度执行 14 项 UI 布局、溢出检测、按钮交互与零控制台错误全景走查；
  - **卡包合并源卡包清理选项（`src/ui/deck-manager.svelte`）**：合并卡包抽屉新增「合并后删除源卡包」复选框与联动支持，合并完成自动清扫源卡包并刷新列表；重命名输入框支持 Escape 快捷取消。
- **修复 (Fixed)**：
  - **选择题移除选项时正确答案键未平移重排的缺陷（`src/ui/quick-card.svelte`）**：当移除前面的选项时，正确答案键列表自动下移平移索引，避免答案指向错位；
  - **制卡必备要素门禁失败时的精准自动聚焦导流（`src/ui/quick-card.svelte`）**：完善单选/多选/判断题缺失选项或答案键时的焦点定位，自动高亮并聚焦至选项输入框或选项键；
  - **Anki 多重挖空答案串联提取与遮罩嵌套防护（`src/core/delimited-qa.ts`）**：同一卡片中包含多处 Anki 挖空标记时，规范提取所有挖空答案，并在运行时 DOM 遮罩中排除已有遮罩节点避免嵌套；
  - **IAL 属性正则表达式兼容性加固（`src/core/deck-management.ts`）**：全面支持无引号、单引号与双引号格式的 `custom-riff-decks`、`custom-flashcard-deck` 与 `custom-riff-title` 属性提取。

## v0.228.0 2026-11-01 · 思源闪卡生态插件格式深度兼容（Anki挖空、自定义题面标题、多卡包逗号映射与内置默认卡包）

- **新增 (Added)**：
  - **思源闪卡生态插件格式兼容调研与实施规范（`docs/59-思源闪卡生态插件格式兼容调研与实施规范-2026-11-01.md`）**：全景逆向并梳理思源笔记官方内核闪卡、SiYuanMemo (CDF 框架)、Flashcard Assistant (ZY)、Flashcard Toolbox、Highlight Cloze、Sy-Recite 以及 Anki/Obsidian 互通语法；
  - **Anki 风格挖空格式兼容（`src/core/delimited-qa.ts`）**：支持运行时解析与内存遮罩 `{{c1::答案}}` 与 `{{c1::答案::提示}}`，并在卡片维护中心支持一键规范化升级为标准 `==答案==` 标记；
  - **闪卡工具箱自定义题面标题兼容（`src/core/card-face.ts` & `src/ui/review/ReviewCardBody.svelte`）**：支持读取 `custom-riff-title` 与 `custom-card-title` 块属性，在复习卡面以长春花目标徽章高亮呈现自定义题面；
  - **思源内核多卡包逗号分隔规范与默认卡包识别（`src/core/deck-management.ts`）**：精准提取 `custom-riff-decks="d1,d2"` 逗号分隔多卡包映射，自动识别官方内置默认卡包（`20230218211946-2kw8jgx`），保证卡包归属对齐零丢失。

## v0.227.0 2026-11-01 · 制卡必须要素硬核门禁、小驴考试风格试题智能拆单与数理工具栏、存量与第三方插件卡包全景管理

- **新增 (Added)**：
  - **制卡必备要素硬核核验状态条与提交阻断（`src/ui/quick-card.svelte`）**：明确所属卡组、题干内容（非空）与题型关键答案要素（单选需指定1项/多选≥2项/判断需选对错/挖空需含标记），实时展示三色就绪胶囊，未满足要素时坚决阻断制卡并自动聚焦缺失字段；
  - **试题文本智能拆单与解析引擎（`src/core/question-splitter.ts` & `src/ui/quick-card.svelte`）**：参考小驴考试题库录入流程，支持直接粘贴整段试题文本（试卷、PDF、网页复制的单选/多选/判断/填空/问答），自动拆分提取题干、选项 A/B/C/D、正确答案与参考解析，题干输入时自动感知并提供一键拆分；
  - **常用数理符号与拼音注音快捷工具栏（`src/ui/quick-card.svelte`）**：提供数理（上标、根号、分式、求和、积分、圆周率、极限等）、拼音四声（ā á ǎ à 等）与 Markdown 格式标记快捷栏，一键插入当前光标位置，彻底降低外语与理科制卡难度；
  - **存量与第三方插件卡包发现与同步引擎（`src/core/deck-management.ts`）**：全库深度扫描原生块属性 `custom-riff-decks`、社区插件属性 `custom-flashcard-deck` / `custom-deck`、标签卡包 `#deck/*` / `#卡包/*` 与未归组孤儿挖空卡，支持一键全部同步接入为思源原生 Riff 卡组；
  - **卡库全功能「卡包管理」专属控制台（`src/ui/deck-manager.svelte` & `src/ui/hub.svelte`）**：于卡库二级导航新增“卡包管理”，提供卡包概览总计、活跃/空卡包筛选、待接入存量高亮条、新建卡包、重命名、合并卡包、安全解散删除与一键清理空卡包；今日页卡组区提供一键直达入口。
- **优化与细节打磨 (Changed)**：
  - **公式推导卡型扩容与充足制卡指南（`src/ui/quick-card.svelte`）**：新增 `formula` 表达模板与 KaTeX 实时语法指导，针对单选、多选、判断、挖空、问答和公式分别提供充实的制卡说明与避坑建议；
  - **多处原生图标与键盘可访问性对齐（`src/ui/deck-manager.svelte` & `src/ui/quick-card.svelte`）**：全面对齐原生 24×24 空心 Lucide 符号系统，优化焦点归还与标签计算。

## v0.226.0 2026-10-31 · 隔离测试网页环境、原生空心图标全量对齐、制卡与引导流程深化、数学公式宿主渲染与本体功能全覆盖

- **修复 (Fixed)**：
  - **制卡空卡组死锁（`src/ui/quick-card.svelte`）**：当卡库没有任何卡组时，下拉框不再禁用死锁，而是直显新建输入框并自动聚焦，输入卡组名称后可一键制卡并自动选中新卡组；
  - **复习与卡片详情中 KaTeX 数学公式渲染空白（`src/libs/math-render.ts`）**：解决思源 3.8 网页端缺失 `window.siyuan.initKaTeX` 导致的公式空壳节点问题，按需动态加载思源宿主原生 KaTeX 资产完成卡面公式渲染；
  - **修卡演练与首页排版拥挤/滚动锁死（`src/ui/repair-drill.svelte`、`src/ui/dashboard.svelte`、`src/index.scss`）**：修复修卡演练内边距为 0 的样式污染，清除外层滚动锁死，移除首页冗余顶栏与副标题，并将配对/限时挑战移至学习页，深度统计默认折叠；
  - **工作区示例生成断点恢复与入组补齐（`src/core/workspace-samples.ts`）**：修复示例重试时因已存在卡导致入组列表不匹配的问题，支持幂等识别全类型示例卡。
- **新增 (Added)**：
  - **D盘隔离测试网页环境（`scripts/serve-isolated-web.mjs` & `启动隔离测试网页.bat`）**：建立运行于 `D:\siyuan-isolated-lv-cards`、独立端口 `43930` 的思源原生桌面网页环境，内置全类型卡片组快速演练与热重载；
  - **思源笔记本体闪卡功能调研与 100% 覆盖对照报告（`docs/58-思源本体闪卡功能调研与覆盖对照-2026-10-31.md`）**：详尽梳理 16 项内核原生 Riff API 并验证完全覆盖；
  - **全类型闪卡示例组覆盖 14 种卡型（`src/core/sample-cards.ts` & `src/core/workspace-samples.ts`）**：涵盖问答、挖空、超级块、双向词卡、破折号问答、单选、多选、判断、填空、代码、公式、表格、图片与行内问答；
  - **选择题/多选/判断题专属可视化制卡表单（`src/ui/quick-card.svelte`）**：支持选项动态增删、正确答案点选与 `custom-exam-*` 块属性自动生成；
  - **选区原位制卡菜单（`src/bootstrap/block-menu.ts`）**：编辑器选中文本后在块菜单直达“用选中文本制卡”，一键带起草稿与来源双向反链。
- **优化与细节打磨 (Changed)**：
  - **全量图标对齐思源本体原生 24×24 空心 Lucide 符号系统（`src/ui/kit/LvIcon.svelte`）**：清除实心填充与宿主图标类污染，全面映射到思源原生 outline SVG symbols；
  - **快速制卡生产力强化（`src/ui/quick-card.svelte`）**：支持 `Ctrl+1/2/3/4` 快捷切换模板、“填入示例”、实时字数计数与点击翻面预览，并自动记住上次使用卡组；
  - **新手引导三步极简流程（`src/ui/onboarding.svelte`）**：精简引导步骤，用户点击画像后一键生成示例组并直接体验，彻底消除制卡门槛；
  - **存量闪卡格式兼容（`src/core/delimited-qa.ts`）**：扩展支持第三方中文笔记常见的 `——` 破折号问答语法。

## v0.225.0 2026-10-31 · 思源文档深度联动第一批（D1）：块属性镜像、来源双向块引与原位制卡、《闪卡动态看板与错题本》

- **新增 (Added)**：
  - **思源块属性镜像联动（`src/core/block-attributes.ts` & `src/index.ts`）**：星标状态（`custom-lv-starred`）、水蛭疑难卡（`custom-lv-leech`、`custom-lv-lapses`）与错因归因（`custom-lv-error-reason`）实时同步写入思源底层笔记块属性，打通思源原生搜索、原生属性视图（Attribute View）与 SQL 嵌入块动态汇总；
  - **来源双向块引与原位制卡（`src/core/card-operations.ts`、`src/ui/quick-card.svelte`、`src/ui/marker-cards.svelte`、`src/ui/ai-wizard.svelte`）**：快速制卡自动感知当前活动笔记，支持一键附带指向原笔记的反链引用（`> 来源：((id "title"))`）或直接“就地追加到当前笔记末尾”；标记制卡问答块自动回链原标记块；AI 制卡自动继承来源文档身份并建立来源反链与血缘属性，让原笔记的反向链接面板和关系图直接显示提炼出的卡片；
  - **《闪卡动态看板与错题本》原生 SQL 活文档（`src/core/dynamic-notebook.ts`、`src/bootstrap/commands.ts`、`src/ui/maintenance-page.svelte`、`src/ui/settings.svelte`）**：一键生成/打开利用思源原生 SQL 嵌入块（`{{SELECT * FROM blocks WHERE ...}}`）聚合的动态错题与重点看板，在思源正文中直接查看水蛭错题与星标卡，并在命令面板（`Ctrl+K`）、维护债务页与设置页提供直达入口。
- **优化与细节打磨 (Changed)**：
  - **快速制卡来源文档联动卡片（`src/ui/quick-card.svelte`）**：活动笔记标题以长春花紫目标徽章紧凑呈现，附带“关联笔记反链”与“就地追加到本文档”双复选开关，符合 R54 设计系统规范；
  - **命令面板与设置页直达（`src/core/palette-navigation.ts` & `src/ui/settings.svelte`）**：命令面板新增“动态看板与错题本”动作条目，设置页数据分区新增看板文档快捷入口。

## v0.224.0 2026-10-31 · 阶段 C：制卡可学性把关与一键拆卡、来源变更并排对比与版本回退修卡闭环

- **修复 (Fixed)**：
  - **块菜单/斜杠菜单直接入组未记录来源指纹与初版快照（`src/index.ts`）**：修复 `openDeckPicker` 入组成功后漏调 `rememberSourceFingerprint` 的问题，并在首次建卡或首次编辑前自动留存初版 Markdown 快照，消除首次改卡后无历史初版可对比、无旧版可回退的断层；
  - **快速制卡双向卡与拆卡未复用目标文档（`src/index.ts`）**：补齐 `createQuickCard` 返回 `{ docID, blockID }`，使双向制卡与一键拆卡的多张子卡稳定复用同一文档；
  - **修卡后来源健康仍残留 `changed` 告警（`src/index.ts`）**：通过详情编辑器或维护批量修复保存卡片内容后，自动同步更新该卡的来源指纹基线并结案已修复的 `changed` 记录。
- **新增 (Added)**：
  - **入组前可学性软检查与一键原子拆卡（`src/core/incremental-learning.ts`、`src/ui/quick-card.svelte`、`src/ui/marker-cards.svelte`、`src/ui/ai-wizard.svelte`）**：覆盖内容过长、单处答案过长、一卡多问（多问号/分号并列，自动排除代码与公式块）、挖空过多、代词指代不明与答案泄漏；快速制卡提供“预览拆分 / 一键拆分为 N 张原子卡入组”，标记制卡提供行内可学性徽章与“只选良构项”，AI 候选审核提供行内无依据断言提示与“拆成 N 张”按钮；
  - **维护页来源变更并排对比与历史版本一键恢复（`src/ui/maintenance-page.svelte`、`src/ui/card-detail.svelte`）**：维护页 `sourceHealth` 展开展示“变更前基线 vs 当前来源内容”并排对比、逐行差异高亮及“用基线原文恢复草稿 / 加入修复”入口；卡片详情抽屉历史版本列表新增“恢复此版本”按钮，支持一键回退至任意历史版本；
  - **中英文 README 提炼“思源原生闪卡没有的三件事”（`README.md` & `README.en.md`）**：如实概括入组前可学性把关与拆卡、来源变更检测与带版本留痕的修卡闭环、块级语境回源与开放互通三大差异化价值。

## v0.223.0 2026-10-31 · 阶段 B 收官：闪卡中心导航归位、今日页折叠统计瘦身与首用引导落点修正

- **修复 (Fixed)**：
  - **跳过引导或切换子页后点击顶栏图标落点偏到“制卡”页（`src/bootstrap/tab-registrars.ts` & `src/index.ts`）**：无显式 `tab` 参数打开闪卡中心时不再受上一次停留在“制卡”或“设置”的 `lastHubTab` 干扰，始终稳定落回“今日（`overview`）”总览；
  - **首用引导第 1 步卡型小图标与标题错位、问答卡文案晦涩（`src/ui/onboarding.svelte` & `public/i18n/`）**：将三张学习画像选择卡提到第 1 步最上方首屏主位，对齐卡型小图标与标题基线，并将问答卡说明改为直白的“正面提问、背面揭晓答案，支持普通问答与超级块多段问答”。
- **优化 (Changed)**：
  - **闪卡中心二级导航按任务归位（`src/ui/hub.svelte`）**：将“维护债务”归入“卡库”二级导航，将“材料收件箱”归入“制卡”二级导航，将“待处理与恢复”并回“今日”页待处理分区头部，“学习”页只保留目标回顾与考试冲刺，旧路由 `id` 保持完全兼容；
  - **今日页深度统计折叠区瘦身与首屏卡组操作直达（`src/ui/dashboard.svelte`）**：将卡组重命名、导出 `.lvcards` 分享包、删除卡组三项动作直接挂到首屏“我的卡组”行；折叠区移除重复的卡组表格、冗余预测表及纯陈列区块（覆盖明细、周对比、里程碑、AI 质量、能力分布——仍完整保留在导出的学习报告文档中），仅保留热力图、学习日历、真实保持率与留存曲线、水蛭卡、错误原因五块行动导向统计，并省去每次刷新时多余的后台查询。

## v0.222.0 2026-10-31 · 阶段 B 上半场：专注复习顶栏五键减负、单偏好面板合并、移出复习三选一弹窗与首屏常驻评分栏

- **修复 (Fixed)**：
  - **普通挖空卡强制弹出填空输入框并劫持快捷键焦点（`src/core/quiz-interactive.ts`）**：`parseInteractiveQuiz` 原先将所有含 `==` 或 `<mark>` 的普通挖空闪卡误归入考试填空题型（`kind: "fill"`），导致未开启打字练习时仍渲染自动抢焦点的输入框，使空格翻面与 `h`/`p`/`x`/`s`/`*` 快捷键失灵。现仅在显式考试填空属性（`custom-exam-type="fill"`）或连续下划线填空符（`___`）时渲染交互填空框；
  - **撤销（`P`/`Q`）切卡瞬间闪白与语境面包屑丢失（`src/ui/review/ReviewCardBody.svelte` & `src/ui/review.svelte`）**：移除卡面切换时的透明淡入等待，并在撤销恢复卡面后异步刷新来源面包屑与助记便签；
  - **复习“在编辑器中打开”快捷键属性错标为 `o` 与帮助/回看浮层焦点逃逸（`src/ui/review/ReviewToolbar.svelte` & `src/ui/review/ReviewHelpAndPeek.svelte`）**：修正 `aria-keyshortcuts="e"`，为帮助（`?`）与回看（`[`）对话框补齐 `trapFocus` 与 `Ctrl+D` 快捷键说明，并为更多菜单增加上下方向键与 `Home`/`End` 键盘导航。
- **优化 (Changed)**：
  - **专注复习顶栏精简为 5 个高频按钮并合并双“本场偏好”入口（`src/ui/review/ReviewToolbar.svelte` & `src/ui/review/ReviewSessionPrefs.svelte`）**：顶栏右侧仅常驻“撤销、跳过、编辑、星标、更多” 5 项，左侧合并为安静的范围/目的胶囊；将范围、会话目的、作答方式统一收入单一“本场偏好”面板，消除顶栏横向滚动与同名双偏好弹窗；
  - **“今天不学 / 归档隐藏 / 移出卡组”收口为统一的“移出复习…”三选一弹窗（`src/ui/review/ReviewActionModals.svelte`）**：经隔离内核实测确认 `removeRiffCards` 会清空卡片的内核 FSRS 排期与复习进度（再次入组按新卡重学），在统一弹窗中并列呈现三种去向的真实后果与思源原生闪卡可见性边界；
  - **卡面高度随内容自适应、评分栏首屏粘性常驻（`src/ui/review.svelte` & `src/ui/review/ReviewRatingBar.svelte`）**：收紧卡面过大的最小高度与内边距，评分栏底部粘性常驻，在 1440×900、1024×768 窄窗与 150% 系统缩放下均无需滚动即可直接评分。

## v0.221.0 2026-10-31 · 阶段 A 收官：超级块问答入组与维护误判修复、42 个孤儿核心模块归档及中英文档如实校正

- **修复 (Fixed)**：
  - **超级块问答卡（`{{{row` / `{{{col`）制卡被拒与维护误判为坏卡（`src/core/flashcard-quality.ts` & `src/ui/manager.svelte`）**：T4 维护走查发现 `validateFlashcardMarkdown` 与 `hasQuestionContent` 仅识别 `==答案==` 标记，导致快速制卡“超级块”模板 100% 建卡报错、原生超级块无法入组、维护中心将全部超级块问答卡误标为缺挖空坏卡。新增 `parseSuperBlockMarkdown` 识别含至少 2 个有效子块的超级块问答结构（自动跳过代码块/多行公式空行并剥离 IAL 行），并补齐卡库超级块筛选对 `{{{row` 的匹配；
  - **中英文 README 虚假设置项与过期快捷键修正（`README.md` & `README.en.md`）**：移除中文设置表中不存在的“调度算法（可选 SM-2）”说明行；将英文 `README.en.md` 中过期的复习快捷键（`Ctrl+Z` / `Ctrl+O` / `Ctrl+E`）对齐为实际生效的 `p`/`q`、`e`/`E`、`m`、`f`、`*`、`x`/`0`、`s`。
- **优化与治理 (Changed)**：
  - **42 个不可达核心模块与 40 个专属单测迁移归档（`archive/orphan-core-2026-10-31/`）**：经全入口传递依赖可达性核验，将生产界面不可达的 42 个实验模块（10,360 行）与对应单测通过 `git mv` 归档保存，主线 `src/core` 由 171 个文件精简至 129 个 100% 在役文件，并如实标注历史更新摘要；
  - **完成 T4 修卡、T5 备份设置与限时挑战宿主走查（`test-evidence/walkthrough-2026-10-31/`）**：在思源 3.8.9 隔离工作区完成详情在线编辑、历史版本核对即时刷新、KO 派生隐藏、误解簇隐藏、限时挑战超级块遮蔽揭晓及设置页核查，阶段 A（可信）全部收官。

## v0.220.0 2026-10-31 · 代理走查阻断问题修复、设置透传与作用域隔离、挑战模式遮蔽答案及阶段 A 半成品收口

本版的问题来源从检查表换成了真实任务走查（隔离工作区 + 112 张混合夹具卡，记录见 `test-evidence/walkthrough-2026-10-31/`），优先修复用户照着说明操作就会撞上的问题。

- **修复 (Fixed)**：
  - **同一笔记本只能成功制卡一次（`src/api/siyuan.ts`）**：创建文档前会无条件重建每一级父文档，工作区里因此出现多个同名 `/小驴闪卡`，思源 3.8.9 随即拒绝按路径建文档，快速制卡、标记制卡、AI 制卡、学习报告第二次起全部报 “document path is ambiguous”。改为逐级“先查后建”，按文档 ID 挂到父文档下；空内容的容器文档（快速制卡、标记制卡、示例卡）同路径已存在时直接复用。已有重复父文档的工作区固定落到最早的那个；
  - **首次引导“创建示例卡”失败（`src/api/due-shared.ts`）**：入组检查在块刚写入、思源还没把索引写进数据库时就去查内容，查不到便判成“空卡”。现在查不到会先请内核立即提交索引再查，仍查不到则直接读块内容；
  - **入组失败显示英文原文（`src/api/due-shared.ts`）**：引导页在独立界面分包里，识别不出主包抛出的错误类型，直接显示了 “Flashcard entry blocked: …”。改为按错误名称识别，显示本地化提示；
  - **图片遮挡卡复习时答案完全露出（`src/core/occlusion.ts`）**：遮挡层被贴到了卡面顶部 16×16 的来源面包屑图标上，图片上没有任何遮挡框。改为只在卡面内容区里找图片，且图片优先；
  - **编辑已有遮挡卡会清掉原来的框（`src/ui/occlusion-editor.svelte`）**：编辑器打开时先读回已存的遮挡框，在此基础上增删后保存；没有改动时关闭不再弹确认；
  - **限时挑战出题即剧透（`src/ui/challenge-mode.svelte`）**：题面先遮住挖空和超级块答案，按 `V` 或点卡面看答案，`1`/`2` 仍可直接判分；
  - **示例卡卡面显示 `<!-- lv-cards-sample:… -->`（`src/core/workspace-samples.ts`）**：示例标记原先以 HTML 注释写在正文里，思源 3.8 会把注释原样显示在卡面和笔记中。改为写进块属性 `custom-lv-sample`，仍能识别旧版标记避免重复创建；
  - **图片遮挡框半透明（`src/ui/review/ReviewOcclusionOverlay.svelte`）**：问题态遮挡框透明度为 0.55，框下的文字和图案会透出来。未揭晓时改为完全不透明，键盘聚焦时也不再变透明；
  - **三项复习设置不生效（`src/bootstrap/tab-registrars.ts`）**：复习页补齐自定义卡面 CSS、小驴打卡联动 ID、水蛭卡阈值三项设置的传递；
  - **详情历史版本“核对确认”吞异常且不刷新（`src/bootstrap/tab-registrars.ts`、`src/ui/manager.svelte`、`src/ui/card-detail.svelte`）**：补齐 `acceptContentAt` 异步异常透传、响应式版本列表刷新与失败错误提示；
  - **`.lvcards` 分享包导入冲突策略写死与元数据错位（`src/ui/settings.svelte`）**：冲突弹窗支持选择“保留本地 / 另存新卡 / 合并便签”，并将元数据恢复输入修正为 `toImportCards`；
  - **考试计划提醒双轨短路（`src/index.ts` & `src/ui/settings.svelte`）**：移除设置页无消费端的孤立考试日期表单（保留配置字段向后兼容），只要考试冲刺页存在启用计划即可触发里程碑提醒。
- **优化 (Changed)**：
  - **图片遮挡编辑器免拖拽与单点删框（`src/ui/occlusion-editor.svelte`）**：画布遮挡框显示 `#1`/`#2` 序号，底部新增已绘区域芯片列表支持单点/键盘精准删除任意框，并提供“标准框”一键插入按钮；
  - **半成品界面入口隐藏与危险操作视觉对齐（`src/ui/maintenance-page.svelte`、`src/ui/ko-panel.svelte`、`src/ui/manager.svelte`、`src/ui/settings.svelte`）**：隐藏无数据源的误解簇空面板与知识对象面板二次派生入口；为“清空 AI 用量账本”补齐危险按钮样式与图标；
  - **水蛭卡阈值只剩一个默认值（`src/core/revlog.ts`）**：此前设置页写 8、复习队列写死 5、进度条写死 4。现在统一取 `DEFAULT_LEECH_THRESHOLD = 8`，并按用户设置判定。**未改过该设置的用户，水蛭卡提醒从遗忘 5 次改为 8 次触发**，与设置页说明一致；
  - **自定义卡面 CSS 限定在卡面内（`src/core/card-face.ts`）**：规则包进卡面作用域，并去掉能闭合样式标签、插入脚本或引入外部资源的片段，误写 `.b3-button { display:none }` 不会再让设置弹窗和思源按钮消失；
  - **新增走查夹具脚本（`scripts/walkthrough-fixture.mjs`）**：只允许对隔离工作区运行，灌入挖空、超级块、图片遮挡与坏卡混合卡组，供每轮开发前后复走查。

## v0.219.0 2026-10-31 · 复习历史回滚安全守卫、Cram 会话物理隔离、星标与归档全链路持久化及完成屏专项突击闭环

- **修复 (Fixed)**：
  - **撤销（Undo）误回滚历史 `revlog` 数据缺陷（`src/core/review-history.ts` & `src/ui/review.svelte`）**：在复习历史快照中引入 `revlogAppended` 精确标记，仅当正式评分实际写入 `revlog` 时才允许撤销时回滚，根除在跳过（`skip`）、遗忘重现卡（`lvRequeue`）或 Cram 突击模式下执行撤销时误删历史正式复习记录的问题；
  - **`Ctrl+D` 解散归档卡片支持一键撤销（`src/ui/review.svelte`）**：解散归档动作纳入撤销历史栈（`dismissedBlockID`），误按 `Ctrl+D` 后按 `p`/`q` 可即时恢复卡片并清空 `custom-lv-dismissed` 块属性；同时将 `dismissBusy` 纳入全局动作锁 `actionBusy`；
  - **Cram 考前突击快刷模式污染正式每日会话与内核跳过（`src/ui/review.svelte` & `src/index.ts`）**：隔离 Cram 模式与正式复习的 `session-state.json` 读写及跳过动作，防止突击快刷过的卡片在当日正式复习中被漏滤，或正式已复习卡在突击模式中被屏蔽；
  - **完成屏“去管理器”按钮误跳首页（`src/ui/review/ReviewDonePanel.svelte`）**：修复“本场跳过 N 张 -> 去管理器”按钮错绑为返回首页的交互走样，准确跳转至卡片管理器；
  - **复习设置 `burySiblings` 透传补齐（`src/bootstrap/tab-registrars.ts`）**：补齐复习页签挂载时 `burySiblings` 设置项映射。
- **补全与新增 (Completed & Added)**：
  - **复习端星标收藏跨会话持久化（`src/ui/review.svelte` & `src/bootstrap/tab-registrars.ts`）**：打通复习端星标按钮/快捷键 `*` 与 `settings.starredCards` 的持久化同步，实现复习端收藏与卡片管理器“星标卡”筛选双向联动；
  - **解散归档卡（`custom-lv-dismissed`）跨会话队列过滤（`src/core/review-queue-quality.ts`）**：出题质量检查阶段识别 `blocks.ial` 中的 `custom-lv-dismissed="true"` 属性并自动移出日常复习队列，且不计入结构坏卡；
  - **完成屏遗忘卡/星标卡一键专项突击闭环（`src/ui/review.svelte`）**：维护本场卡片字典 `sessionCardMap` 与遗忘/星标集合，点击完成屏“强化这批遗忘卡”或“立即专项练习星标卡”即可直接拉起对应卡片的无排期污染突击队列；并补全 Cram 模式按卡组/笔记本/文档/全局全范围合并拉取。
- **优化 (Changed)**：
  - **总览 7 日负载平滑持久化与日历联动（`src/ui/dashboard.svelte`）**：持久化“负载平滑”开关状态，开启时同步更新 14 日预测日历，补齐中英双语 i18n 文案与 `aria-pressed` 无障碍状态；
  - **设计令牌收敛与四处版本号强校验（`src/core/lvcards-package.ts` & `scripts/check-versions.mjs`）**：导出 `PLUGIN_VERSION` 代码常量并纳入 `check-versions.mjs` 门禁，保持 `package.json`、`plugin.json`、`README.md` 与代码常量四处一致；收敛面包屑与总览非令牌样式声明。

## v0.218.0 2026-10-30 · R54 统一设计令牌与现代质感重塑、全域功能闭环审计与信息架构深化里程碑

- **新增 (Added)**：
  - **思源全局命令面板对齐**：新增“打开闪卡管理器（`openManager`）”与“AI 制卡向导（`openAIWizard`）”全局命令注册，支持在思源官方快捷键设置中自由绑定系统全局快捷键；
  - **R54 现代设计令牌体系**：确立“浅紫托底、白卡浮起”双层秩序，引入标准向下微漫反射三档中性阴影（Elevation 1/2/3）、20px 大圆角与内嵌子元素递减法则；
  - **两色严格分工机制**：操作按钮与导航统一使用经典长春花紫（`#5E59CB`），连续打卡、已学卡片数、热力图与留存率成果专享天青碧水蓝（`#0284C7`）高光，两色互不交叉混用；
  - **深色对比重音卡片（Dark Contrast Accent）**：今日连击卡片（Streak Card）采用带微弱紫相的近黑底色（`#171723`，明度 12%），搭配纯白高对比文字与天青数据大字，打破全浅色平铺，强化视觉节奏；
  - **4 倍字号极端落差**：今日复习核心数字与收工结算大字升级至 44px（`--lv-type-display-hero`），字重 600 并全量启用等宽数字（`tabular-nums`），与 11px 辅助说明形成刚好 4.0 倍尺寸落差；
  - **触屏最小触控热区保护**：在 `@media (pointer: coarse)` 下通过伪元素为小型按钮与开关隐式扩展触控热区至 $\ge 44\text{px} \times 44\text{px}$，避免触屏误触。
- **变更 (Changed)**：
  - **设置页信息架构（IA）重构**：终结“卡面实时预览”与“字体缩放滑块/自定义 CSS”跨屏割裂问题，预览卡片直接下移至外观分区内部，实现就地调节与实时渲染闭环，导航导轨补齐“外观卡面”直达锚点（`sec-appearance`）；
  - **设置项默认值标注**：每日新卡目标（默认 10）、每日复习目标（默认 20）、遗忘阈值（默认 8）等关键表单项补充推荐默认值与还原指引；
  - **学习日历图例胶囊化**：底部图例重构为“历史复习”与“未来到期”两组独立微胶囊包裹，信息密度与层级一目了然；
  - **全站分割线透明度化**：彻底移除水泥灰实线切割，顶栏、侧栏、表格分页栏分割线全量替换为 `1px solid color-mix(in srgb, var(--lv-color-text) 8%, transparent)`；
  - **正文长文本行宽与排版抗锯齿**：问答卡面与详情原文增加 `max-width: 48em` 舒适行宽约束，并注入抗锯齿平滑渲染。
- **修复 (Fixed)**：
  - **卡片详情抽屉保存即时同步（`src/ui/manager.svelte`）**：修复抽屉编辑保存后外部列表显示旧文本的问题，关闭抽屉即见最新内容；
  - **模块停用路由容错防白屏（`src/ui/hub.svelte`）**：修复关闭考试或收件箱模块时外部深链直达导致页面空白的问题，补充优雅停用提示卡；
  - **配对练习平滑 Fallback（`src/ui/pairing-game.svelte`）**：修复今日到期为 0 时报错“卡片不足”无法游玩的问题，自动回退读取卡库已有卡片供随时练习；
  - **复习与卡库跳转来源未命中友好提示（`src/ui/review.svelte` & `manager.svelte`）**：修复原笔记块已被删除时回源静默无反应的问题，给出明确友好提示；
  - **复习顶部面包屑超长路径呼吸间距保护（`src/ui/review/ReviewCardBreadcrumbs.svelte`）**：深层路径弹性居中折叠，右侧固定预留标准 16px 呼吸间距；
  - **设置快速导航导轨多行换行间距（`src/ui/settings.svelte`）**：垂直与水平间距严格统一为 8px 栅格基准；
  - **抽屉分面页签窄屏自适应（`src/ui/card-detail.svelte`）**：≤400px 宽度下自适应收缩内边距至 4px 6px；
  - **双语国际化键位补齐**：补齐 `retentionCurveTitle` 双语 i18n 键树，819 处源码引用 100% 全部命中。
- **移除 (Removed)**：
  - 彻底清除主按钮线性渐变（`linear-gradient`）及连击卡片高亮橙色大渐变；
  - 彻底清除全站散布的拟物内阴影（`box-shadow: inset ...` 达到 0 处残留）与无意义放大弹跳动效（`scale(1.08)`）。

- **高危逻辑缺陷修复（阶段一）**：
  - **复习提交流锁保护（`ui/review.svelte`）**：将重现卡（requeue）分支移入 `try..finally` 保护域，杜绝异常时 `submitting` 锁死复习工作台；
  - **快捷键撤销心流对齐（`core/review-shortcuts.ts`）**：解除 `undo`（`p`/`q`）受必须翻面答案态的错误约束，允许在下一张卡问题态直接撤销上一张评分；
  - **准确率与留存率公式校准（`core/review-queue-pipeline.ts` & `ui/review/ReviewDonePanel.svelte`）**：消除 `forgetCount` 重复双重扣除与全盘遗忘时被除数为 0 误判 100% 满分命中率的极端 BUG；
  - **快速改期时区漂移纠正（`core/reschedule-preview.ts`）**：改期目标时间戳从 UTC 格式对齐为本地日历时区，杜绝东八区凌晨改期退回前一天的时区偏移；
  - **内核范围缓存穿透兜底（`api/due-shared.ts`）**：缓存 fetcher 委托至 `getRiffDueCardsForScope`，彻底解决 `notebook:`/`doc:` 前缀请求导致内核报 `deck not found` 错误；
  - **Anki 导入临时文件清理（`api/anki-host.ts`）**：在 `openSqliteFile` 的 `close()` 中增加自动删除临时文件与解压目录逻辑，彻底根治操作系统临时目录积累垃圾文件；
  - **今日不学日期滚转与匹配（`core/suspend-today.ts` & `core/review-queue-pipeline.ts`）**：增加跨天判定，使昨日挂起卡片跨日自动解除，并统一按 `cardID` 与 `blockID` 兼容匹配；
- **UI 一致性、设计体系与无障碍改善（阶段二）**：
  - **抽屉全局样式作用域挂载（`index.scss`）**：将 `.lv-drawer` 纳入根设计令牌重置选择器，确保卡片详情/关系链等抽屉内控件完美继承设计体系；
  - **WCAG AA 4.5:1 对比度与设计令牌补齐（`index.scss`）**：补齐 `--lv-color-surface-subtle` 等缺失变量；在暗色模式下引入 `--lv-color-on-danger` 与 `--lv-color-on-success`，消除浅色徽标上的纯白文字对比度反转；
  - **模态弹窗层级与焦点陷阱（`libs/focus-trap.ts` & `ui/review/ReviewActionModals.svelte`）**：升级 `trapFocus` 为原生 Svelte Action（`use:trapFocus`），修复遮罩 z-index 层级，将 Tab 键焦点严格限制在弹窗内；
  - **HTML5 语义合规（`ui/review/ReviewCardBreadcrumbs.svelte`）**：将面包屑外层非法嵌套的 `<button>` 规范重构为 `<div>` 容器，消除了交互事件冲突与读屏器解析异常；
- **性能瓶颈突破与运行时优化（阶段三）**：
  - **消除评分时多重深拷贝（`index.ts`）**：移除评分关键路径中重复的快照深度克隆与 `normalizeRevlog` 冗余运算，`cloneStore` 优先采用 V8 原生 `structuredClone`；
  - **knownCards 检索复杂度 O(N) → O(1)（`core/revlog.ts`）**：通过 `WeakMap` 维护 `Set<string>` 内存索引，彻底消除大库（20,000 条）首评判断与去重时的数万次线性扫描；
  - **复习队列候选窗口预截断（`ui/review.svelte`）**：设置自适应候选窗口，在保证批次上限与兄弟卡防剧透的前提下，仅对首批卡片发起 SQLite 质量检测，大幅缩短首卡加载延迟；
  - **卡片管理台排序与筛选优化（`ui/manager.svelte`）**：预缓存纯文本摘要，消除排序比较中高频正则执行；将疑难卡与星标卡片独立为响应式派生集合；
- **文档体系全面升级**：
  - 彻底重构中英文 `README.md` 与 `README.en.md`，建立 8 大核心功能全景目录，并将历史 45+ 个版本更新收纳进折叠标签 `<details>`，保持首页精炼直观；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2315 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.216.3 2026-10-29 · 排除卡片合并/活跃卡片过滤与恢复倒计时条件解耦落地

- **队列排除卡片合并与活跃卡片过滤解耦（`core/review-queue-pipeline.ts`，TSK-08 持续深化）**：
  - 提炼 `combineExcludedCardIDs`：标准化合并已复习与质量排除卡片集合；
  - 提炼 `filterActiveSessionCards`：使用 Set 将跳过和今日不学卡片的过滤优化至 O(1) 级别；
  - 提炼 `mergeQualityExcludedCardIDs`：安全合并新识别的质量异常卡片；
  - 在 `tests/review-queue-pipeline.spec.ts` 中新增 3 项单元测试；
- **会话恢复重启倒计时前置判定解耦（`core/review-countdown.ts`）**：
  - 提炼 `shouldRestartCountdownOnResume`：纯函数统一校验问题态与题面就绪；
  - 在 `tests/review-countdown.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2314 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.216.2 2026-10-29 · 评分前置条件校验/评级触感波形与焦点控制器解耦落地

- **卡片可评分判定与评级触感波形解耦（`core/card-actions.ts` & `core/haptic.ts`，TSK-08 持续深化）**：
  - 提炼 `canRateCurrentCard`：纯函数集中校验题面存在、会话非暂停、题面答案态与非忙碌状态；
  - 提炼 `getRatingHapticPattern`：纯函数标准化评级 1（遗忘）三次确认波形与 2-4 级轻触波形；
  - 在 `tests/card-actions.spec.ts` 与 `tests/haptic.spec.ts` 中新增单元测试；
- **复习面板根容器/卡片聚焦控制器解耦（`core/card-interactions.ts`）**：
  - 提炼 `focusReviewRootOrCard`：纯函数标准化归还焦点至复习根元素或卡片主体；
  - 在 `tests/card-interactions.spec.ts` 中新增单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2309 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.216.1 2026-10-29 · 容器事件边界判定与重置会话载荷构建解耦落地

- **容器内部事件判定统一（`core/card-interactions.ts`，TSK-08 持续深化）**：
  - 提炼 `isEventInsideContainer`：纯函数标准化判断目标是否为指定容器（如复习根面板）或其子 Node 节点；
  - 统一 `onWindowKeydown`、`onPanelPointerDown` 与快捷键调度上下文中的容器范围检测；
  - 在 `tests/card-interactions.spec.ts` 中新增 2 项单元测试；
- **清空重置会话进度载荷构建解耦（`core/session-state.ts`）**：
  - 提炼 `createResetSessionProgress`：纯函数标准化清空场景的已复习、已跳过卡片数组与计数器结构；
  - 在 `recoveryAct("end")` 中接入，消除了组件层残留的计数器直接实例化；
  - 在 `tests/session-state.spec.ts` 中新增单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2304 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.216.0 2026-10-29 · 卡面就绪判定/范围规范化与路径查询SQL构造解耦里程碑

- **卡面就绪判定与范围键规范化解耦（`core/card-face.ts` & `core/scope-preset.ts`，TSK-08 持续深化）**：
  - 提炼 `isCardFaceReady`：纯函数标准化判断卡面就绪状态（题面非空且无错误）；
  - 提炼 `normalizeScopeKey`：纯函数统一范围键规范化逻辑（默认兜底 `all` 并去除首尾空白）；
  - 在 `tests/card-face.spec.ts` 与 `tests/scope-preset.spec.ts` 中新增单元测试；
- **所属文档路径查询 SQL 构造解耦（`core/review-breadcrumbs.ts`）**：
  - 提炼 `buildHPathQuerySql`：纯函数生成标准 SQL 语句，内置单引号转义防注入；
  - 在 `tests/review-breadcrumbs.spec.ts` 中新增单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、**2301 项测试 100% 通过（突破 2300 项测试里程碑）**；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.9 2026-10-29 · 特征提示推导/评级到期格式化与阶梯指示推导解耦落地

- **富内容特征提示推导解耦（`core/card-face.ts`，TSK-08 持续深化）**：
  - 提炼 `deriveFaceHints`：纯函数标准化富内容分析结果推导提示键列表，空内容自动安全回退；
  - 在 `tests/card-face.spec.ts` 中新增 2 项单元测试；
- **评级到期时间格式化解耦（`core/due-format.ts`）**：
  - 提炼 `formatNextDueByRating`：纯函数安全格式化卡片 nextDues 字典中对应评级的时间文本；
  - 在 `tests/due-format.spec.ts` 中新增 2 项单元测试；
- **提示阶梯级别指示文本推导解耦（`core/hint-ladder.ts`）**：
  - 提炼 `resolveHintLevelIndicator`：纯函数封装当前卡片提示状态、纯文本清洗与阶梯可用指示计算；
  - 在 `tests/hint-ladder.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2296 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.8 2026-10-29 · 单指触控点提取/读屏载荷构造与队列头节点提取解耦落地

- **单指触控起始与结束点提取解耦（`core/review-gesture.ts`，TSK-08 持续深化）**：
  - 提炼 `extractSingleTouchCoords`：纯函数安全提取单指触控坐标，对多指操作返回 null 杜绝误触；
  - 提炼 `extractChangedTouchCoords`：安全提取首个触控变更点坐标；
  - 在 `tests/review-gesture.spec.ts` 中新增 3 项单元测试；
- **读屏播报对象构建与队列头节点安全提取解耦（`core/card-actions.ts`）**：
  - 提炼 `createLiveAnnouncement`：纯函数标准化无障碍读屏实时播报载荷结构；
  - 提炼 `getNextQueueHead`：纯函数安全提取出题队列头节点，自带空队列安全兜底；
  - 在 `tests/card-actions.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2290 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.7 2026-10-29 · 快捷键评分值解析与延迟重现等待态推导解耦落地

- **快捷键动作评分值解析解耦（`core/review-shortcuts.ts`，TSK-08 持续深化）**：
  - 提炼 `resolveRatingFromShortcutAction`：纯函数将 rate-1 到 rate-4 动作映射为对应的评级数值（1-4），并在主组件按键调度中消除重复的按键反馈与评分调用分支（净省 16 行）；
  - 在 `tests/review-shortcuts.spec.ts` 中新增 2 项单元测试；
- **延迟重现等待态与倒计时秒数推导解耦（`core/delayed-requeue.ts`）**：
  - 提炼 `isRequeueWaiting`：纯函数集中判断未完成、无当前卡、存在待重现卡且无加载/错误的等待条件；
  - 提炼 `calculateRequeueWaitSeconds`：纯函数标准化等待毫秒数向上取整计算与非法/负值保护；
  - 在 `tests/delayed-requeue.spec.ts` 中新增 3 项单元测试；
- **主复习文件规模与工程指标**：
  - `src/ui/review.svelte` 代码行数降至 **2293 行**（突破 2300 行大关，相较最初 3412 行累计削减达 **1119 行代码**）；
  - 全库扩展至 289 个测试文件、2285 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.6 2026-10-29 · 批量偏好覆盖合并/卡片操作忙碌守卫与模态状态判定解耦落地

- **批量覆盖项融合与超时重启动作解耦（`core/session-prefs.ts`，TSK-08 持续深化）**：
  - 提炼 `shouldRestartTimeoutOnOverrides`：纯函数统一识别覆盖字典中是否包含 `timeoutMode` 或 `timeoutSeconds`；
  - `applyOverrides` 一次性完成最小化剪裁落盘并触发计时器重启，消除多次单项循环触发的重复渲染与频繁定时器启停；
  - 在 `tests/session-prefs.spec.ts` 中新增 2 项单元测试；
- **卡片操作忙碌守卫统一（`core/card-actions.ts`）**：
  - 提炼 `isCardActionBusy`：统一判断评分提交、改期或归档操作的忙碌状态，收敛多重逻辑或运算符；
  - 在 `tests/card-actions.spec.ts` 中新增 2 项单元测试；
- **全屏模态弹窗打开状态判别（`core/review-shortcuts.ts`）**：
  - 提炼 `isAnyReviewModalOpen`：集中判断四项核心复习模态窗口的开启状态；
  - 在 `tests/review-shortcuts.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2280 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.5 2026-10-29 · 干扰项追加过滤/预算参数初始化与重现卡标记解耦落地

- **干扰项追加校验纯函数化（`core/choice-options.ts`，TSK-08 持续深化）**：
  - 提炼 `addDistractorToPool`：纯函数标准化干扰项清洗、去重、排除正确答案并受控容量限制；
  - 在 `tests/choice-options.spec.ts` 中新增 3 项单元测试；
- **时间预算会话参数初始化解耦（`core/session-budget.ts`）**：
  - 提炼 `initBudgetSession`：纯函数统一初始化时间预算启动时间戳、起始时间与基于历史 revlog 耗时的平均每卡秒数推算；
  - 消除组件层直接对 revlog 耗时映射与兜底处理；
  - 在 `tests/session-budget.spec.ts` 中新增 2 项单元测试；
- **重现卡标记纯函数化（`core/delayed-requeue.ts`）**：
  - 提炼 `markAsRequeueCard`：纯函数安全为短期循环遗忘卡打上 `lvRequeue=1` 标识，保持原字段不可变；
  - 在 `tests/delayed-requeue.spec.ts` 中新增单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2274 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.4 2026-10-29 · 模态窗口按键拦截与退出流转解耦落地

- **模态窗口按键拦截与退出流转解耦（`core/review-shortcuts.ts`，TSK-08 持续深化）**：
  - 提炼 `resolveModalKeydownAction`：纯函数统一拦截模态弹窗打开时的按键事件，防止任何快捷键泄露并安全校验忙碌状态执行 Escape 关闭；
  - 提炼 `shouldIgnoreReviewKeydown`：纯函数统一检测输入法合成、修饰键、长按重复或表单按钮上的 Space/Enter 忽略；
  - 在 `tests/review-shortcuts.spec.ts` 中新增 7 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2268 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.3 2026-10-29 · 容器点击翻面守卫与助记块属性构建解耦落地

- **容器点击翻面守卫与大图预览状态构建解耦（`core/card-interactions.ts`，TSK-08 持续深化）**：
  - 提炼 `shouldRevealOnContainerClick`：纯函数综合判定模态窗遮罩、表单控件防误触与卡片题面就绪状态；
  - 提炼 `createZoomedImageState`：不可变纯函数构造大图预览状态对象；
  - 在 `tests/card-interactions.spec.ts` 中新增单元测试；
- **助记便签更新块属性构建解耦（`core/card-actions.ts`）**：
  - 提炼 `buildMemoAttributes`：纯函数标准化助记便签去空白与块属性打包；
  - 在 `tests/card-actions.spec.ts` 中新增单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2261 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.2 2026-10-29 · 触控手势动作映射与编辑器目标块解析解耦落地

- **触控手势动作结果映射解耦（`core/review-gesture.ts`，TSK-08 持续深化）**：
  - 提炼 `mapSwipeActionToOutcome`：纯函数将四向滑动手势动作（again/hard/good/easy/reveal）映射为评级数值或翻面动作，消除组件层多层 `else-if` 分支；
  - 在 `tests/review-gesture.spec.ts` 中新增 3 项单元测试；
- **编辑器导航目标块 ID 解析解耦（`core/card-interactions.ts`）**：
  - 提炼 `resolveEditorNavigationBlockId`：统一处理画板画布编辑与普通块在思源编辑器中打开时的目标块 ID 提取与回退；
  - 规范化 `openCanvasInEditor` 与 `openInEditor` 的目标块解析；
  - 在 `tests/card-interactions.spec.ts` 中新增 3 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2256 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.1 2026-10-29 · 选择题选项选中推进/星标反馈与时间预算预估解耦落地

- **选择题选中态记录与推进解耦（`core/choice-options.ts`，TSK-08 持续深化）**：
  - 提炼 `recordChoicePick`：不可变纯函数安全记录选择题用户选中索引并返回翻面信号；
  - 在 `tests/choice-options.spec.ts` 中新增 3 项单元测试；
- **星标切换反馈与震动配置解耦（`core/review-queue-pipeline.ts`）**：
  - 提炼 `formatStarToggleFeedback`：纯函数统一输出加星/取消星标的用户提示与触感模式；
  - 在 `tests/review-queue-pipeline.spec.ts` 中新增 2 项单元测试；
- **时间预算完成预估状态计算解耦（`core/session-budget.ts`）**：
  - 提炼 `resolveBudgetEstimate`：纯函数封装预算剩余、过期与可完成/未完成卡数预估；
  - 在 `tests/session-budget.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2250 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.215.0 2026-10-29 · 队列截取/回看快照构建与字典路径安全解析解耦里程碑

- **出题队列截取与回看快照构建解耦（`core/card-actions.ts`，TSK-08 持续深化）**：
  - 提炼 `createLastAnsweredSnapshot`：集中封装上一张已作答卡片的数据快照构建（自带空卡防御）；
  - 提炼 `sliceQueueAfterCurrent`：不可变纯函数安全截取当前卡片之后的剩余复习队列；
  - 在 `tests/card-actions.spec.ts` 中新增 2 项单元测试；
- **返场多语言字典点分路径安全读取解耦（`core/return-check.ts`）**：
  - 提炼 `resolveI18nPath`：纯函数安全读取多层嵌套国际化字典，缺失或异常时安全回退路径键；
  - 在 `tests/return-check.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2243 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.9 2026-10-29 · 倒计时启动前置条件与挖空步进完成回调解耦落地

- **倒计时启动前置条件判定解耦（`core/review-countdown.ts`，TSK-08 持续深化）**：
  - 提炼 `isCountdownEligible`：纯函数统一校验超时模式非 `off`、当前卡片就绪且未处于暂停或模态窗口开启状态；
  - 在 `tests/review-countdown.spec.ts` 中新增 4 项单元测试；
- **挖空揭晓步进与完成判定解耦（`core/cloze-stepper.ts`）**：
  - 提炼 `advanceClozeStep`：纯函数统一累加挖空揭晓计数并在全部揭晓时执行翻面回调；
  - 消除 `review.svelte` 中 `onCardContentClick` 与 `revealNextClozeOrAll` 的重复状态处理；
  - 在 `tests/cloze-stepper.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2239 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.8 2026-10-29 · 矢量画板与绘图卡面判定解耦落地

- **矢量画板与绘图卡面判定解耦（`core/card-face.ts`，TSK-08 持续深化）**：
  - 提炼 `hasSvgOrCanvasDrawing`：纯函数统一识别卡面中包含的 SVG 标签、SVG 矢量素材引用或 Excalidraw 画布；
  - 在 `tests/card-face.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - `src/ui/review.svelte` 移除内联复杂正则判断；
  - 全库扩展至 289 个测试文件、2233 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.7 2026-10-29 · 瞬态题型状态重置统一与减负建议展开状态机解耦落地

- **瞬态题型状态机重置统一（`core/quiz-interactive.ts`，TSK-08 持续深化）**：
  - 提炼 `createInitialEphemeralQuizState`：返回选择题、判断题、打字题等 8 项题型瞬态的初始默认值；
  - 统一 `resetCardState()` 与 `loadBlockDOM()` 题面变动时的重置逻辑，消除重复内联赋值与潜在状态遗留；
  - 在 `tests/quiz-interactive.spec.ts` 中新增单元测试；
- **减负建议展开状态流转解耦（`core/load-relief.ts`）**：
  - 提炼 `toggleReliefChoice`：纯函数控制单项减负建议（窄屏聚焦、高优先级等）展开与折叠互斥逻辑；
  - 在 `tests/load-relief.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2231 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.6 2026-10-29 · 题型得分统计更新/字号百分比格式化与题面失效判定解耦落地

- **交互题型得分统计更新解耦（`core/quiz-interactive.ts`，TSK-08 持续深化）**：
  - 提炼 `updateQuizScoreCounters`：纯函数统一累加总题数（`total`）与答对数（`correct`），消除主复习组件三处题型提交中的分散累加；
  - `evaluateChoiceQuiz` / `evaluateJudgeQuiz` / `evaluateFillQuiz` 增强携带 `toastDuration`，消除组件层内联硬编码提示延时；
  - 在 `tests/quiz-interactive.spec.ts` 中新增单元测试；
- **字号百分比格式化与题面衍生状态废弃判定解耦（`core/card-actions.ts`）**：
  - 提炼 `formatFontScalePercent`：格式化卡面缩放比例百分比字符串（自带非有限值与空值防御）；
  - 提炼 `shouldInvalidateCardDerivedState`：判定卡片题面在编辑返回后是否发生变动，需要废弃题型及打字等临时状态；
  - 在 `tests/card-actions.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 全库扩展至 289 个测试文件、2228 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.5 2026-10-29 · 路径面包屑行记录解析与听写自动朗读判定解耦落地

- **路径面包屑行记录解析解耦（`core/review-breadcrumbs.ts`，TSK-08 持续深化）**：
  - 提炼 `formatHPathDisplay`：纯函数标准化将思源块 hpath 格式化为层级导航路径（如 `笔记 › 章节 › 知识点`）；
  - 提炼 `resolveCardBreadcrumbsFromRows`：从 SQL 查询返回的行记录安全提取路径字符串与面包屑链对象，自带空记录防御；
  - 在 `tests/review-breadcrumbs.spec.ts` 中新增 3 项单元测试；
- **听写自动朗读判定纯函数化（`core/review-audio.ts`）**：
  - 提炼 `shouldAutoSpeakDictation`：统一收敛打字模式、听写开关及答案非空判定的组合逻辑；
  - 在 `tests/review-audio.spec.ts` 中新增 2 项单元测试；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 进一步精简，移除内联字符串替换与条件组合；
  - 全库扩展至 289 个测试文件、2223 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.4 2026-10-29 · 选项选中流转/快速改期请求构建与分级提示状态机解耦落地

- **选项选中状态流转解耦（`core/quiz-interactive.ts`，TSK-08 持续深化）**：
  - 提炼 `toggleChoiceSelection`：纯函数统一处理单选与多选选中状态切换、触感强度（`hapticStrength`）与单选自动提交（`shouldAutoSubmit`）标志；
  - 在 `tests/quiz-interactive.spec.ts` 中新增单元测试（覆盖单选替换与多选增删）；
- **快速改期请求构建与复用判定解耦（`core/reschedule-preview.ts`）**：
  - 提炼 `buildRescheduleRequest`：严格校验改期合法天数（1 ~ 36500 天），安全复用正在重试的请求或计算生成 14 位目标时间戳；
  - 在 `tests/reschedule-preview.spec.ts` 中新增 4 项单元测试；
- **分级提示状态推进与日志解耦（`core/hint-ladder.ts`）**：
  - 提炼 `advanceCardHint`：统一封装阶梯推导、full 级即翻面逻辑与日志条目构造；
  - 在 `tests/hint-ladder.spec.ts` 中新增 3 项单元测试；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 **2300 行**（净减 16 行，相较最初 3412 行累计削减达 **1112 行代码**）；
  - 全库扩展至 289 个测试文件、2218 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.3 2026-10-29 · 中断恢复分支动作与打字作答评测解耦落地

- **中断恢复决策与快照构建解耦（`core/session-recovery.ts`，TSK-08 持续深化）**：
  - 提炼 `resolveRecoveryAction`：统一解析四种分支操作（resume 保场续用 / summary 查看摘要 / narrow 缩小范围 / end 清空重开）；
  - 提炼 `createRecoverySnapshotFromCounters`：从会话计数、日期及队列剩余构建标准 `RecoverySnapshot` 结构，消除 `review.svelte` 与 `onMount` 中散落的对象组装；
  - 在 `tests/recovery-explain.spec.ts` 中补充专用单测用例；
- **打字作答评测与状态判定解耦（`core/card-actions.ts`）**：
  - 提炼 `evaluateCardTyping`：统一封装输入判空、放弃思考判定及打字评级计算，消除主组件直接依赖细节算法；
  - 在 `tests/card-actions.spec.ts` 中新增单元测试；
- **收工原因持久化与会话快照出口收拢（`core/session-state.ts`）**：
  - 提炼 `recordSessionEndReason`：安全校验并记录会话结束原因并落盘，精简完成态与自动时间到逻辑；
  - 消除 `pauseSessionAndReturn` 中重复的会话快照构建代码，统一经由 `persistSession()` 出口；
  - 在 `tests/session-state.spec.ts` 中新增单元测试；
- **选择题选项打乱纯函数化（`core/choice-options.ts`）**：
  - 提炼 `shuffleArray`：Fisher-Yates 算法纯函数，替代 `review.svelte` 内联函数并提供默认选项打乱机制；
  - 在 `tests/choice-options.spec.ts` 中新增单元测试；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 2316 行（净减 26 行，相较最初 3412 行累计削减达 **1096 行代码**）；
  - 全库扩展至 289 个测试文件、2209 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.214.2 2026-10-29 · 视口键盘避让/面板重入刷新与特征文本解析解耦落地

- **视口尺寸计算与软键盘避让器解耦（`core/viewport-keyboard.ts`，TSK-08 持续深化）**：
  - 提炼 `computeKeyboardViewportState`：根据 `window.innerHeight` 与 `visualViewport.height` 差值精确计算软键盘开启状态与底部避让像素（`keyboardInset`）；
  - 配备专门的单元测试套件 `tests/viewport-keyboard.spec.ts`（3 项用例全面验证阈值判定与负值防护）；
- **遮罩层判定与离开面板重入刷新判定解耦（`core/card-interactions.ts`）**：
  - 提炼 `isOverlayTarget`：自动识别模态弹窗遮罩、工具栏二级菜单或背景蒙层；
  - 提炼 `shouldRefreshOnPanelPointer`：判定用户切回复习面板时是否已离开超过 15 秒并触发卡片静默重载；
  - 在 `tests/card-interactions.spec.ts` 中新增 2 项单测，全套件达 12 项用例全部通过；
- **富内容特征展示文本解析解耦（`core/card-face.ts`）**：
  - 提炼 `resolveFaceHintLabel`：从 `aiFace.hint.<key>` 格式的键名自动解析多语言词条，消除主文件内部字符串分割逻辑；
  - 在 `tests/card-face.spec.ts` 中新增 1 项单测，全套件达 22 项用例全部通过；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 2342 行（相较最初 3412 行累计削减达 **1070 行代码**）；
  - 全库扩展至 289 个测试文件、2201 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.214.1 2026-10-29 · 卡面交互解析与回看状态机解耦落地

- **卡面内容点击与画板双击交互控制器解耦（`core/card-interactions.ts`，TSK-08 持续深化）**：
  - 提炼 `handleCardContentClick`：统一封装卡面图片单击放大（`zoom-image`）与问题态挖空逐空揭晓（`cloze-reveal`）的 DOM 冒泡解析逻辑；
  - 提炼 `handleCardCanvasDblClick`：解析 SVG/Excalidraw 画布双击就地跳转思源编辑器打开的节点 ID 提取与兜底回退；
  - 提炼 `togglePeekCard`：纯函数状态机驱动上一张已复习卡片的回看状态（`opened` / `closed` / `none`）；
  - 配备完整的独立单元测试套件 `tests/card-interactions.spec.ts`（10 项用例全面覆盖图片灯箱、挖空单步、双击画布与回看状态流转）；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 2346 行（净减 18 行，相较最初 3412 行累计削减达 **1066 行代码**）；
  - 全库扩展至 288 个测试文件、2195 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.214.0 2026-10-28 · 会话快照生成与中断恢复纯引擎解耦大版本里程碑

- **复习会话快照与重载恢复引擎解耦（`core/session-state.ts`，TSK-08 阶段大版本里程碑）**：
  - 提炼 `createSessionSnapshot`：统一生成进行中会话快照结构（浅拷贝隔离 `reviewedIDs` / `skippedIDs` 集合防突变污染），并在 `persistSession` 与 `pauseSessionAndReturn` 中无缝复用；
  - 提炼 `restoreSessionProgress`：纯函数驱动重载会话恢复，自动校验完成状态与有效进度，生成干净的 `RestoredSessionState` 与 `recoverySnap`；
  - 在 `tests/session-state.spec.ts` 中新增 3 项单测，全套件达 12 项用例全部通过；
- **清理模态弹窗死状态与优化倒计时挂起**：
  - 清理了未绑定的 `sessionModalEl` 变量与无用键盘 Tab 事件分支；
  - 规范化弹窗开启时的倒计时暂停与关闭时原剩余时间精确恢复机制；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 2364 行（相较最初 3412 行累计削减近 1050 行代码）；
  - 全库扩展至 287 个测试文件、2185 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.9 2026-10-28 · 作答耗时封顶/会话计数更新与就地退役队列解耦落地

- **作答耗时封顶与会话计数状态机解耦（`core/card-actions.ts`，TSK-08 持续深化）**：
  - 提炼 `computeAnswerDuration`：严格根据题面呈现时间戳与会话封顶秒数（`answerTimeCapSec`，防后台停留或离席异常样本）计算合法 revlog 时长；
  - 提炼 `updateSessionCountersOnRate`：纯函数驱动遗忘、新卡与复习计数状态更新，消除评分异步流程中的交织突变；
  - 提炼 `createEmptySessionCounters`：提供全 0 空计数器工厂函数；
  - 提炼 `removeCardFromQueue`：纯函数按 cardID 过滤出题队列，使就地移出卡组（`retireCurrentCard`）与队列出卡逻辑完全解耦；
  - 在 `tests/card-actions.spec.ts` 中新增 5 项单测，全套件达 8 项用例全部通过；
- **全量门禁与质量验证**：
  - 全库扩展至 287 个测试文件、2177 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.8 2026-10-28 · 出题队列批量质检与范围到期统一查询解耦落地（累积削减 1000+ 行代码！）

- **出题队列批量质检过滤解耦（`core/review-queue-quality.ts`，TSK-08 持续深化）**：
  - 将出题卡片大批量异步查询 Markdown 与遮挡属性的并发分块流程（400/块、3并发）彻底封装为纯函数 `filterReviewQueueByQuality`；
  - 内部整合 `validateFlashcardMarkdown`、`hasQuestionMediaContent` 与 `mapChunksOrdered`，从 `review.svelte` 中彻底移除了 3 处冗余底层依赖；
  - 配备完整的独立单元测试套件 `tests/review-queue-quality.spec.ts`（3 项用例全面覆盖丢失块隔离、空内容块检测、异步遮挡校验与空列表安全返回）；
- **范围到期卡片统一查询路由（`api/riff.ts`）**：
  - 提供 `getRiffDueCardsForScope`，统一按范围键前缀（`deck:` / `notebook:` / `doc:` / `all`）分发到对应内核 API；
  - 配备专门的单元测试套件 `tests/riff-scope.spec.ts`；
- **主复习文件规模突破性收敛**：
  - 复习主模板 `review.svelte` 代码行数由 2427 行进一步大幅下降至 2378 行（净减 49 行，相较最初 3412 行累计净削减达 **1034 行代码**，总削减量突破千行！）；
  - 全库扩展至 287 个测试文件、2177 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.7 2026-10-28 · 卡面答案提取与改期时间戳生成引擎解耦落地

- **卡面权威期望答案提取与块属性元信息解析解耦（`core/card-face.ts`，TSK-08 持续深化）**：
  - 提炼 `extractExpectedCardAnswer`：从卡面 HTML 中按照挖空标记合集 > 超级块背面 > 存量问答语法 > 纯文本回退的层级顺序提取权威参考答案；
  - 提炼 `parseCardAttrsMetadata`：封装块属性中遮挡数据（`occlusion`）、自定义答案（`custom-card-answer`）、备忘（`memo`）以及无挖空自适应回退解析逻辑；
  - 同步清理了 `review.svelte` 中不再直接引用的 `parseDelimitedQa`、`isSuperBlockHtml` 与 `extractSuperBlockTexts` 模块导入；
  - 在 `tests/card-face.spec.ts` 中新增 2 项单测，全套件达 21 项用例全部通过；
- **改期目标 14 位紧凑时间戳生成器解耦（`core/reschedule-preview.ts`）**：
  - 提炼 `calculateTargetDueTimestamp`，优先复用重试改期时间戳，否则自动推算 `now + days` 并格式化为 14 位紧凑时间戳（`YYYYMMDDHHmmss`）；
  - 在 `tests/reschedule-preview.spec.ts` 中新增 2 项单测，全套件达 9 项用例全部通过；
- **KaTeX/MathJax 渲染生命周期自收敛（`ReviewCardBody.svelte`）**：
  - 将数学公式与流程图的异步二次渲染检测（`initKaTeX`）完全收敛于 `ReviewCardBody.svelte` 内部，消除主组件跨层 DOM 探测；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数由 2444 行进一步降至 2427 行（净减 17 行，相较最初 3412 行累计削减近 990 行代码）；
  - 全库扩展至 285 个测试文件、2173 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.6 2026-10-28 · 分级提示步进与移动端触控滑卡解耦落地

- **分级提示阶梯步进与指示器解耦（`core/hint-ladder.ts`，TSK-08 持续深化）**：
  - 提炼 `formatHintLevelIndicator`：自动计算提示级别指示文本（`当前序/总级数`，如 `1/3`），内置无当前级别与空阶梯安全边界保护；
  - 提炼 `stepLadderHint`：从卡面 HTML 文本自动过滤标签并推导稀疏提示输入（支持 KO 事实优先），无缝步进至下一级提示；
  - 在 `tests/hint-derive.spec.ts` 中新增 3 项单测，全套件达 9 项用例全部通过；
- **移动端触控手势动作解析器解耦（`core/review-gesture.ts`）**：
  - 提炼 `resolveTouchSwipe`：统一综合弹窗/遮罩屏蔽开关、交互控件误触隔离、祖先元素横向滚动避让以及滑动坐标差计算，输出标准滑卡动作；
  - 在 `tests/review-gesture.spec.ts` 中新增单测，全套件达 9 项用例全部通过；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 2444 行（累计相较最初 3412 行削减 968 行代码）；
  - 全库扩展至 285 个测试文件、2169 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.5 2026-10-28 · 卡片字号/问题标记与到期格式化解耦落地

- **评分按键紧凑到期格式化器解耦（`core/due-format.ts`，TSK-08 持续深化）**：
  - 将评分按钮下方展示的下一次到期时间文本过滤（去除年份前缀与末尾秒数，如 `2026-10-31 14:00:00` -> `10-31 14:00`）抽离为独立纯模块 `src/core/due-format.ts`；
  - 配备专门的单元测试套件 `tests/due-format.spec.ts`（2 项用例覆盖合法时间戳过滤与空值保护）；
- **卡片字号缩放与格式问题标记解耦（`core/card-actions.ts`）**：
  - 提炼 `clampFontScale`（在 0.8~1.6 之间以 0.1 步进平滑增减卡面字号）；
  - 提炼 `toggleCardIssue`（不可变集合模式切换卡片格式问题标记）；
  - 配备专门的单元测试套件 `tests/card-actions.spec.ts`（3 项用例全面验证边界封顶与集合不可变性）；
- **长期返场四查展示映射解耦（`core/return-check.ts`）**：
  - 提炼 `formatReturnCheckItems`，将四查结果结合本地化 i18n 字典格式化为渲染所需的横幅条目，消除了主文件内部临时路径解析辅助函数；
  - 在 `tests/return-check.spec.ts` 中新增 1 项单测，全套件达 11 项用例全部通过；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数降至 2451 行（累计相较最初 3412 行削减 961 行代码）；
  - 全库扩展至 285 个测试文件、2164 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.4 2026-10-28 · 预算时钟、范围标签与会话选项覆盖解耦落地（-30+ 行）

- **会话时间预算倒计时时钟格式化（`core/session-budget.ts`，TSK-08 持续深化）**：
  - 将剩余秒数转为分秒格式时钟文本（`m:ss`）逻辑提炼为 `formatBudgetClock` 纯函数，内置异常非数值与非正数边界保护；
  - 在 `tests/session-budget.spec.ts` 中新增 1 项单测，全套件达 8 项用例全部通过；
- **顶栏范围展示文本解析器解耦（`core/scope-preset.ts`）**：
  - 将根据卡片所属卡组名优先、回退至卡组/笔记本/新卡/复习/全库的展示文案映射逻辑抽离为纯函数 `resolveHeadScopeLabel`；
  - 在 `tests/scope-preset.spec.ts` 中新增 1 项多场景单测，全套件达 13 项用例全部通过；
- **题型偏好弹窗选择与覆盖状态映射解耦（`core/session-prefs.ts`）**：
  - 提炼 `getInitialSessionVariant` 与 `resolveSessionVariantOverrides`，将题型弹窗单选状态与本场最小化覆盖集生成彻底函数化；
  - 在 `tests/session-prefs.spec.ts` 中新增 2 项单测，全套件达 8 项用例全部通过；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数由 2474 行进一步降至 2454 行（净减 20 行，相较最初 3412 行累计削减近 960 行代码）；
  - 全库扩展至 283 个测试文件、2158 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.3 2026-10-28 · 题型键盘路由与延迟重考调度器解耦落地（-70+ 行）

- **交互题型快捷键路由解耦（`core/quiz-interactive.ts`，TSK-08 持续深化）**：
  - 将单选题 A/B/C/D 与 1/2/3/4 数字键映射、多选题 Enter 键提交判定以及判断题 T/F/Y/N/1/2 键解析抽离为纯函数 `resolveQuizKeyboardAction`；
  - 自动输出标准化动作（`submit-choice`、`pick-option`、`pick-judge`），统一了题型按键处理；
  - 在 `tests/quiz-evaluator.spec.ts` 中新增 4 项单测，全套件达 16 项用例全部通过；
- **全局快捷键动作扩展与统一调度（`core/review-shortcuts.ts`）**：
  - 扩展 `resolveReviewKeyAction`，统一收敛 `r/R`（翻转回忆）、`z/Z`（专注模式切换）以及 `*`（星标卡片切换）按键调度；
  - 在 `tests/review-shortcuts.spec.ts` 中新增单测，全套件达 19 项用例全部通过；
- **延迟重考计时调度器解耦（`core/delayed-requeue.ts`）**：
  - 抽离 `createDelayedRequeueScheduler`，封装 `setTimeout`、1 秒倒计时秒表时钟驱动以及与队列异步网络拉取的数据防竞态机制（`isLoading` 自动避让）；
  - 移除了 `review.svelte` 内部的 `requeueTimer` / `requeueClockTimer` 原始计时器变量；
  - 在 `tests/delayed-requeue.spec.ts` 中新增 FakeTimers 调度单测；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数由 2546 行大幅精简至 2474 行（净减 72 行，相较最初 3412 行累计削减近 940 行代码）；
  - 全库扩展至 283 个测试文件、2153 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.2 2026-10-28 · 复习队列排序管道与返场横幅计算解耦落地（-40+ 行）

- **复习队列处理与排序管道解耦（`core/review-queue-pipeline.ts`，TSK-08 持续深化）**：
  - 将出题队列的仅新/仅旧模式筛选、批次上限（`batchLimit`）截断、同源兄弟卡防剧透推迟（`burySiblings`）以及考前冲刺降序/倒序/洗牌打乱纯逻辑抽离为 `applyQueuePipeline` 纯函数；
  - 提炼 `calculateReviewAccuracy` 函数，自动基于交互式题型答题数或新卡/复习/遗忘扣除口径计算会话准确率百分比（0-100%），供小驴打卡生态联动安全广播；
  - 封装 `toggleCardStar` 不可变星标切换函数；
  - 配备完整的独立单元测试套件 `tests/review-queue-pipeline.spec.ts`（11 项用例覆盖新旧范围过滤、兄弟卡推迟、各类排序规则、命中率计算与星标集合不可变性）；
- **跨天返场分流横幅计算解耦（`core/return-triage.ts`）**：
  - 将 `deriveReturnBanner` 抽离至核心模块，自动对比上日会话时间戳与当前自然日，并基于收工原因（`time-up`、`energy` 等）计算返场方案、建议上限文案与操作步骤；
  - 在 `tests/return-triage.spec.ts` 中新增 3 项单测，全面覆盖同日跳过、跨天计算与空状态防御；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数由 2582 行进一步精简至 2546 行（净减 36 行，相较最初 3412 行累计削减近 870 行代码）；
  - 全库扩展至 283 个测试文件、2146 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.1 2026-10-28 · 完成态度量与选择题选项生成引擎解耦落地（-30+ 行）

- **复习完成态指标与叙事计算引擎解耦（`core/completion-metrics.ts`，TSK-08 持续深化）**：
  - 将会话结束屏（`ReviewDonePanel`）的会话耗时计时（`formatSessionDuration`）、每日复习目标进度文本（`formatTargetProgress`）、连击天数里程碑庆祝文案判定（`formatStreakMilestone`，7/30/100/365 天）、基于自然日模除轮换的学习科学每日贴士（`getDailyScienceTip`）以及零作答空队列状态判定（`isEmptyQueueSession`）抽离为独立纯核心模块 `src/core/completion-metrics.ts`；
  - 配备专门的单元测试套件 `tests/completion-metrics.spec.ts`（9 项用例全面验证时长格式化、空队列判定、目标完成度文本、里程碑连击与科学贴士轮换）；
- **选择题答案提取与选项组装引擎解耦（`core/choice-options.ts`）**：
  - 将从块 DOM 中提取答案权威文本的逻辑（支持挖空标记、问答分隔符与纯文本回退）提炼为 `extractAnswerFromDomHtml`；
  - 提供 `assembleChoiceOptions` 纯函数，支持传入自定义洗牌算法对正确答案与候选干扰项完成打乱组装，并精确定位正确答案索引与初始未作答状态；
  - 在 `tests/choice-options.spec.ts` 中新增 6 项单测，覆盖选项组装、答案索引定位、干扰项不足降级与 DOM 文本提取规则，全测试套件扩展至 12 项用例全绿；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数由 2610 行进一步精简至 2582 行（净减 28 行，相较最初 3412 行累计削减 830 行代码）；
  - 全库扩展至 282 个测试文件、2132 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.213.0 2026-10-28 · 复习历史栈管理与改期遮挡几何计算解耦里程碑（累积削减 800+ 行）

- **复习撤销历史栈控制器解耦（`core/review-history.ts`，TSK-08 阶段性里程碑）**：
  - 将单次复习会话内的全量状态快照生成、压栈、出栈与最大深度限制（`MAX_REVIEW_HISTORY_DEPTH = 50`）抽离为独立纯模块 `src/core/review-history.ts`；
  - 提供 `createReviewHistorySnapshot`、`pushReviewHistory` 与 `popReviewHistory` 纯函数，确保队列、延迟卡、计数器与已复习集合的浅拷贝隔离，防止状态突变污染历史快照；
  - 配备专门的单元测试套件 `tests/review-history.spec.ts`（3 项用例全面验证集合深隔离、LIFO 撤销次序与超限安全淘汰）；
- **图片遮挡几何包围盒计算解耦（`core/occlusion.ts`）**：
  - 将卡面内部多媒体（图片/SVG/画布）相对容器滚动可视区的几何定位计算逻辑抽离至核心模块 `calculateOcclusionBox`；
  - 在 `tests/occlusion.spec.ts` 中新增 3 项几何计算测试用例；
- **快速改期时间推算与友好预览解耦（`core/reschedule-preview.ts`）**：
  - 将思源 14 位紧凑日期时间戳（`YYYYMMDDHHmmss`）解析、相对天数推算与多语言友好预览文本生成抽离为独立核心模块 `src/core/reschedule-preview.ts`；
  - 配备完整的单元测试套件 `tests/reschedule-preview.spec.ts`（7 项用例覆盖合法时间戳解析、本地化字符串格式化与天数推算）；
- **主复习文件规模与工程指标**：
  - 复习主模板 `review.svelte` 代码行数由 2669 行进一步降至 2610 行（净减 59 行，相较最初 3412 行累计削减超 800 行代码）；
  - 全库扩展至 281 个测试文件、2117 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.212.9 2026-10-28 · 交互式题型判分与挖空逐空控制器解耦落地（-50+ 行）

- **交互式题型评分评估引擎解耦（`quiz-interactive.ts`，TSK-08 持续深化）**：
  - 将复习界面内部分散的单选/多选对比、判断题判定、填空题评分与反馈消息构造逻辑提炼为纯逻辑评估引擎函数：`evaluateChoiceQuiz`、`evaluateJudgeQuiz`、`evaluateFillQuiz`；
  - 自动输出标准化评估结果（`isCorrect`、建议评级、触觉震动模式与提示消息类型），消除 `review.svelte` 内部的死状态与冗余分支；
  - 配备完整的独立单元测试套件 `tests/quiz-evaluator.spec.ts`（12 项用例覆盖单选正误、多选漏选与错选、判断题比对、填空完全匹配与拼写微瑕容错）；
- **挖空逐空揭晓控制器解耦（`core/cloze-stepper.ts`）**：
  - 将单张多空闪卡在问题态逐步单独揭晓的 DOM 状态机与推进逻辑抽离为核心纯模块 `src/core/cloze-stepper.ts`；
  - 提供 `revealSingleCloze`、`queryClozeMarks`、`isAllClozeRevealed`、`stepNextCloze` 与 `handleClozeClick`，实现逐空推进、状态追踪与全空揭晓翻面闭环；
  - 复习主模板 `review.svelte` 代码行数由 2713 行进一步精简至 2669 行（净减 44 行，累计自 3412 行削减近 750 行）；
  - 配备专门的单元测试套件 `tests/cloze-stepper.spec.ts`（4 项用例全面验证逐空揭晓属性还原、全空状态检测、多空单步推进与单空直翻防护）；
- **全量门禁与质量验证**：
  - 全库扩展至 279 个测试文件、2104 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 97.0%；构建与发布包 smoke-dist 全部通过。


## v0.212.8 2026-10-28 · 重考倒计时与卡面正文题型解耦落地（-110+ 行，设计令牌突破 97%）

- **短暂重考倒计时等待面板解耦（`ReviewRequeueWaiting.svelte`，TSK-08 持续深化）**：
  - 将会话内低评分卡片重考暂存倒计时面板抽离为独立子组件 `src/ui/review/ReviewRequeueWaiting.svelte`；
  - 内部自收敛 `.lv-empty-queue` 居中叙述样式，提供倒计时显示、队列刷新与撤销上一张操作；
  - 配备专门的单元测试套件 `tests/review-requeue-waiting.spec.ts`（3 项用例覆盖倒计时渲染、刷新触发、历史状态与繁忙门禁禁用）；
- **卡面正文富文本与交互题型呈现解耦（`ReviewCardBody.svelte`）**：
  - 将卡面加载中骨架、加载失败重试占位（`.lv-face-error`）、正文富文本呈现（`.lv-card-content`，支持普通块/超级块渲染/遮罩/自定义CSS注入/公式/代码块/表格/引用自适应横滚）、交互式题型选择/判断/填空组件（`ReviewInteractiveQuiz`）以及富内容特征提示行（`faceHints`）统一抽离至独立子组件 `src/ui/review/ReviewCardBody.svelte`；
  - 内部完整自收敛大图微缩防溢出、数学公式横滚、代码块暗色容器、引用线及表格边框等 80 行复杂排版样式；
  - 复习主模板 `review.svelte` 代码行数由 2831 行进一步收敛至 2713 行（净减 118 行，累计自 3412 行削减近 700 行）；
  - 全库设计令牌系统覆盖率正式突破 **97.0%**；
  - 配备专门的单元测试套件 `tests/review-card-body.spec.ts`（4 项用例覆盖错误态重试、加载态骨架、卡面正文点击双击交互与富内容提示）；
- **全量门禁与质量验证**：
  - 全库扩展至 277 个测试文件、2088 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.212.7 2026-10-28 · 复习进度顶栏与作答交互控制解耦落地（-230+ 行）

- **复习进度与卡片元信息顶栏解耦（`ReviewProgressHeader.svelte`，TSK-08 持续深化）**：
  - 将复习界面顶部身份行、返回主页入口、`entryCtx` 来源上下文条、冲刺模式标签、会话总预算倒计时与到点提醒、低评分重新入队重考标签、卡片作答限时预警、新卡/复习/遗忘/卡型/易混淆/格式问题等元信息徽章组以及本场评分双段进度条抽离为独立子组件 `src/ui/review/ReviewProgressHeader.svelte`；
  - 内部完整自收敛 `.lv-head-row`、`.lv-entry`、`.lv-progress`、`.lv-progress-bar`、`.lv-timeout`、`.lv-tags` 等专用 SCSS 样式；
  - 配备完整的独立单元测试套件 `tests/review-progress-header.spec.ts`（5 项用例全面覆盖返回主页、来源上下文交互、辅助标签响应、卡片类型匹配与双段进度条比例）；
- **卡片作答交互与阶梯提示翻面控制解耦（`ReviewAnswerSection.svelte`）**：
  - 将问题态打字输入框（`.lv-typing`）、单选题选项矩阵与自由回忆回退/生成选项按钮（`.lv-choices`）、分级阶梯提示展示区（`.lv-hint-text`）、提示推进与全卡翻面透明热区按键（`.lv-reveal`）、翻面快捷键指引（`.lv-reveal-hint`）、答案态拼写容错与打字逐字对比区（`.lv-typing-diff`）以及朗读按钮（`.lv-tts-row`）抽离为独立子组件 `src/ui/review/ReviewAnswerSection.svelte`；
  - 内部完整自收敛选项矩阵、打字对比、翻面热区微光以及提示条的全部 SCSS 样式；
  - 复习主模板 `review.svelte` 代码行数由 3069 行大幅下降至 2831 行（净减 238 行，累计自 3412 行削减近 600 行）；
  - 配备专门的单元测试套件 `tests/review-answer-section.spec.ts`（5 项用例全面覆盖打字提交、单选高亮与禁用、自由回忆回退、分级提示与翻面触发、答案态逐字对比与语音朗读）；
- **全量门禁与质量验证**：
  - 全库扩展至 275 个测试文件、2081 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 96.9%；构建与发布包 smoke-dist 全部通过。


## v0.212.6 2026-10-28 · 助记便签与图片遮挡交互蒙版解耦落地（-140+ 行）

- **翻面助记便签与原生回忆引导解耦（`ReviewMemoCallout.svelte`，TSK-08 持续深化）**：
  - 将卡面翻面后展示的生态插件答案、思源块备注参考答案、助记线索提示（`.lv-card-memo-callout`）、思源原生自由回忆无损自评引导（`.lv-native-recall-guidance`）以及助记便签快速记录入口（`.lv-memo-prompt`）抽离为独立子组件 `src/ui/review/ReviewMemoCallout.svelte`；
  - 内部完整自收敛便签与回忆引导的 SCSS 样式，使用 `--lv-type-meta-size` 令牌进一步提升设计令牌覆盖率；
  - 配备完整的独立单元测试套件 `tests/review-memo-callout.spec.ts`（7 项用例覆盖全部形态切换与交互触发）；
- **图片遮挡交互蒙版组件解耦（`ReviewOcclusionOverlay.svelte`）**：
  - 将图片遮挡（Image Occlusion）卡型的 SVG 蒙版图层及逐框点击显隐/答案态全显交互逻辑抽离为独立子组件 `src/ui/review/ReviewOcclusionOverlay.svelte`；
  - 内置无障碍键盘支持（`role="button"`、`tabindex`、`aria-label` 与 Enter/Space 键响应），Svelte 诊断 0 警告；
  - 复习主模板 `review.svelte` 代码行数由 3211 行进一步削减至 3069 行（净减 142 行）；
  - 配备专门的单元测试套件 `tests/review-occlusion-overlay.spec.ts`（5 项用例覆盖包围盒定位、逐框交互、答案态只读及无障碍键盘操控）；
- **全量门禁与质量验证**：
  - 全库扩展至 273 个测试文件、2071 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；设计令牌审计达 96.9%；构建与发布包 smoke-dist 全部通过。


## v0.212.5 2026-10-28 · 会话状态横幅与卡面语境面包屑解耦落地（-200+ 行）

- **复习会话控制与减负横幅解耦（`ReviewSessionBanners.svelte`，TSK-08 持续深化）**：
  - 将复习工作台顶部 5 组关键控制与状态横幅（暂停继续条、BI-27 返场分流横幅、BI-9 中断恢复四选一分支、BI-10/BI-13 长期返场检查与减负选择、质量不合规卡片隔离警示）完整抽离至独立子组件 `src/ui/review/ReviewSessionBanners.svelte`；
  - 内部完整自收敛恢复与减负专用 SCSS 样式（`.lv-recover`, `.lv-return`, `.lv-relief` 等），进一步清理主复习页面样式冗余；
  - 配备专门的单元测试套件 `tests/review-session-banners.spec.ts`；
- **卡面来源文档层级面包屑解耦（`ReviewCardBreadcrumbs.svelte`）**：
  - 将卡面顶部的文档知识语境层级面包屑抽离为独立子组件 `src/ui/review/ReviewCardBreadcrumbs.svelte`；
  - 自收敛多层级展开/末级文档折叠切换、无障碍键盘响应与点击查阅来源文档上下文抽屉逻辑；
  - 独立封装胶囊型知识语境指示器样式，复习主模板 `review.svelte` 代码行数再次净减 200+ 行（从 3412 行收敛至 3211 行）；
  - 配备专门的单元测试套件 `tests/review-card-breadcrumbs.spec.ts`；
- **历史回归断言与设计令牌同步修复**：
  - 修复因历史架构解耦迁移与 `--lv-color-brand` 设计令牌升级引起的 3 个断言匹配路径滞后问题，保持契约测试的高保真防护；
- **全量门禁与质量验证**：
  - 全库扩展至 271 个测试文件、2059 项测试 100% 通过；TypeScript 类型检查 0 错误；Svelte 诊断 0 错误 0 警告；构建与发布包 smoke-dist 全部通过。


## v0.212.4 2026-10-28 · 空队列复习就绪看板独立解耦落地（-360+ 行）

- **空队列复习就绪看板独立解耦（ReviewReadyDashboard，TSK-08 持续深化）**：
  - 将复习界面内部完整的空队列复习就绪看板（Review Ready Bento Hub）抽离为独立子组件 `src/ui/review/ReviewReadyDashboard.svelte`；
  - 组件内部自收敛顶部范围快捷切换胶囊、异常隔离卡片专属警示卡、三大便当盒功能矩阵（提前冲刺 Cram、扩充制作新卡、卡库浏览管理）以及底栏状态刷新与返回主页路径；
  - 复习主模板 `review.svelte` 代码行数再次净减近 370 行，主复习心流与空态逻辑彻底解耦分离；
  - 配备完整的独立单元测试套件 `tests/review-ready-dashboard.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 269 个测试文件、2048 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.212.3 2026-10-28 · 底部评分条与错误原因标注条独立解耦落地（-180+ 行）

- **复习工作台底部评分条独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部的底部操作条（`ReviewRatingBar.svelte`）完整抽离为独立子组件；
  - 组件内部自收敛未翻面态的主动作（Space 显示答案 / 逐步回忆揭晓下一空 / Shift+Space 全部揭晓）、已翻面态的三档自评（不认识/模糊/认识）与四档自评（重来/困难/良好/简单）、建议评分高亮（`lv-btn-suggested`）、物理按键反馈动效（`lv-btn-pressed`）及紧凑密度响应；
  - 配备完整的独立单元测试套件 `tests/review-rating-bar.spec.ts`；
- **遗忘卡错误原因标注条独立解耦（`ReviewErrorTagBar.svelte`）**：
  - 新增核心模块 `src/core/error-tags.ts`，统一收敛 `ERROR_REASON_IDS` 定义；
  - 将遗忘后旁路错误原因打标（`ReviewErrorTagBar.svelte`）独立化，自带 7 种认知失误类型标签渲染与无障碍状态播报；
  - 复习主模板 `review.svelte` 代码行数再次净减 180+ 行，整体架构更加轻盈内聚；
  - 配备专门的单元测试套件 `tests/review-error-tag-bar.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 268 个测试文件、2045 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.212.2 2026-10-28 · 番茄限时组件解耦与管理器卡型大纲挖空过滤落地

- **复习工作台番茄专注与限时到期提醒独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部的 25 分钟番茄专注周期达成休息卡片与超时到点自评提醒（`budgetExpired` / `timeoutExpired`）完整剥离为独立子组件 `ReviewCountdownBanner.svelte`；
  - 内部自收敛番茄图标、休息建议引导、休息返回与继续复习回调；
  - 主复习模板 `review.svelte` 代码行数再次净减 40+ 行，未使用的 alert SCSS 被完全剔除；
  - 配备完整的独立单元测试套件 `tests/review-countdown-banner.spec.ts`；
- **闪卡管理器（Manager）支持大纲挖空与超级块卡型筛选（对齐全卡型徽标体系）**：
  - 在卡片管理器的药丸工具条中新增卡型下拉选择器（`cardTypeFilter`），支持「全部 / 大纲挖空 / 超级块」精准按需检索；
  - 过滤算法与复习端大纲卡徽标体系完全一致，用户能够极速检视并批量维护大纲结构化挖空卡；
  - 配备专门的单元测试套件 `tests/manager-card-type-filter.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 266 个测试文件、2038 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.212.1 2026-10-28 · 复习顶栏与二级工具菜单独立解耦落地（-150+ 行）

- **复习工作台顶栏与二级工具菜单独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部庞大的顶栏工具行与折叠气泡菜单（`ReviewToolbar.svelte`）完整剥离为独立子组件；
  - 顶栏自收敛复习范围下拉框、会话目的选择、A-/A+ 字号缩放、星标、疑问标记、暂停、撤销、跳过以及折叠气泡二级菜单的生命周期与键盘 Esc 优雅收起；
  - 主复习模板 `review.svelte` 代码行数再次净减 150+ 行，整体架构彻底形成“顶栏 + 专注岛 + 题面 + 交互题型 + 偏好 + 抽屉 + 模态 + 完成屏”的高内聚模块化矩阵；
  - 配备完整的独立单元测试套件 `tests/review-toolbar.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 264 个测试文件、2035 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.212.0 2026-10-28 · 沉睡知识一键批量入箱闭环与快速改期组件独立解耦里程碑

- **沉睡知识自动挖掘一键批量收纳进待提炼收件箱（Extract Inbox 闭环）**：
  - 在闪卡中心（Dashboard）将沉睡知识挖掘结果与材料收件箱通道深度打通，点击【去唤醒】即可自动将挖掘出的重点高亮孤岛块批量推入收件箱；
  - 自动回显收纳成功状态，并平滑导航至收件箱供用户开展渐进提炼制卡，真正打通“自动挖掘 -> 批量收纳 -> 渐进蒸馏 -> FSRS 复习”的完整生产力闭环；
  - 配备专门的单元测试套件 `tests/dormant-to-inbox.spec.ts`；
- **复习工作台快速改期面板独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部的快速改期面板（`showReschedule` / `rescheduleDays`）完整剥离为独立可测试组件 `ReviewRescheduleModal.svelte`；
  - 自自带天数范围合法性校验、到期时间戳精准预览、错误自愈重试机制及独立 scoped 样式；
  - 主复习模板 `review.svelte` 代码行数再次净减 40+ 行，整体架构更加轻盈内聚；
  - 配备完整的独立单元测试套件 `tests/review-reschedule-modal.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 263 个测试文件、2032 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.9 2026-10-28 · 复习本场偏好面板独立组件解耦落地

- **复习工作台本场临时偏好面板独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部的本场偏好内联面板（`prefsOpen` / `.lv-prefs`）完整剥离为独立可测试组件 `ReviewSessionPrefs.svelte`；
  - 面板内部自收敛评分制切换（三档/四档）、反转自测开关、混合题型轮换、超时模式选择、单场时长预算调整及恢复全局默认等微交互；
  - 主复习模板 `review.svelte` 代码行数再次净减 80+ 行，代码整洁度与高内聚特性进一步巩固；
  - 配备完整的独立单元测试套件 `tests/review-session-prefs.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 261 个测试文件、2026 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.8 2026-10-28 · 复习来源上下文抽屉独立组件解耦落地

- **复习工作台来源文档上下文抽屉独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部的来源上下文抽屉（`ctxOpen` / `ctxBlocks`）彻底抽离为独立可测试组件 `ReviewContextDrawer.svelte`；
  - 抽屉内部自收敛上下文骨架屏加载动画（`LvSkeleton`）、前后关联块列表渲染与当前卡片块专属高亮（`lv-ctx-cur`）；
  - 主复习模板 `review.svelte` 代码行数再次净减 80+ 行，并彻底清理未使用的样式与引用；
  - 配备完整的独立单元测试套件 `tests/review-context-drawer.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 260 个测试文件、2021 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.7 2026-10-28 · 复习快捷键帮助与回看浮层独立解耦落地

- **复习工作台快捷键帮助与回看浮层独立解耦（TSK-08 持续深化）**：
  - 将复习界面内部的快捷键帮助浮层（`helpOpen`）与回看上一张已复习卡片浮层（`peek`）完整剥离为独立子组件 `ReviewHelpAndPeek.svelte`；
  - 浮层内部自收敛键盘无障碍焦点捕获（`helpEl.focus()`）、淡入淡出动画、双栏响应式快捷键网格及只读卡面遮罩渲染；
  - 复习主文件 `review.svelte` 代码行数再次净减 100+ 行，整体架构更加轻盈内聚；
  - 配备专门的独立单元测试套件 `tests/review-help-and-peek.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 259 个测试文件、2016 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.6 2026-10-28 · 大纲/列表树节点挖空渲染与未制卡沉睡知识自动挖掘落地

- **大纲/列表树节点级挖空复习（Cloze Node Review，借鉴 KMind Zen）**：
  - 在卡片识别中对嵌套大纲树（`NodeList` / `NodeListItem`）的挖空节点进行高保真骨架保留与结构化遮罩，为卡片标注专属 `<LvIcon name="list" size={14} /> 大纲挖空` 徽标；
  - 树形结构上下级父子节点完整展示作为记忆脚手架，唯独关键知识节点打上灵动遮罩槽，答案态高亮展开，极大提升法学体系、医学解剖与计算机协议等大纲类知识的记忆效率；
- **沉睡知识挖掘仪（Dormant Knowledge Discovery，借鉴 Network Lens）**：
  - 新增核心模块 `src/core/dormant-knowledge.ts`，自动分析笔记中带有 `==` 关键高亮但尚未加入任何闪卡组的沉睡知识孤岛；
  - 在闪卡中心（Dashboard）待处理区域智能呈现「沉睡知识唤醒」推荐行，支持一键直达收件箱或快速制卡，彻底告别“只高亮不复习”的知识沉睡痛点；
  - 编写专用单元测试 `tests/dormant-knowledge.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 258 个测试文件、2014 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.5 2026-10-28 · 闪卡中心今日复习待办一键复制与卡片纯净隐藏父路径落地

- **闪卡中心今日行动区常驻【复制待办】快捷动作（协同 Task Horizon 任务视界）**：
  - 在 `dashboard.svelte` 今日行动 Hero 区域常驻次级按钮【复制待办】，用户点击一键生成今日 FSRS 记忆负荷待办卡片并自动复制到剪贴板；
  - 动态判定完成状态（未完成 `- [ ] 记忆复习：今日待复习 N 张闪卡` / 已完成 `- [x] 记忆复习：今日已无待复习闪卡`），用户无需任何繁琐配置，直接在日记或任务视界（Task Horizon）按下 Ctrl+V 即可完成每日复习任务挂载；
- **复习卡片来源面包屑支持隐藏父路径/极简纯净模式（匹配思源 #20698 纯净特性）**：
  - 在 `review.svelte` 面包屑区域增加层级折叠与展开交互，当卡片所属文档层级较深时，支持一键切换隐藏父路径（仅保留末级核心文档名），避免长串路径挤占垂直高度并分散做题注意力；
  - 悬停（Hover Tooltip）与点击滑出上下文抽屉依然完整保留全层级信息，兼顾沉浸专注与知识回溯；
  - 编写专用单元测试 `tests/daily-task-and-breadcrumbs.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 257 个测试文件、2010 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.4 2026-10-28 · Issue #20 闭环验收、原生编辑快捷键 e 打通与任务视界每日复习待办直连

- **思源原生闪卡核心快捷键 `e` / `E` 原位编辑卡片打通（Issue #20 深度闭环）**：
  - 补齐复习快捷键调度中的 `e` / `E`（Edit）按键支持，复习时敲击 `e` 即可立即通过 `openTab({ id, zoomIn: true })` 放大打开当前卡片块原位进行编辑，无论卡片包含文本、SVG 画布、Excalidraw 挂件还是公式均可极速修改，修改后回切无缝刷新；
  - 完善单元测试 `tests/review-shortcuts.spec.ts`；正式在 GitHub 评论并关闭 Issue #20；
- **配合 Task Horizon (任务视界) 落地每日 FSRS 记忆负荷微任务挂载（Issue #19 协同）**：
  - 在对外桥 `src/api/external-bridge.ts` 中接入 `daily-task-export` 能力，提供 `generateDailyTaskMarkdown(options)` 接口；
  - 自动根据当前未复习卡片总数生成 Markdown 待办任务（未完成 `- [ ] 记忆复习：今日待复习 N 张闪卡` / 已完成 `- [x] 记忆复习：今日已无待复习闪卡`），支持任务视界等任务插件一键挂载与完成打勾；
  - 完善单元测试 `tests/external-bridge.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 256 个测试文件、2006 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.3 2026-10-28 · 下拉选择框与表单输入控件文字垂直水平居中规范化修复

- **全库选择框（Select）与输入控件文字垂直/水平居中排版修复**：
  - 根治卡库（闪卡管理器）中排序（默认顺序）、状态过滤等药丸下拉框（`.lv-sort`）文字偏上、下方空白脱节的排版 Bug；
  - 清理多重规则冲突与 `min-height` 高度覆盖隐患，精准定义 `height: 30px; min-height: 30px; line-height: var(--lv-lh-control-lg); padding: calc(var(--lv-space-unit) * 2) calc(var(--lv-space-unit) * 4); text-align-last: center;`，实现文字在药丸框内绝对垂直居中与水平居中，与相邻胶囊按钮视觉完美对齐；
  - 修复全局 `src/index.scss` 中 `.b3-select` 被 `min-height: 38px` 强制拉大的历史遗留，统一紧凑尺寸适配；
  - 联动排查并修复复习工作台范围下拉框（`.lv-scope`）、搜索输入框（`.lv-filter`）、AI 笔记本选择框（`.lv-wb-nb-select`）以及通用 Kit 组件（`LvSelect` / `LvInput`）的文字垂直居中基线；
  - 编写专用样式与盒模型审查测试套件 `tests/select-and-input-alignment.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 256 个测试文件、2004 项测试 100% 通过；E2E 靶场 18 项全部通过；设计令牌覆盖率保持 97.2%；构建与烟雾测试全绿。


## v0.211.2 2026-10-27 · 22 槽持久化存储装载器解耦与坏键容错架构深化

- **22 槽持久化存储批量装载器（Storage Loader）独立解耦（TSK-07 持续深化）**：
  - 抽离 `src/bootstrap/storage-loader.ts`，统一负责 22 槽持久化存储的并发批量读取、单槽损坏防断死容错、多领域字段白名单清洗以及乐观回滚快照基线初始化；
  - 插件主入口 `src/index.ts` 代码再度精简 100+ 行，彻底消除了类内部对繁琐 normalize 函数的直接依赖；
  - 配备独立的单元测试套件 `tests/storage-loader.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 255 个测试文件、2000 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.1 2026-10-27 · 页签装配器独立解耦与插件主入口架构超级瘦身（-700+ 行）

- **页签装配器（Tab Registrars）独立解耦与架构质变（TSK-07 持续深化）**：
  - 抽离 `src/bootstrap/tab-registrars.ts`，将闪卡中心（`TAB_DASHBOARD`）与复习工作台（`TAB_REVIEW`）的生命周期挂载、多领域上下文（dashboardBase、managerCtx、exam、inbox、goals、maintenance）全量收敛至独立装配器；
  - 插件主入口 `src/index.ts` 代码体积自 196 KB 骤降至 148 KB，模板净减 700+ 行，生命周期与业务调度完全解耦；
  - 配备完整的单元测试套件 `tests/tab-registrars.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 254 个测试文件、1998 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.211.0 2026-10-27 · 渐进学习双级调度解耦、超级块闪卡精准对齐与架构模块化里程碑

- **独立模态对话框参数装配与生命周期解耦（TSK-07 持续深化）**：
  - 抽离 `src/bootstrap/dialog-openers.ts`，统一参数装配规范（修卡演练、限时挑战、概念配对、图片遮挡等），主入口 `src/index.ts` 再度精简 50+ 行；
  - 配备独立的单元测试套件 `tests/dialog-openers.spec.ts`；
- **全生命周期架构演进闭环（v0.211.0 里程碑总览）**：
  - **渐进学习两级调度解耦（SuperMemo 哲学）**：建立 `shouldBypassFsrs` 规约，粗加工摘录卡与 FSRS 遗忘曲线物理隔离，对外桥扩充 `receiveExtract` 承接小驴拾遗 `Alt+E` 信封并保留原文双链反链，支持 `Ctrl+D` 一键 Dismiss 解散归档；
  - **超级块闪卡（SuperBlock）100% 对齐**：严格实现首块为题、后续为答，问题态遮蔽后续答案块杜绝提前泄密，快速制卡新增超级块模板，卡片详情两段式结构化呈现；
  - **SVG / Excalidraw 画布编辑直通**：卡面常驻【✏️ 编辑画布】Bento 交互胶囊，支持双击画布直达思源原生 Protyle 画布编辑器；
  - **复习工作台高阶组件拆分**：将完成屏（`ReviewDonePanel`）、专注岛（`ReviewZenIsland`）、交互式题型（`ReviewInteractiveQuiz`）以及操作弹窗（`ReviewActionModals`）全量抽离为独立子组件；
  - **设计令牌覆盖率跃升至 97.4%**：`padding`、`margin`、`border-radius`、`z-index`、`gap`、`transition` 均实现 100% 满分覆盖；
- **全量门禁与质量验证**：
  - 全库扩展至 253 个测试文件、1996 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.99 2026-10-27 · 复习模态弹窗与图片灯箱独立组件解耦落地

- **复习工作台模态弹窗与灯箱组件独立解耦（TSK-08 持续深化）**：
  - 将暂停确认弹窗、本场偏好弹窗、助记便签弹窗、移出卡组弹窗以及全屏图片聚焦缩放灯箱完整抽离为独立子组件 `ReviewActionModals.svelte`；
  - 灯箱平移、滚轮缩放、双击还原与全屏拖拽微状态完全收敛进子组件作用域，复习主界面模板代码再减 150 行以上，主流程极其清晰；
  - 配备完整的独立单元测试套件 `tests/review-action-modals.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 252 个测试文件、1992 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.98 2026-10-27 · 快速制卡超级块模板支持与卡片详情结构化呈现落地

- **快速制卡工作台超级块（SuperBlock）制作模板**：
  - 在 `quick-card.svelte` 中新增「超级块表达」模板选项，题面为正面第 1 块，答案区支持多段文字（空行自动拆分独立答案子块），一键提交标准思源 `{{{col ... }}}` 超级块结构；
  - 实时卡面预览自适应超级块，问题态呈现题干与答案占位遮蔽槽，核对面完整展示题干与多段答案；
- **卡片详情抽屉超级块全流程结构化呈现**：
  - 在 `card-detail.svelte` 中自动识别超级块卡片（`isSuperBlockHtml`），顶部醒目标注 `<LvIcon name="cards" size={13} /> 超级块` 专属类型胶囊；
  - 详情抽屉预览区结构化呈现第 1 块题干、分割线微标与后续所有答案块，彻底消除多块挤占混淆；
- **全量门禁与质量验证**：
  - 全库扩展至 251 个测试文件、1987 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.97 2026-10-27 · 复习交互式题型组件独立分拆与设计令牌 97.4% 覆盖质变

- **复习工作台交互式题型组件独立分拆（TSK-08 持续深化）**：
  - 将单选/多选题矩阵、正误判断题按钮组、即时打字填空槽与翻面参考解析卡片彻底抽离为独立可测试组件 `ReviewInteractiveQuiz.svelte`；
  - 配备完整的独立单元测试套件 `tests/review-interactive-quiz.spec.ts`，主复习文件模板行数进一步缩减，结构高度内聚；
- **设计令牌（Design Tokens）覆盖率达到 97.4% 质变**：
  - 规范结构重置语义（Reset Value Semantic），`padding`、`margin`、`border-radius`、`z-index`、`gap`、`transition` 均实现 **100% 满分覆盖**；
  - `font-size` 达 **99.3%**，`font-weight` 达 **98.6%**，全局样式无硬编码魔数；
- **全量门禁与质量验证**：
  - 全库扩展至 251 个测试文件、1986 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.96 2026-10-27 · 超级块闪卡问答识别精准对齐、SVG/Excalidraw 画布编辑直通与全功能调研定稿

- **超级块闪卡（SuperBlock Flashcard）问答识别对齐（彻底解决答案提早曝光问题）**：
  - 严密对齐思源原生超级块闪卡标准：第 1 个子块为正面题干，第 2 个及后续所有子块为背面答案；
  - 在 `src/core/superblock-qa.ts` 与 `src/core/card-face.ts` 中实现结构化解析，问题态严格隐藏第 2 块及后续答案块并呈现优雅的遮蔽占位，彻底杜绝答案在题面阶段提前剧透曝光；
  - 答案态结构化呈现第 1 块题干、分割线微标与后续所有答案块；
  - 打字题与测验期望答案（`expectedText`）精准抽取第 2 块及后续答案文本，不再把题干与答案混杂；
- **SVG / Excalidraw 矢量画布编辑直通与双击唤起**：
  - 彻底打破以往将矢量画布仅作为静态图片缩放查看的局限，卡面中包含 SVG 画布、Excalidraw 挂件时在工具栏与更多菜单中常驻【✏️ 编辑画布】Bento 交互胶囊；
  - 支持在卡面上直接双击（Double Click）画布元素或挂件块，通过 `openTab({ id, zoomIn: true })` 一秒穿透直达思源原生 Protyle 画布编辑器，编辑保存后切回闪卡自动无缝同步；
- **原生复习界面与社区优秀插件深度调研定稿**：
  - 产出 `docs/51-原生闪卡与社区插件深度调研与全功能对齐方案.md`，逐项梳理原生 FSRS 调度、到期时间预测、跳过/挂起、超级块、闪卡小助手 ZY 面包屑/撤销、RemNote 概念卡、Anki 兄弟卡推迟/分级提示/打字对比、SuperMemo 渐进两级调度/Dismiss 等全部特性，确立小驴闪卡 100% 包含与超集进化的技术基准；
- **全量门禁与质量验证**：
  - 全库扩展至 250 个测试文件、1982 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.95 2026-10-27 · 顶栏自愈控制器独立模块化与生命周期解耦落地

- **顶栏图标与生命周期控制器独立解耦（TSK-07 持续深化）**：
  - 抽离 `src/bootstrap/topbar-controller.ts`，由独立控制器完全托管顶栏图标断连自愈重挂载、右键上下文菜单绑定、到期徽标悬浮文本（Native Title/Aria-label）计算与考试里程碑通知；
  - 主入口 `LvCardsPlugin` 彻底剥离顶栏相关私有定时器、DOM 句柄与事件监听，卸载生命周期统一收敛至 `topbarController.destroy()`；
  - 配备完整的独立单元测试套件 `tests/topbar-controller.spec.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 248 个测试文件、1972 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.94 2026-10-27 · AI 制卡落库多级父文档自愈创建与追加块端点加固落地

- **AI 制卡落库多级父文档自愈创建（彻底终结 document metadata is not ready）**：
  - 在 `createDocWithMd` 中实现 `ensureParentDocsExist` 逐级自愈创建机制，当创建三级深层路径（如 `/小驴闪卡/AI 制卡/2026-10-27`）时，自动逐层核实并建立父级文档树，彻底解决内核因深层未建立父文档导致的元数据未就绪致命阻断；
  - 将 `appendBlock` 的底层调用端点由容易触发相对位置重排的 `insertBlock` 全面升级为官方标准的 `/api/block/appendBlock`，并内置双端点自动 fallback 容灾；
  - 在连续块写入与入组之间加入毫秒级缓冲，消灭高频写锁竞争导致的 SQLite 事务抖动；
- **全量门禁与质量验证**：
  - 全库 247 个测试文件、1968 项测试 100% 通过；E2E 靶场 18 项全部通过；构建与烟雾测试全绿。


## v0.210.93 2026-10-27 · AI 制卡落库元数据抖动修复与复习工作台组件分拆落地

- **AI 制卡落库元数据未就绪异常根治（思源 v3.8.9-beta.2+ 兼容加固）**：
  - 彻底根治新创建文档或冷启动时偶发的 `kernel error (code=-1): document metadata is not ready` 阻断异常；
  - `createDocWithMd` 自动补齐前置绝对路径斜杠 `/`，杜绝新版内核相对路径解析失败；
  - `createDocWithMd`、`appendBlock` 与 `addRiffCards` 全链路挂载 5 阶/3 阶指数退避自愈重试机制与落盘就绪微缓冲，确保在任意思源内核版本下 100% 稳定直通；
- **复习工作台复杂视图分拆（TSK-08 架构解耦闭环）**：
  - 将复习完成面板抽离为独立子组件 `ReviewDonePanel.svelte`，涵盖留存率计算、实战命中率、收工原因选择（`END_REASONS`）及强化遗忘/星标卡等下一步建议；
  - 将专注模式悬浮岛工具栏抽离为独立子组件 `ReviewZenIsland.svelte`，涵盖流体字号缩放、重点星标切换、助记便签与退出专注模式交互；
  - 配备完整的独立单元测试套件 `tests/review-done-panel.spec.ts` 与 `tests/review-zen-island.spec.ts`，主复习文件模板复杂度显著降低；
- **核心入口瘦身与服务解耦（TSK-07）**：
  - 抽离周报静默生成服务至 `src/features/weekly-report-service.ts`，抽离数据导出管理服务至 `src/features/data-export-manager.ts`；
  - 抽离 22 槽持久化单一事实源常量至 `src/bootstrap/storage-keys.ts`；
- **全量门禁与质量验证**：
  - 全库扩展至 247 个测试文件、1968 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。


## v0.210.92 2026-10-27 · 渐进学习两级调度解耦、Dismiss 快捷归档、最小信息原则与设计令牌全覆盖

- **渐进学习与两级调度解耦（Issue #19 第二期中枢指令落地）**：
  - 建立物理隔离的两级调度规约（`shouldBypassFsrs`），粗加工大段摘录卡（`custom-lv-card-type: "extract"`）与已 Dismiss 归档卡严格绕过 FSRS 遗忘曲线算法，杜绝污染记忆稳定性与难度参数；
  - 对外服务桥（`external-bridge`）扩充 `receiveExtract` 接口与能力协商，支持无缝接收小驴拾遗 `Alt+E` 派发的摘录信封，自动在卡底追加原文双链反链 `> 来源：((sourceBlockId "原文标题"))`；
  - 复习端折叠工具栏新增「解散归档 (Ctrl+D)」操作，支持 `Ctrl+D` / `⌘D` 全局快捷键调度，一键打标 `custom-lv-dismissed: "true"` 并彻底移出日常复习队列，卡片永久归档不扰日常；
- **最小信息原则（Minimum Information Principle / Quality Guard）**：
  - 手工制卡抽屉（`quick-card.svelte`）与卡片精细编辑器（`card-editor.svelte`）接入实时信息负荷分析，字数 > 250 或挖空 > 3 时温和弹出 Bento 拆卡建议气泡；
- **设计令牌（Design Tokens）覆盖率质变跃升**：
  - 全库设计令牌覆盖率从 79.2% 大幅跃升至 **92.2%**；
  - 补齐全局层级变量，`z-index` 实现 **100% 满分覆盖**，消除多窗口图层击穿隐患；`gap` 与 `margin-bottom` 均实现 100% 满分覆盖；
- **全量门禁与质量验证**：
  - 全库扩展至 244 个测试文件、1961 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。


## v0.210.91 2026-10-27 · 复习工作台排队恢复、回源导航与填空判定全员 Bento 矢量化落地

- **复习面板（Review Workbench）中断恢复与辅助操作 Bento 胶囊化**：
  - 队列等待与会话暂停状态下的恢复刷新与撤销操作全面升级为 `.lv-btn-tool` Bento 胶囊并嵌入矢量微标；
  - 异常卡片提示条中的复检与前往维护中心操作全员胶囊化；
  - 入口回源导航按钮升级为带 `<LvIcon name="chevron-left" size={12} />` 的微胶囊；
  - 交互式填空判定提交按钮嵌入单色精密 `<LvIcon name="check" size={13} />` 矢量微标；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.90 2026-10-27 · 知识生命周期与卡组选择器操作 Bento 胶囊化与矢量微标化落地

- **内容生命周期面板（Lifecycle Panel）全流程操作 Bento 胶囊化**：
  - 未建档时的「开档建卡」主按钮升级为带 `<LvIcon name="plus" size={12} />` 的 Bento 工具胶囊；
  - 核心状态修复动作（`onRepair`）升级为带 `<LvIcon name="refresh" size={12} />` 的标准工具胶囊；
  - 下一步建议动作与流转目标按钮全面对齐 `.lv-btn-tool` 规范，触控弹性与视觉层级高度统一；
  - 严密补齐 `LvIcon` 组件导入，消除组件运行期隐患；
- **卡组快速选择器（Deck Picker）操作人机工效升级**：
  - 读取失败重试按钮升级为嵌入精密单色矢量微标 `<LvIcon name="refresh" size={12} />` 的标准工具胶囊；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.89 2026-10-27 · 知识网络与知识对象面板操作 Bento 胶囊化与矢量微标矩阵落地

- **语义关联面板（Relations Panel）全流程操作 Bento 胶囊化**：
  - 关系添加主按钮升级为 `.lv-btn-tool` 规范并嵌入单色精密矢量微标 `<LvIcon name="plus" size={12} />`；
  - 关系删除按钮全面对齐 `.lv-btn-tool` 胶囊标准，悬浮反馈平滑细腻；
- **知识对象面板（Knowledge Object Panel）操作人机工效升级**：
  - 核心事实「修订事实」按钮升级为带有 `<LvIcon name="edit" size={12} />` 矢量微标的 Bento 工具胶囊；
  - 实例清单中的移除按钮升级为标准 `.lv-btn-tool` 胶囊，派生实例按钮对齐发光 Primary 交互规范；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.88 2026-10-27 · 标记符制卡预览与收件箱操作全员 Bento 矢量化与 E2E 隔离靶场加固落地

- **标记符扫描制卡预览（Marker Cards）全流程操作 Bento 胶囊化**：
  - 「全选/取消全选」按钮全面升级为 `.lv-btn-tool` Bento 胶囊并嵌入单色精密矢量微标 `<LvIcon name="check" size={12} />`；
  - 空态下返回按钮升级为带有 `close` 图标的标准 Bento 胶囊；
  - 严密补齐 `LvIcon` 组件导入，彻底根治潜在的 ReferenceError 隐患；
- **材料收件箱（Capture Inbox）全选与重试操作矢量微标化**：
  - 全选/取消全选与打开来源失败后的重试按钮全面嵌入精密单色矢量微标；
- **E2E 隔离靶场无头内核冷启动稳健性加固**：
  - 根治无头内核冷启动期间因子路径未建立父文档导致的 `document metadata is not ready` 异常，升级为根路径 `/riff` 并挂载 5 阶渐进重试机制，实现 18/18 项 E2E 100% 稳定直通；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.87 2026-10-27 · 新手上手引导与图片遮挡编辑器操作全员 Bento 矢量化落地

- **新手上手引导（Onboarding Wizard）操作全员微标与 Bento 胶囊化**：
  - 「返回上一步」、「生成示例卡片」、「查看帮助指南」及「打开示例笔记」全员升级为 `.lv-btn-tool` Bento 胶囊并嵌入单色精密矢量微标（`chevron-left`、`plus`、`question`、`book`）；
  - 「开始复习体验」嵌入单色向右导航微标 `<LvIcon name="chevron-right" size={13} />`，心流更直观；
  - 清理模板中无用的 `LvKbd` 导入，保持严格的编译纯净性；
- **图片遮挡编辑器（Occlusion Editor）操作微标化**：
  - 顶部撤销（`chevron-left`）与清空画布（`trash`）操作升级为 Bento 工具胶囊；
  - 图片读取失败重试升级为标准带 `refresh` 图标的 Bento 胶囊；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.86 2026-10-27 · 设置中心全流程数据迁移与限时挑战操作全员 Bento 矢量化落地

- **设置中心数据迁移与生态导入导出全员 Bento 化（Settings Migration Actions）**：
  - Anki 连接测试、Anki 本地 `.apkg` 导入、原生 `.lvcards` 分享包导入、Obsidian SR 导入全面升级为 `.lv-btn-tool` Bento 胶囊并嵌入单色矢量微标；
  - 学习画像（Persona）导出与导入、数据备份快照 JSON 导出、Flashcard V2 探测、暂停卡片一键恢复、复习日志清空等操作全员微标化，操作体验高度自洽；
- **限时挑战冲刺操作人机工效升级（Challenge Mode Polish）**：
  - 错误重试、中途退出、作答认识/不认识以及完成屏关闭按钮全员升级为 Bento 矢量微标规范；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.85 2026-10-27 · AI 制卡向导卡面预览与入库全流程 Bento 矢量胶囊化落地

- **AI 制卡向导（AI Wizard）卡面预览与入库操作全员 Bento 化**：
  - 候选卡片列表顶栏与单卡行「卡面预览」按钮全员升级为 `.lv-btn-tool` 规范并嵌入精密单色 `<LvIcon name="eye" size={12} />` 矢量微标；
  - 底部返回上一页按钮挂载单色矢量指示微标，提交入库按钮配备发光 Primary 渐变与 `<LvIcon name="check" size={13} />` 确认图标；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.84 2026-10-27 · 学习页与目标备考全场景 Bento 胶囊化与矢量微标矩阵落地

- **学习总览与回顾（Learning Page）操作全员 Bento 胶囊化**：
  - 「回到今日」、「查看目标与计划」、「查看考试计划」及日历刷新按钮全员升级为 `.lv-btn-tool` 规范；
  - 嵌入单色精密矢量微标（`home`、`target`、`graduation`、`refresh`），彻底告别粗糙纯文字框线；
- **目标与计划工作台（Goals Page）心流打通与表单操作升级**：
  - 解除嵌入模式下隐藏新建按钮的限制，在学习页目标分面也支持右上角直接一键「+ 新建目标」；
  - 目标保存与取消操作分别嵌入 `<LvIcon name="check" size={12} />` 与 `<LvIcon name="close" size={12} />` 矢量微标；
- **考试冲刺页面（Exam Page）操作层级深度规整**：
  - 暂停计划的「恢复」按钮升级为带 `<LvIcon name="refresh" size={12} />` 的 Bento 工具胶囊；
  - 表单提交按钮清理旧有文字按钮类名污染，锁定标准实心发光 `.lv-btn-primary`；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.83 2026-10-26 · 卡片详情抽屉全流程操作 Bento 胶囊与精密矢量微标化落地

- **卡片详情抽屉（Card Detail Drawer）操作全员 Bento 化**：
  - 详情抽屉顶部历史版本对比、差异生成与卡面预览重试按钮全面对齐 `.lv-btn-tool` Bento 规范；
  - 嵌入精密单色矢量微标（`swap` 对比、`refresh` 重试、`chevron-up/down` 折叠），操作手感与全生命周期设计系统严密统合；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.82 2026-10-26 · 制卡工作台预览操作微标化与全局交互链路深化闭环

- **制卡工作台卡面答案预览操作微标化（Quick Card Preview Action）**：
  - 手工制卡实时预览区右上角「查看答案 / 返回题面」按钮升级为 `.lv-btn-tool` Bento 胶囊并嵌入单色精密矢量微标 `<LvIcon name="eye" size={13} />`；
  - 交互触控体验与卡片详情抽屉和闪卡管理器完全齐平；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.81 2026-10-26 · 闪卡管理器卡组限定横幅 Bento 质感重塑与全选操作微标化落地

- **闪卡管理器当前卡组限定提示栏（Deck Scope Banner）Bento 化**：
  - 管理器顶部卡组筛选提示条由单薄单侧竖线升级为精致磨砂 Bento 软表面（`--lv-primary-soft`），并配以 `--lv-inset-shine` 内凹高光；
  - 清除限定按钮升级为标准带 `<LvIcon name="close" size={12} />` 矢量微标的 Bento 工具胶囊；
- **全选/取消全选操作行精密微标化**：
  - 全选按钮升级为 `.lv-btn-tool` 规范并嵌入单色 `<LvIcon name="check" size={12} />`，操作反馈清晰直观；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.80 2026-10-26 · 卡组活跃度视觉微光与闪卡管理器箭头全矢量化落地

- **首页卡组列表活跃度微光与交互进阶（Active Deck Luminescence）**：
  - 针对含有卡片的活跃卡组（`size > 0`）注入 `.lv-today-deck--has-cards` 专属品牌微描边与悬浮漫反射发光光晕；
  - 快速复习按钮悬浮时高亮显示长春花紫质感（`--lv-primary-soft`），主次卡组层次分明；
- **闪卡管理器单卡导航箭头全矢量化（Manager Glyph Elimination）**：
  - 彻底淘汰卡片列表行内右侧粗糙文本字符 `›`，升级为单色精密矢量微标 `<LvIcon name="chevron-right" size={12} />`，实现全库文本箭头零残留；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.79 2026-10-26 · 首页布局持续深化：特性微标胶囊矩阵、数据行轻量收敛与零感呼吸排版落地

- **核心功能 Bento 全景矩阵深化（Feature Tags Matrix）**：
  - 四大核心工作台卡片全部增设高频特性标签行（`全库检索` · `批量流转`、`一键挖空 Ctrl+H` · `智能 AI 制卡`、`配对消除` · `限时挑战`、`倒计时管理` · `Cram 突击`）；
  - 核心功能一目了然，零阅读门槛看懂每一个模块背后的核心玩法与进入方式；
- **今日数据指标行轻量化收敛（Compact Metrics Strip）**：
  - 数据卡片内边距收敛为紧凑流线型，高度压缩约 40%，消除原先 4 个巨大方块“全都是 0”的空洞笨重感，把黄金视域自然让渡给核心功能；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.78 2026-10-26 · 汲取同类产品精髓：侧栏零到期优雅隐藏、全局主按钮抗主题污染与新建闪卡心流升级

- **侧边栏到期徽标零值优雅隐藏（Zero Due Graceful Handling）**：
  - 汲取 Anki、RemNote 与 Linear 体验精髓，当今日无到期卡片（`dueCount === 0`）时，自动隐去侧边栏刺眼的灰色 `0` 徽标；
  - 消除用户关于“0 是不是出错/未加载”的疑虑与挫败感，有待复习卡片时才精准高亮呈现；
- **侧边栏新建闪卡操作心流升级（General Authoring Access）**：
  - 侧栏主操作由局限生硬的「开始手工制卡」升级为通用的「新建闪卡」，兼顾挖空、问答与智能制卡，心智更加开放包容；
- **核心主按钮（`.lv-btn-primary`）色彩抗污染绝对防护**：
  - 为长春花紫立体渐变高光挂载 `!important` 级层级锁，彻底根除部分思源第三方主题强制注入深墨绿背景色的样式覆盖；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.77 2026-10-26 · 首页布局重构：四大核心功能 Bento 全景工作台、双通道行动引导与空卡组智能收拢落地

- **首页四大核心功能全景工作台（Feature Matrix Bento Grid）上线**：
  - 针对“进来看不见功能、不知所措”的痛点，在首页核心视域新增 2x2 Bento 功能直达矩阵；
  - 清晰呈现【闪卡管理器】（管理检索）、【闪卡制作工坊】（一键挖空与AI制卡）、【趣味练习与挑战】（配对消除与限时挑战）与【考试冲刺与计划】（倒计时与高压备考）；
  - 彻底解答用户关于“有什么功能、能够干什么”的困惑；
- **今日焦点双通道行动引导（Dual Action Pathways）**：
  - 当今日暂无到期复习卡时，解除此前被收件箱单一动作绑架的视觉局限，增设「自由复习」与「制作新卡」快捷行动胶囊；
  - 无论是否有调度到期卡，用户均可自由选择随心刷题或输入灵感；
- **空卡组智能折叠（Smart Empty Deck Collapsing）**：
  - 卡组列表优先展示含卡片的活跃卡组，0 张卡的空卡组默认智能收拢（“其余 N 个空卡组已折叠”），支持一键展开/收起，杜绝满屏灰卡刷屏；
- **右侧栏周度便签大卡片瘦身（Footnote）**：
  - 消除占用 120px 的臃肿鸡汤卡片，精简为 36px 底部灵巧微注，左右分栏高度完美对称对齐；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.76 2026-10-26 · 闪卡维护中心操作栏全员 Bento 胶囊与精密矢量微标化落地

- **闪卡维护中心（Maintenance Page）全员 Bento 胶囊矢量化**：
  - 坏卡队列操作行（今日暂缓/恢复暂缓、加入修复、确认来源健康、打开来源、编辑卡片）全员升级为标准 `.lv-btn-tool` Bento 胶囊并嵌入单色精密矢量微标（`moon` / `refresh` / `zap` / `check` / `eye` / `edit`）；
  - 批量修复预览操作区与上次修复撤销栏全面挂载精密矢量微标，彻底消灭维护中心粗糙纯文字按钮堆叠；
- **窄屏排版防挤压优化**：
  - `.lv-maint-row` 增强弹性流式布局与间距控制，在手机窄屏或小窗口分屏时平滑自适应折行，杜绝按钮溢出与挤压文本；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.75 2026-10-26 · 复习快捷键浮层响应式双栏重塑与恢复中心 Bento 矢量化落地

- **复习快捷键帮助浮层（Help Overlay）双栏排布与自举提示**：
  - 快捷键帮助浮层（`?` 键唤出）在宽屏及桌面视口下升级为双列网格响应式排布（`Grid 2-column`），彻底消灭 16 项快捷键纵向拖动滚轮的交互割裂；
  - 增补快捷键自身 `{ k: "?", d: "打开 / 关闭快捷键帮助" }` 闭环引导，键盘 Badge 赋予内凹立体实体感；
- **恢复中心（Recovery Page）全员 Bento 胶囊矢量化**：
  - 恢复中心（`recovery-page.svelte`）操作按钮（AI 任务恢复、打开收件箱、打开维护页）全面对齐 Outline Bento 胶囊规范并嵌入专属单色精密矢量微标（`zap` / `cards` / `book` / `inbox` / `settings`）；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.74 2026-10-26 · 材料收件箱实时搜索过滤与批量操作栏 Bento 矢量微标化落地

- **材料收件箱（Capture Inbox）实时关键词过滤落地**：
  - 页头操作栏新增动态自适应关键词搜索框，输入关键字实时模糊匹配已提取的卡片材料正文与块 ID；
  - 极大降低面对数十条摘录素材时的筛选与定位认知成本，支持即时清空；
- **收件箱批量操作栏与行内动作全面 Bento 矢量微标化**：
  - 批量操作栏（暂存、挑选、暂不处理、送去制卡、撤销挑选、恢复、移出收件箱）全员配备单色精密矢量微标与圆角微胶囊（`.lv-btn-tool`）；
  - 行内「打开来源」按钮升级为嵌入 `<LvIcon name="eye" size={12} />` 矢量微标的 Bento 胶囊，精致度全面看齐闪卡管理器；
- **全量门禁与质量验证**：
  - 全库扩展至 243 个测试文件、1949 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.73 2026-10-26 · 设置中心分类锚点导航条落地、长表单认知过载彻底化解

- **设置中心分类锚点导航条（Sticky Settings Rail）落地**：
  - 设置中心搜索栏下方增设横向 Bento 分类锚点胶囊导航（学习节奏、作答偏好、语音朗读、AI服务商、导入导出、数据备份）；
  - 点击任意胶囊平滑滚动直达对应节，解决复杂设置长表单反复滚动的认知过载痛点，搜索态智能隐藏保持界面极简；
- **组件抽象与属性扩展**：
  - `LvSection.svelte` 扩充支持可选 `id` 属性，为多页面长列表精细定位提供底层通用基座；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.72 2026-10-26 · 卡片人工编辑器左右分体双栏差异对比落地

- **卡片人工编辑左右分体差异对比（Split Diff Layout）落地**：
  - 卡片人工编辑器（`card-editor.svelte`）在常规及宽屏抽屉视口下升级为左右分体双栏排布（左侧正文编辑、右侧写前字符级差异对照）；
  - 增删字符在右侧即时响应，消灭此前垂直堆叠必须上下滚动反复对照的痛点，窄屏自适应自然回弹纵向堆叠；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.71 2026-10-26 · 沉浸专注模式悬浮微岛工作台与配对消除弹簧动效落地

- **沉浸专注模式（Zen Mode）悬浮快捷微岛工作台落地**：
  - 专注模式右上角退出胶囊全面升级为毛玻璃悬浮微岛（`.lv-zen-island`）；
  - 支持免退出模式直接快捷调节卡面字号（`A- / A+`）、一键星标重点卡片（`⭐`）与呼出助记便签（`💡`），72% 呼吸透明度悬停无缝唤醒，兼顾极致沉浸与高频操作便捷性；
- **配对游戏消除微动效（Match Pop & Fade）落地**：
  - 配对游戏左右项成功连线消除时，增加 `scale(1.04)` 微弹簧膨胀与平滑淡出过渡，增添轻快解压感与正向反馈；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.70 2026-10-26 · 阶段二核心交互落地：单选作答智能微缓冲、冲刺复习直通车与星标卡专项行动强化

- **单选题作答智能微缓冲动效落地（Answer Feedback Cadence）**：
  - 单选题作答与判断题点击增加 100ms 黄金微滞后动效，选项卡片获得焦点与轻触微反馈后再平滑揭晓解析，为大脑建立清晰明确的因果因果记忆回路；
- **首页考试计划「立即冲刺复习」直通车闭环**：
  - 首页在考前倒计时横幅（`examChip`）右侧增设「立即冲刺复习」Primary CTA 按钮，一键直达当前考试冲刺计划；
- **复习完成屏星标卡专项强化全闭环**：
  - 优化复习结算屏（Done Screen）下一步建议条件：即使本场未跳过、无遗忘，只要星标了卡片也能一键直发「立即专项练习星标卡」；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.69 2026-10-26 · 根除全局焦点环样式泄漏、严格收敛:focus-visible至小驴闪卡核心作用域

- **根除正文编辑器全局焦点环污染（Strict Focus-Visible Scoping）**：
  - 排查并根治旧版本中未加前缀的 `:focus-visible { outline: none; box-shadow: var(--lv-focus-ring); }` 全局选择器；
  - 彻底将焦点环及高对比度边框严格收敛至 `:is(.lv-page, .lv-hub, .lv-dialog, .lv-peek-body, .lv-review, .lv-aiwiz) :focus-visible` 插件局部作用域内；
  - 100% 杜绝样式外溢，彻底消除思源正文编辑器中标题与块在聚焦时被套上粉红外框的问题；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.68 2026-10-26 · 全局重构方案A落地：长春花紫与暖金生态调色板、根治红绿撞色与卡组红斑疲劳

- **方案 A 经典长春花紫/暖金生态调色板全面落地（Scheme A Modern Indigo Palette）**：
  - 核心主品牌色由玫红全面重塑为小驴生态标志性的长春花紫（`#6366F1`，暗黑 `#818CF8`）与悬浮深紫（`#4F46E5`）；
  - 主操作按钮（「+ 开始手工制卡」与 Hero「开始复习」）统一采用长春花紫发光质感实心渐变，彻底根治此前外部墨绿与红色混杂的互补撞色与视觉割裂；
- **重塑首页 Hero、侧边栏导航与卡组列表色彩层级（消灭杂色撞色与红斑报警）**：
  - 侧边栏活动页签、徽标数字、收件箱指示器全线收敛至淡紫微表面（`#EEF2FF`）与长春花紫；
  - 彻底重构卡组列表：空卡组「暂无卡片」状态由原先误导性的红字红框降级为沉静中性石板灰，消灭红斑视觉疲劳与报警假象；
  - 右侧栏周度便签卡片与侧栏小记背景统一至品牌软色底座，消灭突兀杂色，呈现高度沉浸自洽的生产力美学质感；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.67 2026-10-26 · 全局暗黑微高光倒角增强、按键物理弹簧动效与手工制卡一键挖空落地

- **手工制卡工作台一键挖空与快捷键增强（Cloze Authoring Frictionless Flow）**：
  - 手工制卡工作台挖空卡型新增「一键挖空 (Ctrl+H)」Bento 工具按钮与 `Ctrl+H / ⌘H` 专属快捷键；
  - 选中文本即可一键包裹为 `____` 并自动将选中文本填充为答案，未选中文本时于光标处自动插入空位，大幅提升知识加工制卡效率；
- **全局设计系统暗黑微高光与物理弹簧动效调优**：
  - 暗黑模式卡片与面板边缘高光（`--lv-inset-shine`）与边框基准微调至更锋利层次，杜绝深色底座下的边缘发虚；
  - 全局按钮按压反馈统一绑定 `transform: translateY(0.5px) scale(0.985)`，单选选项卡片悬浮及按压动画平滑顺畅；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1948 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.66 2026-10-26 · 卡组列表与批量操作栏全Bento微胶囊化、全生命周期交互逻辑系统性重构

- **系统性交互与操作合理性全景升级（Full Lifecycle Flow Continuity & Consistency）**：
  - 首页卡组卡片列表（\`Deck Dashboard\`）操作区（重命名、分享包导出、删除）全面挂载 \`.lv-btn-tool\` 微胶囊与无障碍 \`aria-label\`；
  - 闪卡管理器批量操作栏（加入卡组、移动卡组、重置、导出 CSV、导出 Obsidian、移除、取消）全员升级为带精密矢量微标的 Bento 胶囊按钮，分页器内置 \`chevron-left\` 与 \`chevron-right\` 矢量微标；
  - 核心实体关系与知识对象面板完全消除对外部主题的混用，操作层级与触控反馈全线统合；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.65 2026-10-26 · AI向导与修卡演练微交互全矢量化、chevron-left四向微标闭环

- **AI 制卡向导与修卡演练微交互全矢量化升级（Micro-interactions & Glyph Cleanup）**：
  - AI 制卡向导返回按钮与材料折叠箭头告别粗糙文本字符 \`▴\` / \`▾\`，全面升级为精密 \`<LvIcon name="chevron-up" />\` 与 \`<LvIcon name="chevron-down" />\` 胶囊按钮；
  - 修卡演练（\`repair-drill.svelte\`）步进导航按钮升级为圆角微胶囊并内置精密 \`<LvIcon name="chevron-left" />\` 与 \`<LvIcon name="chevron-right" />\`；
  - 全局图标库补齐 \`chevron-left\` 四向矢量微标，建立严密视觉闭环；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.64 2026-10-26 · 全链路交互逻辑与操作合理性深度升级、完成屏与AI向导全矢量胶囊化

- **全流程连贯性与按钮摆放合理性优化（Flow Ergonomics & Button Hierarchy）**：
  - 复习完成屏行动区（Next Actions）全面对齐 Outline Bento 胶囊按钮规范（返回主页、查看管理器、再来一组），消除生硬单调框线与突兀跳跃；
  - 知识对象与关系面板（\`ko-panel\`、\`relations-panel\`）删除与操作按钮彻底升级为标准矢量微标；
  - 入口上下文提示条关闭按钮矢量化，各次级操作与主要 Primary CTA 层次清晰分明；
- **AI 制卡向导候选卡片操作行去裸字符化**：
  - 重新生成与移除候选卡片按钮全面告别裸字符 \`↻\` 和 \`✕\`，升级为 Outline Bento 胶囊微按钮嵌入 \`<LvIcon name=\"refresh\" size={13} />\` 与 \`<LvIcon name=\"close\" size={13} />\`；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.63 2026-10-26 · 全生命周期设计系统深度精细化、全面清理残留主题变量与磨砂玻璃弹窗升级

- **全生命周期设计系统深度精细化（Full Lifecycle Design System Perfection）**：
  - 彻底清理全库所有零星残留的直接 \`--b3-theme-*\` 变量引用（包括 \`maintenance-page.svelte\` 预览、差异对比、健康记录与卡片边框，\`review.svelte\` 重排期错误提示，\`settings.svelte\` 冲突提示，以及 \`index.ts\` 错误页签），全面统一收口至小驴自洽的 \`--lv-*\` 设计系统；
  - 全局 Dialog 弹窗遮罩升级为统一的磨砂玻璃微模糊质感（\`backdrop-filter: blur(10px)\`），标题与底部操作栏底座增加微渐变微光；
  - 按钮体系全面注入小驴品牌红润微光与弹簧触控微反馈，卡片边缘高光（\`inset 0 1px 0\`）与阴影层次全面升级；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.62 2026-10-26 · 小驴打卡同款局部作用域思源变量重定向落地、彻底杜绝第三方主题色彩污染

- **小驴打卡同款局部作用域思源变量重定向落地（Scoped Variable Override）**：
  - 汲取小驴打卡 5.0 经典设计精髓，在 \`:is(.lv-page, .lv-hub, .lv-dialog, .lv-peek-body, .lv-review, .lv-aiwiz)\` 核心作用域内将全部 \`--b3-theme-*\` 别名强制重定向为小驴独立双色板；
  - 使思源自带的各种底层组件（按钮、输入框、下拉框、标签、对话框等）在小驴闪卡中彻底脱离外部第三方主题的色彩污染与对比度缺陷；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.61 2026-10-26 · 脱离外部主题依赖、小驴专属自洽美学体系与双模式四级表面层级落地

- **脱离外部主题脆弱依赖（Palette Independence 自治美学体系）**：
  - 响应用户核心意向，彻底废弃对思源外部各种怪异第三方主题变量（\`--b3-theme-primary\`、\`--b3-theme-background\` 等）的直接继承；
  - 建立小驴专属自洽美学体系：无论用户使用何种第三方主题，小驴闪卡始终保持纯正统一的**勃艮第心智红（\`#E11D48\`）**与**星光金（\`#FACC15\`）**品牌色彩；
- **自洽双模式四级表面层级（Canvas < Surface < Elevated < Primary CTA）**：
  - **默认亮色模式**：画布底座采用温润天然的柔灰（\`#F8FAFC\`），纯净白卡片表面（\`#FFFFFF\`），深邃高清晰文字（\`#0F172A\`），彻底杜绝白贴白扁平感；
  - **自洽暗色模式**：系统或思源暗色下自动呈现午夜深蓝黑底座（\`#090D16\`）与质感石板蓝卡片（\`#141C2E\`），红宝石色品牌主调（\`#F43F5E\`），科技感与沉浸感拉满；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.60 2026-10-26 · 全界面弹窗与抽屉全面消灭裸字符✕、双向卡片swap矢量微标升级

- **全界面弹窗、抽屉与浮层彻底消灭裸文本字符 \`✕\`（全面矢量化）**：
  - 复习端 8 大弹窗（便签、移出卡组、挂起、偏好、回看、帮助、图片灯箱等）关闭按钮升级为精密 \`<LvIcon name="close" size={13} />\`；
  - 通用抽屉组件（\`LvDrawer\`）、卡组选择器（\`DeckPicker\`）、修卡演练（\`RepairDrill\`）、闪卡管理器（\`Manager\`）搜索清空按钮全员配备矢量图标，消除跨平台字体渲染差异；
- **手工制卡工作台（Quick Card Studio）质感升级**：
  - 双向卡片徽标告别文本字符 \`⇄\`，升级为精密 \`<LvIcon name="swap" size={14} />\` 双向箭头矢量微标；
  - 卡组读取失败重试按钮对齐 Outline Bento 胶囊规范并嵌入 \`refresh\` 图标；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.59 2026-10-26 · 扩充close矢量图标、判断题与选择题作答徽标全矢量化改造

- **全局图标库（LvIcon）扩充支持 \`close\` 矢量图标**：
  - 新增标准 Feather / Lucide 规范的精密叉号微标，全生命周期替代粗糙文本字符；
- **判断题与选择题作答反馈全面去字符化与矢量化**：
  - 判断题正误大徽标彻底告别文本字符 \`✓\` 和 \`✗\`，升级为 \`<LvIcon name="check" size={18} />\` 与 \`<LvIcon name="close" size={18} />\`；
  - 正误结论药丸胶囊与选择题「正确答案」「你的选择」徽标全员配备矢量图标与弹性垂直居中；
  - 增补 \`LvIcon\` 针对 \`close\` 与 \`check\` 的专项测试，锁定渲染一致性；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1947 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.58 2026-10-26 · 打字题留空回车无响应Bug修复、卡片编辑后状态即时重置保护

- **普通打字题留空按回车无响应 Bug 根治（Empty Typing Enter Reveal）**：
  - 修复 `submitTyping` 在打字框内容留空时直接 `return` 且事件被 `stopPropagation`，导致用户放弃作答按回车翻面时界面无任何响应的逻辑缺陷；
  - 彻底对齐填空题标准行为：输入框留空敲 `Enter` 立即识别为“直接翻面查看答案”，顺畅揭晓卡面；
- **卡片人工编辑后题型状态完整重置（Edit Invalidation Protection）**：
  - 当在复习抽屉中完成卡片人工编辑并保存回读到新 DOM 后，自动将旧的单选选项、判断题状态与自评建议标记彻底复位，杜绝编辑前旧题状态污染新题面；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1946 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.57 2026-10-25 · 修复快捷键A/B/C/D与T/F/Y/N被前置拦截提前返回Bug

- **复习交互键盘事件流重大 Bug 修复（Shortcut Pipeline Unblocked）**：
  - 彻底修复 `resolveReviewKeyAction` 在未揭晓态对非通用按键返回 `null`，导致后续 `if (!action) return;` 阻断一切选择题（A/B/C/D）、判断题（T/F/Y/N）及翻转问答（R）按键的隐蔽 Bug；
  - 重构键盘事件解析次序：选择题、判断题与翻转自测优先获得按键消费权，敲击 `A`/`B`/`C`/`D` 或 `1`/`2`/`3`/`4` 瞬间命中选项作答并触发震动与音效反馈；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1946 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.56 2026-10-25 · 多形态选择题答案智能匹配引擎上线、杜绝无属性选择题判分失效Bug

- **多形态选择题答案智能匹配引擎上线（checkIsAnswer 核心升级）**：
  - 彻底修复当选择题答案以全文本（如 `答案: 北京`、`B. 北京`、`答案：B`）而非纯单字母形式存在时，旧逻辑长度截断导致无法判定正确选项的隐蔽缺陷；
  - 引入 `checkIsAnswer` 多维度启发式对齐引擎：支持纯字母（`B`、`AC`）、首字符分割（`B. 北京`）、前缀判定（`答案：B`）以及选项文本等价匹配（`北京` 匹配选项 `B. 北京`）；
  - 无论用户通过块属性、挖空、块备注还是自由文本书写答案，系统均能精准点亮正确选项并提供智能自评打分引导；
  - 增补单元测试 `checkIsAnswer matches answer keys in various realistic formats` 锁定质量。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1946 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.55 2026-10-25 · 复习卡面选项DOM智能清理引擎、彻底根除选项重复渲染缺陷

- **复习卡面选项 DOM 深度清理引擎（cleanChoiceHtml 闭环）**：
  - 在复习卡面 HTML 渲染管道中接入 `cleanChoiceHtml`，不仅移除原生 `NodeList` 列表，还能够智能匹配并移除单独成段的选项段落（`NodeParagraph` / `p` 形式的 `A.`、`B.` 等）；
  - 彻底杜绝选择题选项在卡面上与下方交互式大按钮卡片之间出现内容重复展示的缺陷；
  - 增补单元测试 `cleanChoiceHtml removes lists and option paragraphs from rendered HTML` 确保 DOM 清理安全可靠。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1944 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.54 2026-10-25 · 修复选择题题干选项残留Bug、题干选项智能剥离引擎与全流程质感升级

- **选择题题干选项智能剥离引擎上线（核心 Bug 修复）**：
  - 彻底修复当题干选项采用 Unicode bullet `•`、`·`、`●` 或裸字母开头（`A.`）时，题干无法剥离选项导致题干内重复展示选项文本的缺陷；
  - 引入 `extractStemFromChoice` 智能定位与剥离引擎，准确切分题干正文与多行选项，题面仅显示纯净题目，下方呈现精致 Bento 选项大卡片；
  - 增补单元测试 `cleanly extracts question stem by stripping options with Unicode bullet • prefix` 锁定质量。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1943 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.53 2026-10-25 · 新手向导按钮胶囊与画像卡片悬浮升起、卡片编辑操作栏圆角微胶囊化

- **新手向导（Onboarding Tour）全流程 Bento 质感升级**：
  - 页头跳过按钮升级为 Outline Bento 胶囊，笔记本错误刷新按钮嵌入 `<LvIcon name="refresh" />` 矢量微标；
  - 学习画像卡片（考试冲刺、常青笔记、语言学习）注入 14px 大圆角与柔和微渐变，悬浮平滑微升 `2px` 并泛起漫反射高光，选中心智清晰；
- **卡片人工编辑（Card Editor）操作栏微排版优化**：
  - 底部操作栏（保存、取消）全面对齐圆角微胶囊规范，内边距增至 14px，消灭生硬长方块按钮；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.52 2026-10-25 · 全局空态与错误态微组件矢量化、挑战与配对游戏按钮层级升阶

- **全局基础反馈组件（LvEmpty & LvError）质感跃迁**：
  - 空态组件（LvEmpty）告别文本字符 `✦`，升级为高阶单色矢量微标（默认 `<LvIcon name="inbox" size={24} />`，支持按需注入）；行动按钮升级为 Outline Bento 胶囊并嵌入加号图标；
  - 错误重试卡片（LvError）增设醒目危险警告图标（`<LvIcon name="warning" size={18} />`），重试按钮全员配备圆角微胶囊与刷新图标，消灭生硬框线；
- **限时挑战与配对挑战（Games & Challenges）视觉规范化**：
  - 限时挑战空态去除裸数学字符 `∅`，升级为精密 `<LvIcon name="cards" size={38} />` 矢量微标，重试按钮升级为 Bento 微胶囊；
  - 配对游戏顶栏与结算屏退出按钮全面对齐 Outline Bento 胶囊规范，再来一局按钮嵌入矢量微标；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.51 2026-10-25 · 目标操作全胶囊矢量化、设置保存按钮Primary升级、维护与恢复中心全操作规范化

- **目标与计划（Goals Page）操作栏全方位矢量微胶囊化**：
  - 目标卡片操作栏（编辑、删除）全员升级为 `.lv-btn-plan-action` 圆角微胶囊，分别嵌入 `<LvIcon name="edit" />` 与 `<LvIcon name="trash" />`；
  - 页头新建目标按钮嵌入 `<LvIcon name="plus" />` 矢量微标，操作引导清晰；
- **设置中心（Settings Modal）确认保存按钮 Primary 质感升级**：
  - 彻底淘汰单薄裸文字链接类名 `.b3-button--text`，升级为显眼发光的 `.lv-btn-primary` 核心行动主按钮，保存反馈明确无遗漏；
- **维护中心与恢复中心（Maintenance & Recovery）一致性治理**：
  - 维护中心「扫描存量闪卡」与「存量格式规范化」按钮全员嵌入矢量图标，统筹对齐生态操作规范；
  - 恢复中心页头「刷新」按钮与卡片「继续本场复习」全员嵌入对应单色矢量图标，交互层级明确；
  - 卡片详情抽屉（Card Detail Drawer）顶部「编辑」与「打开文档」按钮升级为 Outline Bento 胶囊并嵌入矢量图标；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.50 2026-10-25 · 闪卡管理器页头刷新与筛选全胶囊化、考试卡片操作组矢量对齐、收件箱全选与刷新Bento化

- **闪卡管理器（Flashcard Manager）全方位层级规范化**：
  - 页头右侧 `刷新` 按钮告别单薄裸文字，升级为与搜索输入框同高的带图标 Outline Bento 胶囊按钮（`<LvIcon name="refresh" size={13} />`）；
  - 排序与状态筛选下拉框统一升级为 30px 高度圆角微胶囊，阴影与边框和全选按钮绝对平齐；
- **考试计划（Exam Plans）操作栏全方位矢量微标化**：
  - 计划卡片底部操作栏（编辑、报告、写入文档、归档、暂停/恢复、删除）全员升级为 `.lv-btn-plan-action` 圆角微胶囊；
  - 报告、写入、归档、暂停全部补齐高精度单色矢量图标（`<LvIcon name="book" />`、`<LvIcon name="edit" />`、`<LvIcon name="inbox" />`、`<LvIcon name="moon" />`），消灭纯文字参差；
- **材料收件箱（Capture Inbox）操作区精致对齐**：
  - 页头「全选/取消全选」与「刷新」按钮全面对齐 Outline Bento 胶囊规范，操作反馈一致；
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.49 2026-10-25 · 复习工具栏全矢量Bento胶囊化、侧栏激活指示竖线与AI材料载入矢量化

- **复习工具栏（Review Toolbar）与返场横幅深度对齐规范化**：
  - 工具栏（撤销、跳过、星标、疑问、暂停、更多）全员配备 28px 精密 Bento 药丸胶囊（含纯白微表面底色、1px 细微边界与漫反射微投影），彻底消除浮空杂乱文字；
  - 增补 `撤销`（`<LvIcon name="refresh" size={13} />`）与 `跳过`（`<LvIcon name="chevron-right" size={13} />`）矢量指示徽标；
  - 长期返场检查横幅与减负选择居中收敛至 760px 宽度，与卡片和工具栏垂直绝对居中，减负选项全面升级为圆角微胶囊；
- **侧边栏导航与品牌（Sidebar & Brand）心智对齐**：
  - 桌面左侧侧边栏激活页签注入小驴生态标杆级的左侧 `3px` 勃艮第红指示竖线与内描边高光，当前所在位置一目了然；
- **AI 制卡与手工制卡（Studio Workbench）矢量质感升级**：
  - AI 制卡空态去除文本字符 `✦`，升级为精密 `<LvIcon name="zap" size={24} />`；
  - 左侧来源载入按钮（当前文档、笔记本内容、选中文字、剪贴板）全面嵌入矢量功能图标；
  - 手工制卡实时预览区注入物理闪卡质感，回忆面与答案面标头升级为柔和药丸徽章；
  - 首页「我的卡组」查看卡库按钮升级为带图标的 Bento 胶囊，空卡组复习按钮智能禁用并提示「暂无卡片」。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.48 2026-10-25 · 对齐小驴生态四级表面层级、勃艮第红光环与高质感Bento卡片体系

- **小驴生态标杆四级表面层级架构全面落地（对齐小驴打卡与小驴人脉）**：
  - 底层画布（`canvas`）、卡片表面（`surface`）、悬浮交互（`elevated`）与焦点行动（`Primary CTA`）四层单调层级确立；
  - 核心行动卡（Today Console & Hero）注入左侧 4px 勃艮第红立体边框与微渐变底座，视觉重心瞬间锁定；
  - 核心主按钮全面重塑为星轨勃艮第红双色渐变（`linear-gradient(135deg, #E11D48 0%, #BE123C 100%)`）并附带柔和漫反射光环，悬浮平滑微升；
  - 复习大卡片与翻面主按钮（`Space`）统一继承高阶微投影与星轨高光体系，消除视觉平坦感。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.47 2026-10-25 · 全页面UI深度重构、选择题智能卡片化、完成屏收工胶囊与Bento按钮组落地

- **首页仪表盘（Dashboard）全方位层次感与对齐重构**：
  - 右上角操作区（学习报告、写入思源文档、闪卡管理器、刷新）彻底告别灰扑扑纯文字，升级为精致的 Outline Bento 胶囊按钮组，嵌入单色矢量微标；
  - 彻底修复 `可用时间` 胶囊内 select 下拉控件覆盖挤压文字的样式冲突，时钟图标与文字垂直严格居中；
  - 指标卡片网格注入占位自适应与弹性拉伸，彻底消除因第 4 个卡片带进度条导致的底部高低错落问题，4 大指标卡片底边像素级绝对平齐。
- **复习主界面与完成屏（Review & Done Panel）视觉心流重塑**：
  - 单选题/多选题识别引擎升级：深度兼容 Unicode bullet `•`、`·`、`●` 与思源富文本列表换行，题干中原生 `ul` 列表自动安全遮蔽，卡片下方自动生成带 `[A]`-`[D]` 徽标的现代 Bento 选项大卡片；
  - 顶部返场检查与减负横幅在完成态自动隐藏，复习态收敛为内嵌微卡片，视线全方位聚焦核心复习卡片；
  - 完成屏收工原因由纯文字升级为可交互的 `.lv-chipbtn` 药丸胶囊（点击高亮并展示微对勾）；底部主按钮层级分明，主次一目了然。
- **制卡工作台与卡库管理器（Studio & Manager）细节打磨**：
  - 消除 AI 制卡页面内层重复多余的大标题与面包屑堆叠；模式切换采用标准 Segmented 胶囊，右上角辅助工具按钮统一注入矢量图标；
  - 管理器卡片列表行间距增大至 12px，卡片边角半径升级为 14px，列表行打开文档按钮嵌入精准定位矢量微标。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1942 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.46 2026-10-25 · E2E隔离靶场5分钟冲突退避自旋重试、全功能深层排障与质量加固

- **E2E 隔离靶场 5 分钟冲突退避自旋重试引擎（E2E Collision Backoff）**：
  - 更新 `scripts/e2e-isolated.mjs`，探测超时由原本固定的 60 秒扩展为最多自旋重试 5 分钟（200次 × 1.5s = 300s）；
  - 当本地多插件并行跑测试、端口暂未释放或临时工作区争用时，脚本自动打印进度并温和退避等待，绝不因突发冲突误报失败。
- **全功能深层排查与向前兼容性审计**：
  - 深度核查老用户设置与复习日志架构：`normalizeSettings` 与 `normalizeRevlog` 严格具备缺失字段自动回填与脏条目过滤机制，旧版本升级零报错、数据零丢失。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.45 2026-10-25 · 配对游戏通关徽标矢量化、复习快捷键 Y/N 全局指南对齐

- **闪卡配对游戏（Pairing Game）全流程矢量化收官**：
  - 游戏通关大徽标（`.lv-done-badge`）由字符 `"✓"` 全面升级为高精度单色 `<LvIcon name="check" size={24} />` 矢量微组件；
  - 彻底消灭全游戏界面最后一处字符 Emoji 残余，暗黑模式与高对比度自适应无损。
- **复习快捷键帮助浮层（? 帮助面板）全键位对齐**：
  - 快捷键指南行将判断题按键明确升级为 `T / F / Y / N (1 / 2)`，帮助老用户与新用户清晰发现自然按键别名；
  - 结合移动端四向手势（左1/下2/右3/上4），实现桌面与移动端键盘/触控心智 100% 对齐。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.44 2026-10-25 · 隔离靶场真实 E2E 18项端到端全绿通过、移动端四向触控手势自评对齐

- **隔离靶场真实 E2E 自动化端到端测试 100% 通过（18/18 项）**：
  - 更新 `scripts/e2e-isolated.mjs` 支持现代宿主多路径自适应探测，无需额外配置即开即测；
  - 完整跑通无头思源内核启动、鉴权、防呆、主包与三大分包（hub/review/dialogs）静态可服务性验证、petal 动态加载与启用、临时笔记创建、制卡、FSRS 调度评分回环与消费、以及数据残留终态零残留断言。
- **移动端触控四向自评手势与十字方向键 100% 对齐**：
  - 答案态滑动不仅支持左滑（重来 1）与右滑（良好 3），全新扩充下滑（困难 2）与上滑（简单 4）；
  - 完美呼应单手方向键（←1、↓2、→3、↑4）认知心智，单手刷题顺畅无阻；未揭晓题面时上滑翻面与误触隔离保护保持向下兼容。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项单测 100% 通过；E2E 靶场 18 项全部通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.43 2026-10-24 · 考试计划全流程矢量图标升级、新建与操作微排版精致化

- **考试冲刺（Exam Page）操作流程全方位矢量化升级**：
  - 新建考试计划按钮升级为 `<LvIcon name="plus" size={13} />` 矢量微标，兼顾 `+ 新建考试计划` 语义与单测契约；
  - 开始今日冲刺复习按钮嵌入 `<LvIcon name="cards" size={13} />`，视觉引导更清晰；
  - 计划列表操作栏编辑按钮升级为 `<LvIcon name="edit" size={12} />`、删除按钮升级为 `<LvIcon name="trash" size={12} />`。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.42 2026-10-24 · 菜单图标尺寸多重隔离加固、关闭 Issue #12 与全量 Issues 零遗留闭环

- **右键与块菜单图标尺寸多重隔离加固（Issue #12 & #13 彻底收口）**：
  - 增强 `src/index.scss` 尺寸约束规则，不仅作用于 `.lv-cards-menu-icon`，更覆盖 `.b3-menu__item svg:has(use[*|href*="iconLvCards"])`，双重锁死 16px 尺寸；
  - 彻底杜绝任何极端第三方主题以宽泛全局选择器放大 SVG 图标导致菜单错位的现象；
  - 正式关闭 GitHub Issue #12，实现历史提交 Issue（#12, #13, #14）100% 全部关闭解决。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.41 2026-10-24 · 接入最新殿堂级 Logo (勃艮第深酒红底配翻转双卡与黄金钻石星光核) 与学习页回源微排版

- **核心品牌门面资产重大同步（Ecosystem Avatar v4 Distinctive Soul）**：
  - 彻底淘汰蓝紫色旧版图标，同步小驴全生态最新的殿堂级 Logo（`icon.png` 54KB 与 `icon.svg`）；
  - 采用 Superellipse 超椭圆外壳、勃艮第深酒红（Crimson Velvet）深邃底座、羊脂玉白立体主卡片、9度倾角毛玻璃背面翻折卡、红宝石渐变 FSRS 闪电心流符号 ⚡，以及右下角专属金框白金黄金钻石星光核（Diamond Starlight Topaz）灵魂宝珠；与小驴管家、考试、打卡等生态插件视觉严格齐平。
- **学习页（Learning Page）与收件箱微排版质感提升**：
  - 正式评分趋势与日期详情记录列表中的“回源”按钮嵌入精准单色 `<LvIcon name="target" size={12} />` 组件，指向感更强；
  - 学习日历与收件箱右上角刷新按钮嵌入 `<LvIcon name="refresh" size={13} />`，视觉统一规范。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.40 2026-10-24 · 卡片详情版本采纳矢量化、AI向导版本链字符净化与无障碍语义适配

- **卡片详情（Card Detail）版本历史全方位矢量化升级**：
  - 历史版本采纳按钮升级为单色精密 `<LvIcon name="check" size={12} />` 组件，消除文本字符 `"✓"` 粗糙感；
  - 版本历史展开/收起按钮升级为 `<LvIcon name={versionsOpen ? "chevron-up" : "chevron-down"} size={12} />`，并绑定精确 WAI-ARIA 动态可访问性标签。
- **AI 智能制卡向导（AI Wizard）版本链字符净化**：
  - 清除版本链条目中冗余的 `"⚙ "` / `"✎ "` 字符拼接，依托现有 `LvChip` 语义徽标优雅呈现，消除视觉噪点。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.39 2026-10-24 · 扩充 trash/chevron 矢量图标、首页与复习全界面去字符化排版升级

- **扩充核心矢量图标库（LvIcon）**：
  - 新增 `trash`（删除/垃圾桶）、`chevron-up`（折叠箭头）与 `chevron-down`（展开箭头）单色精密 SVG 矢量组件。
- **首页仪表盘（Dashboard）全界面矢量化去字符**：
  - 本周节奏活跃打卡标志用 `<LvIcon name="check" size={12} />` 替代 `"✓"`，消除跨平台字体渲染不对齐；
  - 深度统计展开/折叠按钮用 `<LvIcon name={deepOpen ? "chevron-up" : "chevron-down"} size={13} />` 替代 `"▴"` / `"▾"`，并优化 Flex 居中对齐；
  - 卡组管理列表操作按钮用 `<LvIcon name="edit" size={13} />` 替代 `"✎"`、用 `<LvIcon name="trash" size={13} />` 替代 `"🗑️"`。
- **复习端助记便签（Memo）编辑入口升级**：
  - 复习翻面后的助记编辑按钮升级为 `<LvIcon name="edit" size={13} />`，消除字符粗糙感，与星轨设计系统高度一致。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.38 2026-10-23 · 管理器列表行快速星标切换、全界面矢量化去 Emoji 与状态反馈升级

- **闪卡管理器（Manager）列表行即时星标快速切换**：
  - 列表行右侧增设一键星标快捷按钮（`<LvIcon name="star" />`），鼠标悬浮点亮琥珀金；
  - 允许用户在卡库浏览时直接一键点选加星/去星，配合 `[⭐ 星标卡]` 筛选即时响应，大幅提升卡片整理效率。
- **全界面视觉去 Emoji 规范落地（UI/UX Pro-Max）**：
  - 管理器工具栏星标过滤按钮与列表行“星标”、“内容缺失”徽章全面升级为高精度单色 SVG 矢量组件；
  - 消除不同桌面系统 Emoji 渲染差异与暗黑模式视觉模糊。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.37 2026-10-23 · 严格清扫 SCSS 裸类污染、对话框全生命周期单测加固与微交互打磨

- **严格清扫 SCSS 顶层裸类与命名空间收敛**：
  - 彻底重构 `src/index.scss` 与 `src/libs/dialog.ts`，将所有对话框内容容器收敛为 `.lv-cards-dialog-content`；
  - 修复选择题隐藏原始列表样式，采用 `:is([data-type="NodeList"], .list, ul, ol)` 作用域嵌套，严防样式污染思源原生及第三方插件。
- **对话框全生命周期焦点回归单测深度加固**：
  - 对话框结构双命名空间适配，全量 242 个测试套件 1941 项单测全部绿灯通过。
- **全量门禁与质量验证**：
  - TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿；发行包 735KB 严守 750KB 红线。

## v0.210.36 2026-10-23 · 填空放弃输入丝滑翻面、判断题 Y/N 键盘支持与超宽表格卡内滚动保护

- **填空交互输入体验排障与优化（Empty Enter Flip）**：
  - 修复填空题输入框为空时敲回车无响应的交互阻断问题：当用户无法回忆放弃作答时，在输入槽直接敲击 `Enter` 瞬间揭晓答案与解析，保证盲打心流零卡顿。
- **判断题键盘按键丰富（Y/N 别名映射）**：
  - 判定按键在原有的 `T / F` 与 `1 / 2` 基础上，无缝支持 `Y`（Yes / 正确）与 `N`（No / 错误），贴合更广泛的用户自然键位习惯。
- **超宽表格卡内滚动保护（Table Overflow Protection）**：
  - 卡面内表格引入 `max-width: 100%; display: block; overflow-x: auto;` 与细滚动条；
  - 杜绝多列长表格撑破 880px 卡片舞台与居中悬浮底座的排版 Bug。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.35 2026-10-23 · 设置中心智能感知小驴打卡项目、一键下拉绑定与生态体验闭环

- **设置中心小驴打卡项目智能感知与一键绑定**：
  - 打开设置时通过公开桥自动探测小驴打卡插件并获取已建打卡项目列表（`queryItems`）；
  - 已安装小驴打卡时，以直观的原生下拉单选框呈现（如 `每日闪卡 (计数)`），支持用户一键点选绑定；
  - 未安装小驴打卡时优雅降级为 ID 文本输入槽，未配置或未安装时静默放行，零强依赖；
  - 搜索栏新增 `checkinIntegration` 关键词匹配，搜索“打卡”即可直达配置。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.34 2026-10-23 · 小驴生态联邦 Epoch 6 架构升级、FSRS闪电双卡图标与全局样式污染治理

- **跨插件生态联邦联动（Epoch 6 标准）**：
  - 对外服务桥 `CardsBridgeApi` 全面支持四别名挂载与安全注销：`window.xiaolvCards`、`window.lvCards`、`window.LvCards`、`window.siyuanCards`（First-Instance-Wins）；
  - 补齐 `hasCapability` 与 `getOverview` 标准契约方法，使小驴快门中枢将闪卡成熟度由 `design` 正式晋升为 `stable`；
  - 复习完成屏（Done Panel）自动联动小驴打卡记录行为事实（`logCheckinEventSafely`），未安装时静默优雅降级；
  - 启动阶段向小驴雷切工作台安全注册 `cards-due-summary` 待复习闪卡组件，卸载时干净注销。
- **顶栏矢量图标重大升级（带 FSRS 闪电与星光）**：
  - 弃用简陋空白双框，升级为全新设计语言 32×32 单色矢量图标：8度倾斜翻转双卡 + FSRS 记忆闪电 ⚡ + 白金钻石星光点。
- **UI 规范统一与 CSS 全局样式污染治理**：
  - 彻底治理 `src/index.scss` 中的 `.dialog-content` 与 `.list` 裸类污染，所有样式严格收敛在 `.lv-cards-*` 作用域内；
  - 注入专属品牌色彩变量：勃艮第心智红（`--lv-brand: #E11D48`）与星光金（`--lv-accent-gold: #FACC15`）；
  - 统一 Dialog 标题栏采用 `.lv-dialog-title-wrap`。
- **工程加固与发行包瘦身优化**：
  - `plugin.json` 新增 `"settingsWindow": true`，最低宿主版本提升为 `"3.8.4"`，前置包含小驴品牌关键词；
  - 构建产出自动兼容生成 `dist/i18n/zh_CN.json` 下划线格式语言包；
  - 优化预览图资源，发行包 `package.zip` 显著瘦身至 732KB（严守 750KB 红线）；主包 gzip 保持在 58 KiB 门禁内。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.33 2026-10-23 · 连击勋章精密矢量化、首屏质感重塑与规范收口

- **连击勋章（Streak Card）精密矢量化与去 Emoji**：
  - 首页连续学习连击徽标（Streak Badge）全面升级为精密 SVG 矢量微标（`<LvIcon name="flame" />` 与 `<LvIcon name="zap" />`）；
  - 彻底摆脱不同平台操作系统 Emoji 颜色渲染不一、暗黑模式低对比度的瑕疵，视觉层级更具科技感与品牌凝聚力。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.32 2026-10-23 · 单手十字方向键评分流（Arrow Keys Flow）与全快捷键气泡更新

- **全面支持单手十字方向键评分（Arrow Keys One-Hand Flow）**：
  - 针对键盘流与手托操作习惯，答案揭晓后支持直接敲击键盘方向键完成自评：
    - `←`（左方向键）：评分 1 重来
    - `↓`（下方向键）：评分 2 困难
    - `→`（右方向键）：评分 3 良好（推荐默认）
    - `↑`（上方向键）：评分 4 简单
  - 让用户单手搭在方向键区即可完成连续极速过卡，大幅拓宽盲打舒适区。
- **全量快捷键覆盖层（Help Overlay）指南完备化**：
  - 按 `?` 呼出的帮助气泡补全方向键评分、专注模式 `z`、星标收藏 `*` 以及撤销按键 `p / q`。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.31 2026-10-23 · 填空输入槽呼吸焦点环、全状态微动效与视觉层级再进化

- **填空交互输入槽聚焦光环增强（Focus-within Breathing Ring）**：
  - 填空题输入胶囊在获得键盘光标焦点时，外围无缝展开品牌色呼吸微光环（`3px` 柔和外发光），消除输入焦点游离感；
  - 配合自动聚焦机制，使用户在双手敲击键盘作答时获得绝佳的输入沉浸感与物理定位反馈。
- **界面微交互与层级细节收口**：
  - 对齐 `ui-ux-pro-max` 规范，所有交互式容器均具备严格的 `:focus-visible` 焦点环与防抖悬浮微位移；
  - 主包体积严控在 58 KiB gzip 门禁红线内，全库测试套件全绿。

## v0.210.30 2026-10-23 · 视觉交互专项升级：判断题键盘视觉引导、语义化矢量图标与微交互对齐

- **判断题交互卡片增设键盘快捷键指示微标（Keyboard Hint Badges）**：
  - 在正确与错误判定胶囊右侧对齐引入等宽字体微标（`[T / 1]` 与 `[F / 2]`），悬浮与聚焦时微光点亮品牌色，与选择题视觉规范严格统一；
  - 简化题面次级标签为简洁英文 `True` / `False`，彻底消除冗余括号文本，大幅增强呼吸感与现代排版质感。
- **视觉去 Emoji 化与语义矢量图标加固（UI/UX Pro-Max 规范）**：
  - 复习完成屏（Done Panel）与管理器列表行对齐去 Emoji 规范，全面升级为无损可缩放、暗色高对比度自适应的 SVG 矢量徽章；
  - 保证在不同操作系统字体环境下呈现绝对一致、专业高级的视觉质感。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.29 2026-10-23 · 设置中心兄弟卡防剧透独立配置项、i18n 完备对齐与治理收口

- **设置中心（Settings）补齐兄弟卡防剧透推迟独立控制项**：
  - 在复习基础设置栏中增设「同源兄弟卡防剧透推迟（Anki Bury Siblings）」切换开关；
  - 配套中英文专属解释提示（`burySiblingsHint`），让用户自主决定是否开启会话内同源卡推迟。
- **国际化与全链路规范治理**：
  - 补充 `manager.starredFilter` 等缺失的中英文语言项，2609 个双语键与 1046 处源码引用 100% 严密对齐；
  - 生产主包体积严密锁定在 58 KiB gzip 门禁以内，烟雾测试与规范契约全绿通过。

## v0.210.28 2026-10-23 · 落地同源兄弟卡防剧透推迟（Anki Bury Siblings）与卡库深度加固

- **落地同源兄弟卡防剧透推迟机制（Anki Bury Siblings）**：
  - 深度引入科学记忆体系中的兄弟卡埋藏算法（`filterBurySiblings` & `disperseSiblings`）；
  - 同一复习会话中，当同一个笔记块（相同 `blockID`）派生了多个挖空或正反面时，自动仅出首张卡片，将其余兄弟卡推迟到次日/后续复习；
  - 彻底杜绝连续出现同一段笔记上下文产生的虚假熟练感（False Mastery），捍卫真实提取努力（Desirable Difficulty）；
  - 考前冲刺突击模式（Cram）智能放行全部卡片，满足考前地毯式刷题需求。
- **全量门禁与质量验证**：
  - 全库扩展至 242 个测试文件、1941 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.27 2026-10-23 · 智能拼写容错判定、卡库星标筛选过滤与专注复习模式

- **融合主流产品智能拼写容错（Typo Tolerance，支持 1 字笔误微瑕放行）**：
  - 引入 Levenshtein 动态编辑距离算法，在打字与填空题非严格模式下，仅有 1 字符笔误（如错别字、漏打字母且长度 >= 3）时，判定为“拼写微瑕”，智能放行建议 3 良好；
  - 严谨保护数值严谨性（BX-1 标量数值政策）：包含正负号、小数点或数值运算符号时严格按数值逻辑判分，杜绝数值失真。
- **卡库管理器（Manager）星标重点卡筛选过滤与状态持久化**：
  - 工具栏新增 `[ ⭐ 仅看星标 ]` 快捷胶囊，与复习端加星操作无缝互通，支持快速将星标卡批量转移至冲刺卡包或一键导出；
  - 列表行直观呈现 `⭐ 星标` 徽章与原笔记块丢失的 `⚠️ 内容缺失` 健康警示徽标。
- **复习端沉浸专注模式（Zen Focus Mode）**：
  - 支持按键盘 `z` 或在更多菜单中一键进入极简专注模式，自动隐藏顶栏工具栏，只保留核心题干与作答卡片，右上角悬浮极淡退出胶囊，带来深层心流体验。
- **多轮严格审核验证**：
  - 全库扩展至 241 个测试文件、1938 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.26 2026-10-23 · 完成面板实战命中率勋章、全流程无障碍读屏保护与键盘视觉导引

- **完成面板实战答题战报勋章（Quiz Accuracy Badge）**：
  - 复习完成屏（Done Panel）自动汇总本场交互作答总数与正确数，计算**实战命中率（例如：80% 4/5）**并赋予多维柔和微光勋章（`.lv-done-quiz-bubble`）；
  - 让用户在完成记忆调度的同时，直观审视自己的实战做题准确度，获得极大的正向成就反馈。
- **全流程 WAI-ARIA 读屏无障碍保护（Accessibility Alignment）**：
  - 单选题绑定 `role="radiogroup"` 与 `role="radio"`，多选题绑定 `role="group"` 与 `role="checkbox"`，判断题绑定 `role="radiogroup"` 与 `role="radio"`，完备注入 `aria-checked` 状态；
  - 保证视障读屏软件用户能够清晰流畅地收听选项选中状态与正误播报。
- **选项卡片键盘快捷键提示徽章（Keyboard Hints）**：
  - 选项卡片右侧呈现淡雅等宽字体快捷键小微标（`[A]`、`[B]`、`[C]`、`[D]`），鼠标悬浮或聚焦时自动高亮品牌色，指引用户无缝键盘作答。
- **全量门禁与质量验证**：
  - 全库扩展至 241 个测试文件、1936 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.25 2026-10-22 · 答题听觉触觉多维反馈、填空自动聚焦与解析卡片展开微动效

- **答题听觉与触觉多维正负反馈（Haptic & Web Audio Feedback）**：
  - 选择题、判断题和填空题交互作答时，答对即时触发清脆上扬和弦音（Web Audio 合成）与愉悦轻震；
  - 答错或漏选时触发低沉柔和提示与短震动，给用户带来极具吸引力的即时正反馈回路。
- **填空题输入框无缝自动聚焦（Autofocus Input）**：
  - 进入填空题时输入框自动聚焦并闪烁光标，双手无需离开键盘直接打字作答并按回车判定。
- **参考解析卡片平滑展开微动效**：
  - 翻面后参考解析卡片伴随平滑透明度与位移动效渐显展开，视觉层级优雅自洽。
- **全量门禁与质量验证**：
  - 全库扩展至 241 个测试文件、1936 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.24 2026-10-22 · 多选题多选集合切换与确认提交、键盘快捷键全覆盖指南

- **多选题（Multiple-Choice）完整交互作答闭环**：
  - 针对多选题支持同时多选/反选任意选项集合，选项卡片即时呈现选中态与对勾徽标；
  - 选项矩阵下方呈现 **`[ 确认提交多选 (Enter) ]`**，敲回车或点击按钮统一提交；
  - 细分评分反馈：完全答对判定 3 良好，部分正确（漏选）判定 2 困难并提示漏选项，答错判定 1 重来并全量标红标绿。
- **快捷键帮助菜单（Help Overlay）补齐选择与判断指南**：
  - 按 `?` 呼出的帮助气泡补全 `A / B / C / D` 选择题作答与 `T / F` 判断题判定的完整说明。
- **全量门禁与质量验证**：
  - 全库扩展至 241 个测试文件、1936 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.23 2026-10-22 · 单键极速连击过卡、顶栏双时钟语义区分与正文冗余列表过滤

- **空格/回车单键极速连击过卡（One-Key Speed Flow）**：
  - 答案揭晓后支持直接敲击 `Space`（空格）或 `Enter`（回车），自动采用推荐评分（如 3 良好）秒级提交并顺滑切入下一张卡；
  - 配合选择题/判断题键盘作答，用户从审题、作答、翻面到评分全程无需触碰鼠标，刷题效率提升数倍。
- **顶栏双时钟语义视觉区分**：
  - 会话总倒计时标明 `⏳ 总余 14:38`，单卡限时倒计时标明 `⚡ 限时 0:39`（快超时红色呼吸闪烁），彻底消除黑圆时钟混淆。
- **正文冗余列表项智能隐藏**：
  - 出现交互式大选项卡片时，自动隐藏原 Markdown/HTML 中生硬的 `ul`、`ol` 列表文本，保留纯净题干，让界面视觉统一舒展。
- **全量门禁与质量验证**：
  - 全库扩展至 241 个测试文件、1936 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.22 2026-10-22 · 选择/判断/填空交互式作答革命、卡片质感重塑与悬浮浮岛底座

- **选择题（单选/多选）交互卡片矩阵（Choice Option Matrix）**：
  - 自动识别单选题与多选题的选项列表（如 A. / B. / C. / D.），在题干下方就地生成大号交互选项卡片；
  - 支持鼠标悬浮微投影与点击作答，支持键盘快捷键盲打（`A`/`B`/`C`/`D` 或 `1`/`2`/`3`/`4`）；
  - 点击后即时给出正误反馈（正确项翡翠绿高光 + `✓ 正确答案`，错选项红光 + `✗ 你的选择`），并自动翻面展示答案与参考解析。
- **判断题（对错题）大胶囊判定卡片（Judgment Cards）**：
  - 自动识别判断题型，在题干下方直观呈现两个大号判定胶囊：`[ ✓ 正确 / 对 (T) ]` 与 `[ ✗ 错误 / 错 (F) ]`；
  - 支持点击或敲键盘 `T`/`1` 或 `F`/`2` 瞬间判定，告别死板自评。
- **填空题即时打字作答框（Interactive Fill Box）**：
  - 填空题除支持按空格或点击下划线逐空揭晓外，在题干下方嵌入精美输入框，支持直接输入答案敲回车判定并比对字符级差异。
- **复习端 UI 美学全面加强（Elevated Card & Floating Action Island）**：
  - 卡片主体（`.lv-card`）：收束过宽的内边距为优雅自适应留白，增加多层微环境光投影与顶部发丝高光；
  - 底部操作栏：从整块生硬长方条升级为现代化**浮岛悬浮药丸底座（Floating Action Dock）**，居中微渐变、柔和光泽并内嵌快捷键药丸；
  - 答对时推荐评分项（如 3 良好）自动呈现呼吸微光圈（`.lv-btn-suggested`），用户连击空格即可秒级顺畅进入下一张卡！
- **全量门禁与质量验证**：
  - 全库扩展至 241 个测试文件、1936 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.21 2026-10-22 · 全维度深度审查闭环、富文本卡面统一作用域与全屏响应式加固

- **全维度富文本卡面排版统一作用域（`.lv-unified-face` & `.lv-card-content`）**：
  - 复习端卡面、详情抽屉与制卡预览容器全量注入 `.lv-unified-face` 与 `.lv-card-content` 双重作用域；
  - 彻底确保系统列表点、任务复选框、Excalidraw 画布、数学公式与代码块在任何卡面渲染场景下 100% 隔离对齐，杜绝放大与变形。
- **首页仪表盘在中等视口（560px~780px）下的统计卡自适应加固**：
  - 修复中等宽度下 `@container` 将统计卡错误重设为 4 列导致挤压变形的逻辑笔误，平滑过渡为紧凑美观的 2x2 网格。
- **复习就绪看板（Bento Grid）网格弹性增强**：
  - 卡片网格采用 `minmax(220px, 1fr)` 自动折行，在各种宽窄分屏下皆舒展通透。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1929 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.20 2026-10-22 · 填空下划线智能槽位识别、引述块解析防剧透与复习工具栏单行等高

- **填空题下划线（`_{3,}`）智能槽位转换与无损遮蔽**：
  - 在卡面解析中自动识别填空题常见的连续下划线（如 `_____` 或 `___`），在问题态将其无损映射为可点击揭晓的填空遮蔽槽（`［ 填空 ］`）；
  - 彻底终结填空题未显示答案前毫无遮挡的缺陷，点击答案后原汁原味展示题面与答案。
- **引述块（`blockquote`）解题思路与解析防剧透**：
  - 深度兼容小驴考试、思源超级块及结构化卡片，在问题态将题干下方的引述块解析安全遮蔽为 `［ 参考解析·查看答案时揭晓 ］`，杜绝未答题先看解析的严重剧透；
  - 接入小驴考试原生属性 `custom-exam-answer`、`custom-exam-analysis` 与备选答案，打字题与选择题判分 100% 准确识别。
- **复习端控制条（`lv-head-tools`）彻底杜绝多余换行与等高对齐**：
  - 修复 `··· 更多` 按钮孤零零掉落到第二行的布局问题；
  - 强制锁定工具行单行排布（`flex-wrap: nowrap !important`），优化下拉框与胶囊宽度，所有控件（下拉框、胶囊、按钮）28px 严格等高；
  - 窄屏（<= 740px）自适应隐藏辅助按钮文本只保留图标，无论思源主屏、副屏还是分屏，控制栏均如刀削般整齐。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1929 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.19 2026-10-22 · 根治单选题巨大黑圆排版、修复首页卡包挤压错位与AI 404诊断引导

- **根治单选题/填空题列表项被放大为「巨大黑色实心圆」的严重 Bug**：
  - 深度排查发现思源内核导出的无序列表项含有 `#iconDot` 图标，此前被卡面清洗误判定为独立矢量画布并被样式放大至整行宽度；
  - 在卡面管线中严格排除 `#iconDot`、`#icon` 与 `.protyle-action` 图标，并在全局 CSS 中对齐思源列表项容器与图标约束（10px 圆点垂直居中），单选题选项排版瞬间恢复清爽优雅；
  - 修正富内容检测，防止普通单选题被错误提示“含图片，可左右滚动”。
- **彻底根治首页「我的卡组」卡片被挤压成单字竖条的严重布局错位**：
  - 修复 CSS Grid 在超宽屏下的计算漏洞，卡片最小宽度由 180px 调整为舒适规范的 280px；
  - 卡片标题应用 `white-space: nowrap; text-overflow: ellipsis`，彻底杜绝汉字每个字被强制换行的竖排错位现象。
- **优化首页「可用时间」悬空脱节与 7 日打卡环形高亮**：
  - 将「可用时间 [15分钟]」与状态标签紧凑内聚为药丸微胶囊组，告别悬浮在插画头顶的割裂感；
  - 修复 7 日打卡在今日已完成打卡时的层叠冲突，消除内联生硬的 outline 圈，保持一致的翡翠绿/品牌蓝实心打勾；
  - 补充「今日已复习」统计卡达成率说明，使 4 列统计卡片高度完全等高对齐。
- **美化复习端控制条中突兀裸露的「清空到期队列」**：
  - 会话目的结束条件赋予正规的语义胶囊样式（`.lv-purpose-end-chip`），并加上明确的前缀 `🎯 目标：清空到期队列`，消除误认为是操作按钮的困惑，使整行控制条等高对齐。
- **AI 制卡端点智能清洗与 HTTP 404 精准排查引导**：
  - `normalizeEndpoint` 自动识别并剥离用户配置中误贴的 `/chat/completions` 尾缀；
  - 遇到 HTTP 404 时给出详尽的中文排查指导（检查 Base URL 是否缺少 `/v1` 或模型名称是否拼错）。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.18 2026-10-22 · 思源官方斜杠菜单原生制卡、Petal生命周期与卡包管理全闭环

- **接入思源官方斜杠菜单（protyleSlash）原生制卡通道**：
  - 深度结合思源 Petal 插件契约，在编辑器斜杠菜单原生挂载制卡入口；
  - 在任何文档段落中键入 `/zk`（制卡）、`/card`、`/shanka`，即可瞬间唤起卡组选择器将当前块入组，制卡效率极致提升。
- **思源官方 Petal Lifecycle 生命周期核心契约完备对齐**：
  - 规范实现 `uninstall()` 插件卸载生命周期钩子，彻底销毁顶栏元素、定时器与内存引用；
  - 对齐官方 SDK 1.2.9 中 `addTopBar` 的原生 `contextMenu` 右键菜单规范，消除第三方事件干扰。
- **深度结合官方卡包管理 API 实现卡包重命名与删除闭环**：
  - 深度结合官方内核 `/api/riff/renameRiffDeck` 与 `/api/riff/removeRiffDeck` 原生端点；
  - 在卡组仪表盘操作列中完整提供 **`[ ✎ 重命名 ]`**、**`[ 🗂️ 导出分享包 ]`** 与 **`[ 🗑️ 删除卡组 ]`**（带二次安全确认），彻底填补卡包生命周期管理的最后拼图。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.17 2026-10-22 · 目标管理编辑功能补全、考试卡片层级分割与全链路深度排查

- **学习目标（Goals）编辑修改功能完备闭环**：
  - 彻底修补学习目标卡片右侧缺少编辑入口的长期缺失，在操作栏补全 **`[ 编辑 ]`** 按钮并实现 `startEdit(goal)` 状态回填；
  - 支持随时对已有学习目标的每日可用时间、截止日期、水平及完成定义进行回改保存，不再需要删除后重新创建。
- **考试计划（Exam）卡片视觉分层优化**：
  - 在考试计划卡片底部操作按钮区域增加精细的上方分割线与内边距（`border-top` 与 `margin-top`），使计划进度、建议分析与管理操作层级分明。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.16 2026-10-22 · 管理器工具行响应式对齐与首页卡包交互细节全面精修

- **闪卡管理器（Manager）工具栏响应式与对齐精修**：
  - 引入 `.lv-toolbar-right` 容器包装卡片总数指示与全选药丸按钮，彻底消除窄屏或窗口拉伸时的垂直错位与断行溢出；
  - 列表行无障碍 accessible name 严格对齐（`aria-label` 完整保留文本原句，兼顾视障读屏与视觉高光）；
- **首页「我的卡组」交互独立与微动效防误触**：
  - 卡组容器升级为中性卡片底座，消除整卡点击态与右侧快捷复习按钮的事件冒泡与视觉冲突；
  - 鼠标 hover 卡组标题平滑高亮品牌色，右侧高光药丸 `[ 🗂️ 复习 ]` 独立响应快速启动；
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.15 2026-10-22 · 管理器搜索高亮匹配、复习卡面实时字号调节与撤销即时反馈

- **闪卡管理器（Manager）搜索关键词实时高亮（Search Highlighting）**：
  - 搜索筛选卡片时，内容摘要中匹配的关键词自动呈现温润暖黄微圆角高光标记（`<mark class="lv-search-hit">`）；
  - 严格保持 WAI-ARIA 读屏无障碍规范（`aria-label` 保留完整原句），兼顾视障辅助与视觉定位。
- **复习端卡面字号实时快捷微调（In-Review Live Font Zoom）**：
  - 顶部控制行新增小巧精致的字号调节微按钮组 **`[ A− ] [ A+ ]`**；
  - 支持在 80% ~ 160% 之间实时无级缩放卡面字号，遇到字多或字少的卡片随手即调，无需退回复习去翻找全局设置。
- **复习端撤销评分（Undo）即时 Toast 反馈**：
  - 执行 `z / p / u` 撤销上一张评分时，弹出清晰笃定的完成提示，彻底打消误按与是否生效的疑惑。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.14 2026-10-22 · 管理器全选本页批量操作与复习快捷键帮助完备对齐

- **闪卡管理器（Manager）本页全选一键操作**：
  - 工具栏新增 **`[ ☑ 全选本页 / 取消全选 ]`** 快捷药丸按钮；
  - 自动感应当前页全部卡片的选中状态，一键全选当前页，大幅加速多选加入卡组、移动卡组与批量导出工作流。
- **复习端快捷键帮助浮层（Help Overlay）全量对齐**：
  - 补齐新增的高频快捷键说明：`Shift+Space` 全部揭晓（跳过逐步回忆）、`r` 翻转问答自测、`z / p / u` 撤销上一步；
  - 键盘操作指引更加清晰规范。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.13 2026-10-22 · 仪表盘卡包一键直达复习与卡包生态全链路连通

- **仪表盘「我的卡组」一键直达复习闭环**：
  - 针对高频单卡包复习场景，在首页「我的卡组」列表项右侧直接引入 **`[ 🗂️ 复习 ]`** 快捷药丸按钮；
  - 点击即可跳过全局筛选，自动锁定指定卡包（`scope=deck:<id>`）直达复习，大幅缩短复习路径；
  - 保留卡包名称点击直达闪卡管理器筛选，支持浏览与复习双通道分流；
  - 卡包展示数量由 4 个平滑扩容至最多 6 个，增强卡包较多用户的首屏掌控感。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.12 2026-10-22 · 多挖空渐进式分步回忆、专业缩放拖拽灯箱与原地逆向自测

- **多挖空渐进式逐步揭晓（Step-by-Step Cloze Recall）**：
  - 突破性引入主动提取分步回忆：问题态下点击任意遮罩槽位（`[ 1: 回忆这里 ]`）即可单独揭晓该空，其余空保持遮蔽，彻底避免视线提前剧透；
  - 键盘快捷键无缝联动：按空格键顺序逐空揭晓，`Shift+Space` 或点击「全部揭晓」一键全显，所有空揭晓完毕后自动展开评分态。
- **专业级交互式图片灯箱（Zoom & Pan Lightbox）**：
  - 滚轮无级缩放（0.5x ~ 4x 缩放）与拖拽平移（Drag & Pan），轻松查看复杂导图、高清解剖图与流程架构图；
  - 双击图片智能切换 1:1 原图与自适应比例，顶部常驻缩放百分比胶囊与快捷重置药丸。
- **问答卡原地逆向自测模式（On-the-fly Reverse Recall）**：
  - 更多工具栏中新增 **`[ ⇄ 翻转问答自测 (R) ]`** 开关（支持快捷键 `R`）；
  - 点击即可在内存中一键对调问答正反面自测，零修改用户原笔记，强化正逆双向认知。
- **评分按钮与按键盲打瞬时物理反馈**：
  - 键盘敲击 `1`、`2`、`3`、`4` 或 `Space` 时，对应按钮触发瞬时微弹性下沉与光晕高亮，提供清晰笃定的视觉确认感。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.11 2026-10-22 · 复习完成面板质感升华、记忆留存率指示器与错题就地强化

- **复习完成结算面板（Done Panel）深度进化**：
  - 增加**本场记忆留存率（Retention Rate）指示徽标**：根据正式复习数据动态计算本场留存率（`Zap` 闪电微标 + 高光胶囊气泡），为学习提供清晰的直观反馈；
  - 增加**错题就地强化闭环（Reinforce Lapses）**：若本场有遗忘卡片（`sessionForget > 0`），提供一键 `[ 🔥 强化这批遗忘卡 ]` 按钮，直接将遗忘卡载入短期强化循环，趁热打铁攻克薄弱盲区；
  - 优化完成面板按钮排布与响应式流式布局，增强完成复习后的掌控感与成就感。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.10 2026-10-22 · 顶栏静默优雅化与「复习就绪看板」Bento 升级

- **顶栏刺眼红底数字角标彻底消除（静默优雅提示）**：
  - 响应用户反馈，彻底移除思源顶栏图标上刺眼的红底白字圆形数字小球（`.lv-badge`），消除强迫症与心理负担；
  - 待复习卡片数与目标达成状态优雅收敛至顶栏图标的原生悬停提示（`title` / `aria-label`），鼠标 hover 即可查看详情，界面纯净如初。
- **重构「开始复习」无到期卡与就绪界面为沉浸式 Bento 看板**：
  - 彻底终结“顶部漂浮报错黄色警告条、中间悬空单薄小盒子”的荒凉感与割裂感；
  - **内聚隔离卡片提示**：当存在异常或移动的卡片时，不再悬挂在屏幕顶栏之下，而是内嵌于就绪看板顶部作为专属健康提示卡，附带清晰说明与一键检测/修复按钮；
  - **丰富清晰的下一步行动矩阵（Bento Grid 便当盒）**：
    - **便当 1【⚡ 自主提前巩固】**：一键开启 Cram 提前冲刺练习，按遗忘次数突击薄弱知识点，或切换“仅学新卡”；
    - **便当 2【✏️ 制作与积累新卡】**：快捷通往制卡工作台、AI 智能制卡与材料收件箱；
    - **便当 3【🗂️ 卡片库浏览与整理】**：跨卡组搜索闪卡、批量归组迁移及健康体检；
  - **底栏全局路径**：提供全宽药丸大按钮 `[ 🏠 返回闪卡主页 ]` 与 `[ 🔄 刷新状态 ]`，让用户明确知道接下来可以做什么。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；生产构建与烟雾测试全绿。

## v0.210.9 2026-10-22 · 存量卡片原生无损复习呈现、批量卡组管理与卡片编辑挖空增强

- **闪卡卡面显示与存量复习呈现重构（零修改原笔记）**：
  - 复习端全面增强思源原生整块闪卡、块备注答、第三方插件答与分隔符问答的视觉呈现；
  - 动态卡片类型徽标：识别并展示 `[ 📖 原生闪卡 ]`、`[ 💡 备注答 ]`、`[ 💡 插件答 ]`、`[ 💬 问答 ]`、`[ ✏️ 挖空 ]`、`[ 💻 代码 ]`、`[ 🖼️ 遮挡 ]`；
  - 原生自评提示条：原生无答案闪卡在答案态呈现温和的 `[ 🎯 思源原生自由回忆 ]` 自评提示条，告知用户原笔记未受修改，可直接自评；
  - 备注与生态插件答案高光卡片：思源块备注（`memo`）与第三方插件答案属性（`custom-card-answer` 等）自动呈现在柔和紫蓝微底高光呼出框中；
  - 问答分割线与答案容器：采用中心渐变发丝线（`linear-gradient`）与 12px 圆角答案高光底色，题干与答案层次更分明。
- **卡包管理与批量操作增强（卡片库工作流突破）**：
  - 闪卡管理器（Manager）多选状态下新增 **`[ 📁 加入卡组 ]`** 与 **`[ 📦 移动到卡组 ]`**：
  - 支持弹窗自适应选择已有卡组或直接输入新卡组名称即时创建；
  - 在卡组视图（`deckScope`）下支持一键跨卡组迁移，自动更新内核调度队列并刷新缓存。
- **卡片编辑快捷挖空与交互增强**：
  - 卡片编辑器（`card-editor.svelte`）标题栏新增 **`[ == 挖空 == ]`** 快捷按钮；
  - 支持选中文字一键包裹 `==...==`，未选中文本时自动插入 `==答案==` 占位并将光标精确定位；
  - 深度支持键盘快捷键 `Ctrl+H` / `⌘H` 极速挖空，与思源原生高亮习惯保持一致。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.8 2026-10-22 · 存量与原生闪卡只读式无损兼容、第三方插件生态支持与全页面UI深度进化

- **存量闪卡与思源原生闪卡只读式无损兼容机制（零修改笔记）**：
  - 确立“绝不强改用户原笔记”最高铁律，建立纯内存动态遮罩与自适应解析管线（`delimited-qa.ts` & `card-face.ts`），原笔记块 100% 保持纯净，零字节落盘修改；
  - 兼容思源原生整块闪卡（`free-recall`）：复习端提供 `[ 📖 原生闪卡 ]` 徽标并在答案态展示自评打分引导；
  - 兼容思源块备注作答案（`memo`）及第三方插件答案属性（`custom-card-answer`、`custom-flashcard-answer`、`custom-card-memo`）：答案态以柔和高光卡片呈现参考答案；
  - 兼容 `::` 概念卡、`:::` 描述卡、`Q: / A:` 及 `问：/ 答：`：问题态在内存中就地生成 `[ 概念释义 ]` / `[ 参考答案 ]` 遮蔽槽位，答案态平滑揭晓；
  - 严格防范语法误判：加入前瞻/后顾正则约束，彻底排除 C++ / Rust 命名空间（如 `std::vector`、`std::cout`）及代码块/公式内的文本误判。
- **维护中心存量卡片体检与操作安全警示**：
  - 维护体检扫描将原生闪卡、备注卡与分隔符卡全面识别为健康卡片，体检报告不再出现存量老卡“虚假坏卡”误报；
  - 存量格式规范化工具定位为完全可选（`[ 🔄 存量格式规范化 (可选) ]`），并在点击前增加前置警示确认弹窗，明确说明“完全可以不转换、原笔记直接兼容复习”，切实保障用户知情权。
- **全页面 UI 深度质感进化（吸收现代参考图语言）**：
  - **总览页**：引入暖橙金渐变连击卡（`lv-streak-card`）、7日打卡垂直圆润胶囊排、金融级平滑渐变保持率曲线（`<polygon>` 面积阴影与悬浮白边圆珠）、卡组便当盒与成就网格；
  - **复习端**：升级 6px 双色圆润胶囊进度条、闹钟型计时徽标、来源层级面包屑微胶囊与四级评分按钮顶部色标线；
  - **日历与目标**：月历网格今日虚实双层光环高亮、胶囊形负载预测柱、Bento 目标卡片与打卡微胶囊；
  - **组件库**：分段控件（`LvSegmented`）、卡片详情分面（`lv-facets`）、滑杆数值徽标与空态图标全面药丸化与微环境光多层投影。
- **全量门禁与质量验证**：
  - 全库扩展至 240 个测试文件、1928 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.7 2026-10-21 · Excalidraw SVG 画布识别与遮挡制卡、标量数值答案政策引擎与演示私密模式

- **Excalidraw SVG 画布识别与图片遮挡制卡全链路支持（Issue #14）**：
  - 在闪卡质量门禁（`flashcard-quality.ts`）中扩展对 `<svg>` 矢量画布、Excalidraw 资源引用（`.excalidraw.svg`）及思源挂件块的识别，支持直接将矢量画布制卡；
  - 在统一卡面渲染管线（`card-face.ts`）中建立 SVG 矢量的安全清洗与内联渲染保护，彻底消除 SVG 标签被转义为明文代码的问题；
  - 在图片遮挡编辑器（`occlusion-editor.svelte`）与复习遮挡定位（`review.svelte`）中全面扩展支持 `svg` 画布元素的精确定位与遮挡绘制，兼容 `<img>` 与 `<svg>` 混合场景。
- **标量数值答案政策引擎（BX-1）**：
  - 实现高精度标量数值答案判定引擎（`scalar-numeric-policy.ts`），支持物理量国际单位与派生单位前缀自动换算、绝对误差/相对误差/组合容差模式、零值防除零自动降级、有效数字校验与百分数小数互换，不可判定时原答留痕退回人工裁决。
- **临时演示与投屏私密展示模式（BX-6）**：
  - 实现投屏/录屏/教学三大场景的演示私密展示模式控制器与脱敏过滤器（`presentation-privacy.ts`），在顶栏菜单与快捷命令中完成一键切换闭环，对敏感块 ID、笔记路径、卡包名及个人信息实时脱敏。
- **复习卡面来源层级面包屑（BX-11 UI）**：
  - 在复习页面卡面顶部根据调研 docs/49 落地来源层级面包屑（笔记本 > 文档 > 章节，`review-breadcrumbs.ts`），支持标题 Markdown/HTML 格式清洗、紧凑截断与多深度自适应中间折叠，彻底消除原子卡片复习时的“孤岛感”。
- **分享包差异比对引擎与冲突解决（BX-12）**：
  - 在 `lvcards-diff-inspector.ts` 中实现同名卡组 .lvcards 导入的字段级差异比对（`inspectLvCardsImportDiff`），精准识别全新卡、完全相同卡、正文变动卡与仅便签标签变动，并建立 4 种细粒度冲突处理决策（keep-local / overwrite / fork-new / merge-memo），优先保护用户本地私有便签。
- **误解簇地图交互面板（BT-3 UI）**：
  - 在闪卡中心维护页落地误解簇地图交互面板（`misconception-panel.svelte`），展示混淆概念对、严重度徽标与三大干预建议（对比辨析、反例构建、来源拆卡），支持一键出题与 Markdown 诊断报告脱敏导出。
- **复习超时单调时钟防漂移（M3·FR8）**：
  - 升级复习倒计时状态机（`review-countdown.ts`），基于单调时钟彻底防止系统休眠与后台节流掉帧漂移，支持 pause/resume 零时差挂起与紧急预警状态机。
- **依赖链全线安全升级与 Issue 治理闭环**：
  - 升级 `vitest@5.0.5`、`js-yaml@5.5.0`、`svelte-check@4.7.7`、`sass@1.105.2`；
  - 修复并验证菜单图标隔离规则（Issue #12/#13），关闭重复工单 #13。
- **全量测试与门禁验证**：
  - 全库扩展至 239 个测试文件、1914+ 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；构建与烟雾测试全绿。

## v0.210.6 2026-10-20 · 顶栏自愈保活、数据回音抑制与 AI 全局治理（能力地图/Agent闸门/数据边界/Grounded契约）

- **顶栏条目自愈挂载控制器（连通性与图标保活）**：为顶栏条目指定唯一标识 `id: "topbar-lv-cards"`，实现 `ensureTopBarElement()` 连通性自愈控制器，当宿主重构顶栏、窗口缩放或自适应折叠导致原有 DOM 断连（`!isConnected`）时，自动感知并即时重新注册挂载；在 `onload`、`onLayoutReady`、`refreshDueBadge` 与 `renderBadge` 中全链路保护，彻底解决顶栏图标偶发突然消失的问题。
- **数据重载回音抑制（Echo Suppression 消除全页反复重绘）**：全面收紧 `onDataChanged` 判定边界，过滤无关外部文档事件；建立本地主动写文件的 3000ms 时间戳回音抑制窗口，彻底消除数据写盘后触发错误全量重载导致的页面内容频繁闪烁与正在复习的组件被强制重刷。
- **AI 能力总地图与行为风险分级矩阵（BU-1 / BU-2）**：在 `ai-capability-map.ts` 中建立捕获/澄清/制卡/练习/应用/维护六大模式完备能力登记、角色职责划分与不可篡改调度契约（`effectsKernel: false` 恒真）；实现五级行为风险分层（只读/候选/单写/批改/调度篡改阻断）与预览/确认/撤销策略矩阵。
- **思源 Agent 能力协商适配器与循环调用闸门（BU-3 / BU-4）**：在 `ai-agent-negotiator.ts` 中实现宿主内核版本（>=3.9.0）与 Agent 运行时多维探测，提供诚实降级至普通 AI 或纯手工流程机制，严格实行降级不注册虚假工具契约；在 `ai-agent-guard.ts` 中建立任务级工具循环闸门与安全状态机，拦截注入越权参数，实施最大调用深度、调用总次数、执行超时、连续死循环及写入实体配额熔断。
- **AI 数据边界保留策略与 Grounded 输出契约（BU-9 / BU-10）**：在 `ai-data-boundary.ts` 中登记提炼/挖空/问答/诊断/嵌入五类请求的数据类型、传输目的地、0 天瞬态保留与逐项退出回退机制，提供敏感数据最小化过滤；在 `ai-grounded-contract.ts` 中建立原子断言与来源块引用绑定机制，强制对无直接依据内容打上 `inferredTag` 演绎推测标识，提供严防伪装成笔记事实的契约合规审计门禁。
- **Token 估算与费用硬上限引擎（BU-12 / BU-24）**：在 `ai-token-cost.ts` 中实现发送前输入与输出 Token 估算、模型定价矩阵与推理耗时计算，支持对本地 Ollama 模型标记零费用，建立单次请求 Token 上限、单日 Token 上限与单日费用 USD 上限的前置熔断拦截与无 AI 本地等价替代。
- **统一 AI 流水线运行时与复习面包屑（BU-11 / BX-11）**：在 `ai-pipeline-runtime.ts` 中建立统一 AI 调用流水线状态机（eligibility → ceilings → assembly → dispatch → schema），统一管理 AbortSignal 主动取消、超时控制与分层降级，支持主端点故障重试与备用端点自动路由；在 `review-breadcrumbs.ts` 与 `review.svelte` 中根据调研 docs/49 落地复习来源层级面包屑（笔记本 > 文档 > 章节），支持标题 Markdown/HTML 格式清洗、紧凑截断与多深度自适应中间折叠。
- **分享包差异比对引擎与误解簇交互面板（BX-12 / BT-3 UI）**：在 `lvcards-diff-inspector.ts` 中实现同名卡组 .lvcards 导入的字段级差异比对（`inspectLvCardsImportDiff`），精准识别全新卡、完全相同卡、正文变动卡与仅便签标签变动，并建立 4 种细粒度冲突处理决策（keep-local / overwrite / fork-new / merge-memo），优先保护用户本地私有便签；在 `misconception-panel.svelte` 与 `maintenance-page.svelte` 中落地误解簇地图交互面板，展示混淆概念对、严重度徽标与三大干预建议（对比辨析、反例构建、来源拆卡），支持一键出题与 Markdown 诊断报告脱敏导出。
- **全量测试与门禁验证**：全库扩展至 233 个测试文件、1871 项测试 100% 通过；TypeScript 与 Svelte-check 0 错误 0 警告；生产打包与 smoke-dist 烟雾门禁全绿。

## v0.210.5 2026-10-19 · 跨插件对外生态窗口桥、高对比度无障碍加固与对话框/生命周期闭环

- 彻底解除分享包导出端的 20 页（2000 张）硬编码截断，实现无上限全量分页读取与总数、页数、唯一 ID 严格校验，支持大卡组无截断导出；废弃 `ddStripHtml` 粗暴剥离 HTML 标签，分批通过 SQL 显式 LIMIT 读取底层原始 `blocks.markdown` 与 `blocks.memo`，代码块、LaTeX、硬换行与列表格式完全保真。
- 纯模块 `lvcards-export.ts` 结合卡面特征精准自适应推断卡型（cloze/code/list/qa）；导出文件重新导入时 100% 判定为重复项，闭环双向导入往返无损一致性。
- 落地分享包导入元数据恢复能力：纯模块 `applyPackageCardMetadata` 将 `memo`（助记线索）与 `tags`（标签数组）自动落盘恢复为思源原生块属性（`attrs.memo` 与 `attrs.tags`），支持有界分批并发与单块失败旁路隔离。
- 菜单插件图标尺寸隔离全链路收口（Issue #12/#13）：在 `topbar-menu.ts` 顶栏右键功能菜单与 `block-menu.ts` 块图标菜单中统一传入 `iconClass: "lv-cards-menu-icon"`，彻底根除第三方主题下顶栏菜单图标被异常放大的问题，新增菜单实例类名注入回归测试。
- 内核插件离线契约测试闭环：建立 Goja 宿主仿真环境测试套件 `tests/kernel.spec.ts`，验证 `kernel.ts` 完整生命周期绑定（`onload`/`onunload`）、`echo` 桩、`publish-exam-plans-changed` RPC 广播契约与非法变更通知严格拦截。
- 内核 API 响应校验全链路统一（P1 风险收口）：将 `riff.ts` 与 `flashcardV2.ts` 的私有解包分支统一收敛至 `unwrapKernelData`，消除状态码与缺失字段的解析漂移，并回收 34 bytes gzip 体积。
- 通用思源 API 契约与大库韧性测试闭环：新增测试套件 `tests/siyuan-api.spec.ts`，覆盖 `getBlockDocMap` 850 个块 ID 的 400 分块与 3 路并发控制、SQL 单引号防注入转义、查不到块时的优雅缺失、`getDocTitles` 首行标题截取、以及 `probeAssetRefs` 本地媒体三态判定（`present`/`missing`/`unknown`）。
- 存储启动坏槽位容错与不可变快照隔离闭环（P0 风险收口）：新增测试套件 `tests/store-startup-fault.spec.ts`，验证 `zipLoaded` 长度错位严格拦截、22 个持久化键的坏槽位故障隔离模拟、16 个关键 store 的 `normalize` 纯默认值兜底、`loadStore` TypedStore 异常回退、以及运行态修改对 `persisted*Snapshot` 磁盘基线的零污染隔离。
- 设置持久化生命周期与版本代次控制闭环（P0 风险收口）：新增测试套件 `tests/settings-persistence-lifecycle.spec.ts`，验证 1200ms 防抖合并、重载前强制冲刷落盘、单次磁盘失败安全回滚至持久化基线、以及连续并发请求下版本代次守卫（Mutation Version Guard）防止旧失败冲垮最新设置。
- 修复周历视图跨周测试的时间敏感性缺陷（固定测试系统时间锚点）。当前全量 182 文件、1476 项测试全部通过，TypeScript 与 Svelte-check 0 错误 0 警告，i18n 1874 键 985 处引用全对齐，主包 gzip 维持 56111 bytes（低于 55 KiB 门禁，余 209 bytes）。详见[导出记录](./docs/audits/2026-10-19-lvcards-export-integrity.md)、[元数据恢复记录](./docs/audits/2026-10-19-lvcards-metadata-restoration.md)、[菜单图标隔离记录](./docs/audits/2026-10-19-menu-icon-containment.md)、[内核契约记录](./docs/audits/2026-10-19-kernel-plugin-contract.md)、[响应校验统一记录](./docs/audits/2026-10-19-api-response-unification.md)、[通用API契约记录](./docs/audits/2026-10-19-siyuan-api-contracts.md)、[启动容错记录](./docs/audits/2026-10-19-store-startup-fault-tolerance.md)与[设置生命周期记录](./docs/audits/2026-10-19-settings-persistence-lifecycle.md)。

### 分享包导入完整性及迁移交互修复

- `.lvcards` 去重改为完整分页取 ID、分批读取原始 Markdown；页数/总数漂移、缺行或重复身份时停止导入。指纹保留代码缩进和硬换行，修复包内重复与同 ID 冲突误报；混合损坏条目整包拒绝，写入前复用统一题面/答案结构门禁。
- 分享包卡组名和 Obsidian 文件名确认摘要统一 HTML 转义。导入后校验一级块数量、根/父身份和严格正文对应关系；空目标 ID 或块错配不入组，保留文档并说明状态。
- 入组后完整回读目标卡组、逐个确认新块 ID 才报成功；回读失败/部分成功提示待核对，不自动重放写入。详见[导入记录](./docs/audits/2026-10-18-lvcards-import-integrity.md)。本轮无新增浏览器或真实宿主导入证据。

- 命令面板新增“导入与迁移”，支持按 Anki、Obsidian、`.lvcards`、文件格式、日志和备份检索，直达卡片导入与数据分组。返回全部设置保留草稿并聚焦搜索，普通设置与保存回调兼容。
- 设置支持按格式、导入和备份标签搜索，增加无结果反馈；四个文件入口改用原生按钮，日志/备份等控件补齐名称；焦点陷阱排除隐藏、inert 和禁用目标，修复活动控件隐藏后的反向 Tab。
- 修复窄屏原生文件输入撑宽设置面板，控件可收缩换行；Chrome 生产设置组件夹具在 320×568 暗色中文与 1280×800 亮色英文验证任务范围、搜索/恢复、草稿、按钮和布局。夹具无真实宿主写入，真实思源/Android/读屏与成功导入待验。
- 前轮快捷入口收口为 175 个测试文件、1310 项通过，Svelte 0 错误/0 警告，检查、构建与 smoke 通过；主包 gzip 56136 bytes，55 KiB 门禁余 184 bytes。详见[前轮记录](./docs/audits/2026-10-18-import-workflow.md)。以下命令面板修复统计保留为前轮切片证据；本节全部尚未发布。

- 修复空查询仅显示前 12 项命令的问题，高级模式末尾入口可直接到达；方向键选中项随列表滚动，空查询支持 Home/End 到首尾。
- 补齐输入与活动选项的可访问关系，保护文本编辑和组合输入；共享焦点陷阱在输入法候选期间不拦截 Escape/Tab。
- 优化窄屏长标签、提示换行与低高度布局；鼠标悬停不再触发列表跳滚。
- 合并命令面板的重复打开请求，活动面板保留查询并重新聚焦；失败可重试，卸载后的迟到结果不再弹窗，旧关闭回调不影响新面板。命令先关闭面板再打开目标，旧弹窗的延迟销毁回调不再抢走新焦点；宿主创建失败时清理已挂载组件。
- 修复开发模式误将挂载句柄传给 Svelte 卸载函数的问题，关闭时统一通过对应挂载器销毁实际组件。
- 命令装配移入 dialogs 按需分包，主包 gzip 为 55973 bytes，保持 55 KiB 门禁；新增生产工厂契约 smoke。
- 前轮生命周期收口为 173 个测试文件、1264 项通过，检查与生产构建通过；此前 Chrome 生产组件夹具三视口通过，生命周期轮新增入口与延迟宿主替身回归，真实思源宿主、Android 与读屏仍待验。详见[生命周期记录](./docs/audits/2026-10-18-palette-lifecycle.md)及[前轮交互记录](./docs/audits/2026-10-18-palette-interactions.md)。版本保持 v0.210.4，本节内容尚未发布。

## v0.210.4 2026-10-17 · 原生分享包（.lvcards）、触觉微震动与自定义卡面 CSS

本版本落地路线图 P1 原生分享包（.lvcards 单文件格式）导出与导入、P2 移动端触感微震动反馈、自定义卡面 CSS 样式注入，并将已实现的双向问答、代码块与清单题型正式毕业为已交付状态。

- 原生小驴闪卡分享包（.lvcards）：
  - 核心结构：遵循 lvcards.v1 单文件标准规范，封装卡组信息、卡片正文、题型、助记便签与推荐调度参数；
  - 导出通道：卡组仪表盘一键导出单文件分享包（.lvcards）；
  - 导入与自动去重：设置中心支持 .lvcards 文件导入，自动校验格式，按卡组归组并与已有卡片指纹比对，完全去重跳过重复卡，待新增卡片自动落盘为思源文档并加入复习卡组。
- 移动端触感微震动（Haptic Web Vibration API）：
  - 新增防御式触觉微震动引擎（`src/core/haptic.ts`），在翻面时触发 10ms 触控微脉冲，评分时触发轻触微震（遗忘触发双震确认），赋予触屏设备与 Android 客户端原生应用级别的敲击质感。
- 自定义卡面样式注入（Custom Card CSS）：
  - 设置中心外观分组支持输入自定义 CSS 规则，直接注入卡面作用域（`.lv-card-content`），并在设置页本地样例卡面中支持实时预览。
- 卡型目录毕业与卡组指标：
  - 将双向卡（bidi）、代码卡（code）、清单步骤卡（list）在卡型目录（`card-catalog.ts`）中正式标记为已交付（shipped）；
  - 卡组仪表盘增加近 7 天通过率（passRate7）指标分析，悬停可查看详细作答情况。
- 全量 167 个测试文件、1183 项测试全部通过，双语 i18n 1806 键完全对齐，严守 55 KiB 主包体积门禁红线（54.83 KiB）。

安装包与发布状态见 [GitHub Release](https://github.com/xiaolv-suite/siyuan-lv-cards/releases/tag/v0.210.4)。


## v0.210.3 2026-10-17 · 顶栏主页直达、复习全链路返回与闪卡生态体验升级

本版本彻底根治顶栏图标强行跳入复习页与复习空态不易返回的问题，全面吸纳各大闪卡工具与思源生态插件长板，实现多挖空序号化、双向卡、助记小纸条、番茄专注节律与全流程键盘/UI质感升级。

- 顶栏入口重塑：左键点击顶栏小驴闪卡图标默认 100% 直达闪卡主页面（Dashboard），在主屏从容查看决策状态机、打卡记录与卡组；并在设置中保留可选的「直接复习」开关。
- 复习全链路返回主页通道：在复习顶栏常驻「🏠 返回主页」按钮；在空队列卡片（“该范围没有到期的卡”）增加主操作「🏠 返回闪卡主页」与「+ 去制作新卡」；在隔离异常卡横幅直接增加「前往维护中心修复」一键直达通道，彻底消除幽闭卡死。
- 社区插件精华吸纳：
  - 汲取自 ZY / RemNote：卡面直接透出文档知识层级语境胶囊（`📚 笔记本 › 章节 › 标题`），点击一键平滑展开正文上下文；
  - 汲取自 sy-tomato：会话预算接入 25 分钟标准番茄专注周期，到点温和提示休息巩固；复习端 `··· 更多` 菜单提供就地移出卡组（`🚫 移出卡组`），安全退役不伤笔记正文；
  - 汲取自 sy-progressive：卡面助记小纸条（Notes to Future Self），打通思源原生块 `attrs.memo` 属性，按键 `m` 随时随地唤起，翻面静默提供 `[💡 助记便签]` 快捷通道，下次复习伴随答案高亮提示。
- 闪卡本体与题型创新：
  - 智能多挖空序号化（`［ 1: 回忆这里 ］`、`［ 2: 回忆这里 ］`），揭晓态带 `[1]`、`[2]` 微徽标对照，单空卡片保持极简；
  - 双向问答卡（A ↔ B）一键生成与逆向回忆模式（`reversed`）；
  - 卡面大图点击全屏原图聚焦预览（Image Lightbox Zoom），带暗色高斯磨砂玻璃背景与 Escape 键无障碍退出；
  - 列表步骤题（`ol/ul`）`::marker` 品牌紫加粗高亮与层级缩进；
  - 全面替换粗暴打击学习者的“烂卡”字眼，升级为“易混淆卡片（Leech）/ 难点卡”。
- 全局键盘与部件微质感闭环：
  - 卡片库：卡片行透出 `新`、`到期`、`⚠️ 遗忘次数` 状态微徽章，吸顶粘性批量操作浮动栏，搜索一键清空（`✕`）；
  - 卡片详情：学习历史分面升级为语义色彩徽章（`LvChip`）与作答耗时格式化，富媒体尺寸防撑破；
  - 快速制卡、标记符制卡、图片遮挡制作器、卡片编辑器、限时挑战与修卡演练全量接入 `Ctrl/Cmd+Enter` 快捷保存、`Escape` 安全退出与全平台（macOS `⌘↵` / Windows `Ctrl ↵`）自适应。
  - 全量 166 个测试文件、1178 项测试全部通过，双语 i18n 1802 键完全对齐，严守 55 KiB 主包体积门禁红线（54.83 KiB）。

安装包与发布状态见 [GitHub Release](https://github.com/xiaolv-suite/siyuan-lv-cards/releases/tag/v0.210.3)。


## v0.210.2 2026-10-17 · 官方 SDK 升级与依赖全量对齐

本版本对齐思源官方 SDK 1.2.9，完成全量工具链与核心依赖升级，并修复新版 SDK 严格类型契约下的类型兼容性。

- 依赖全面升级：升级并对齐思源官方 SDK `siyuan` 1.2.9，合入 `vite` 8.3.4、`@types/node` 26.6.5、`happy-dom` 21.0.3、`npm-run-all2` 9.0.3 以及 CI 流水线 `actions/setup-node` 7.1.0。
- SDK 类型与架构兼容：在 `src/index.ts` 中适配新版 SDK 的 `i18n` 声明类型，消除 `JSONValue` 与字符串赋值类型冲突；修复 `Custom` 模型上下文下的标签打开逻辑。
- 请求契约安全适配：在 `src/api/ai.ts` 和 `src/api/flashcardV2.ts` 中适配新版思源 generated API 请求路由签名，确保请求契约与内核一致。
- 复习与空库体验优化：专注复习顶栏常驻核心 5 键，将二级辅助工具折叠收纳进 `··· 更多` 气泡；首页空库增加“思源笔记即是闪卡”核心心智图文指引。

安装包与发布状态见 [GitHub Release](https://github.com/xiaolv-suite/siyuan-lv-cards/releases/tag/v0.210.2)。


## v0.210.1 2026-10-16 · UI 交互修复与发布前回归

本版本整理近期 UI 优化，并修复复习、制卡、卡片库与维护之间的异步和导航边界。

- 复习新增本场偏好、疑问和安全暂停的操作分层；修复弹窗/菜单快捷键与点击穿透、暂停后隐藏页继续响应、撤销状态残留、切卡旧计时器和迟到上下文。
- 制卡修复材料重复、空态不能粘贴、历史版本恢复错卡、删卡索引串位、重复键崩溃、入库与编辑并发及新建组失败重试重复建组；隐藏手工工作台停止响应提交快捷键。
- 统一卡面修复图片地址转义、代码字面文本和含等号公式的答案遮蔽；收紧无效题面检查，并保护合法代码、术语和公式。
- 首页接入今日行动建议；修复统计失败后的无限重试和旧响应覆盖，未知/失败到期状态阻止正式复习。修复详情异步串卡、管理器确认目标变化与简洁模式维护导航。
- 批修记录持久化并支持冲突保护下的撤销；应用与撤销串行，日志保存失败时补偿卡片变更，加载时过滤损坏记录。隐私说明披露最近 5 批记录中的卡片文本。
- AI 来源对照仅表示原文字词匹配；近似重叠不再冒充明确支持，不能作为知识事实核验。

验证记录及尚待完成的宿主矩阵见 test-evidence/release-v0.210.1.md。安装包与发布状态见 [GitHub Release](https://github.com/xiaolv-suite/siyuan-lv-cards/releases/tag/v0.210.1)。


## v0.210.0 2026-10-16 · 闪卡质量门禁与维护闭环

本版本统一制卡、导入、编辑与复习呈现的结构规则，并将问题卡的回源、人工审阅、修复和来源健康历史接入维护页。结构校验不等于知识事实审核，接受卡片前仍需人工核对。

新增：

- 快速制卡、AI、标记扫描、Anki/Obsidian 导入、示例及图片遮挡在入组前共用结构门禁；普通卡需要答案标记与可见题面，遮挡卡需要题面图片和有效遮挡区域。编辑保存使用相同规则。
- AI 候选在接受前补充高置信质量检查，减少空泛、无题面或答案泄漏的候选直接入库；Anki/Obsidian 导入加强内容清洗、兼容性和失败提示。
- 维护页支持媒体缺失与未判定状态、近似重复并排审阅和人工保留/忽略决定、定点编辑后回扫，以及批量修复草稿、差异预览、确认和失败补偿。
- 来源指纹与问题记录持久化；独立健康历史按卡片显示原因、发现和处理时间，确认当前来源或移出卡组后仍保留历史。
- 自定义 AI 端点增加 OpenAI、DeepSeek、Ollama、LM Studio 预设，补充本地模型参考配置。

优化与修复：

- 复习对结构无效的旧卡仅作本场隔离并提供修复重查入口，不修改其 due、评分或复习日志；维护扫描也能识别纯答案旧卡。
- 修复同卡多个来源问题造成的重复渲染键崩溃；来源确认不再把缺失或未知媒体误标为恢复。
- 批修失败时恢复精确的旧快照，旧无效卡不再被正常编辑门禁阻断补偿；正常编辑仍需通过门禁。快照仅用于事务内存中的失败补偿，不是长期备份，成功批次仍无页面撤销入口。
- 修复按需模块加载失败后的缓存清理与重试边界；维护计算通过现有分包按需加载，保持主入口既有 55 KiB gzip 预算。
- 改进复习手势与代码块、表格、可滚动内容的边界，以及移动端软键盘引起的视口变化；拆出快捷键、音频和统计报告服务，便于持续回归。

验证：157 个测试文件、1070 项测试通过；`pnpm check` 通过，Svelte 0 错误/0 警告；i18n 1679 个中英文叶键与 856 处源码引用通过；干净生产构建、发布包 smoke（含生产 IIFE 的坏卡批修补偿）、文档事实与治理检查通过，主包 gzip 约 54 KiB，低于 55 KiB 预算。GitHub 发布状态以 Release 为准。真实思源 Chrome 的普通/挖空/遮挡/导入/旧坏卡五路径、Android 宿主与真实模型异常矩阵仍待验收；来源历史不记录每次来源编辑。

## v0.209.5 2026-10-14 · 设置弹窗滚动与分包挂载修复

本版本修复完整设置在长内容场景下无法向下滚动的问题，并收口独立对话框组件在工作台中的挂载和销毁边界。

新增：

- 增加完整设置弹窗的视口高度约束、唯一滚动容器和窄屏滚动边界。
- 增加工作台快速制卡与 AI 制卡分包挂载/销毁回归覆盖。

优化：

- 设置弹窗在保存、关闭和小窗口尺寸下保持稳定的 flex 布局，避免内容被裁切。

修复：

- 修复独立 dialogs 分包组件直接由宿主运行时渲染导致的 `effect_orphan` 风险。
- 修复完整设置内容超出视口后无法继续下滑的问题。

验证：`pnpm check`、全量 857 项测试、生产构建和发布包 smoke 均通过；真实 Android 宿主矩阵仍待单独验收。

## v0.209.4 2026-10-14 · 视觉令牌收敛与发布质量

本版本把颜色、字号、行高、间距、圆角、层级和动效统一到语义令牌，降低跨页面修改和主题切换的漂移风险。

新增：

- 增加 `--lv-*` 语义令牌、组件变体规范、原型/生产主题边界说明，以及 `check:tokens` 审计和 `migrate:tokens` 迁移脚本。
- 增加页面/指标字号特例、阅读宽行高、卡片最大宽度、reduced-motion 时长和宿主主题颜色别名。

优化：

- 样式统一复用颜色、排版、间距、圆角、阴影、层级和动效变量；局部 `LvSection` 只保留操作区布局补充。
- 颜色在组件、SVG、行内样式和生产主题映射中统一使用 `--lv-color-*` 语义名。
- 令牌覆盖率由 56.7%（691/1219）提升到 92.6%（1129/1219）；字号、字重、行高、gap、z-index 达到 100%。

修复：

- 修正迁移脚本误处理伪类、Svelte `global` 属性和行内模板的问题，保留原有视觉值与特殊几何。
- 补齐 `--lv-lh-reading-loose` 及 9/14/15/17/19/22/29px 精确字号令牌，避免迁移后发生尺寸跳变。

验证：`pnpm check`、`pnpm test`（856 项）、i18n、文档事实、治理、生产构建和发布包 smoke 均通过；真实 Android 宿主矩阵仍待单独验收。

## v0.209.3 2026-10-10 · 体验与稳定性补丁

本版本把 AI 制卡、复习降级、跨页面同步和管理器操作中的异常路径补成可理解、可恢复的用户流程。

新增：

- AI 制卡异常分类与安全提示：覆盖取消、超时、401、限流、配额不足、服务器错误、网络失败和敏感材料外发提醒。
- 新手引导与内置示例卡，遗忘卡约 3 分钟短期循环，管理器方向键/Enter/Delete 键盘操作。

优化：

- 选择题在干扰项不足时自动降为二选/三选，无法生成可靠干扰项时回退自由回忆并移除占位选项。
- 评分、总览、管理器和角标通过事件同步，多窗口数据变化自动刷新；补齐加载、等待、空态、错误、重试和禁用反馈。

修复：

- 旧 AI 响应、预算超限、短期循环队列、撤销、范围切换和页面销毁之间的状态残留与计时器泄漏。

验证：`pnpm check`、747 项单元测试、i18n、文档事实、治理、生产构建与发布包 smoke 均通过；真实 Android 宿主矩阵仍待单独验收。

## v0.209.2 2026-10-10 · 集市清单兼容修订

本版本只调整插件清单 metadata，不改变插件功能。

优化：通过集市清单校验

- `kernels` 保留明确支持的平台列表，移除与具体平台冲突的 `all`。
- 删除未配置的赞助占位字段，避免把模板链接发布到集市。

## v0.209.1 2026-10-10 · 入口状态与失败反馈收口

本版本聚焦发布前交互核对：让加载、保存、批量操作和重试过程中的状态更明确，失败时保留可恢复路径。

新增：补齐页面状态反馈

- 总览刷新失败时保留最近一次成功数据，并标注数据时间。
- 卡组首次加载、笔记本读取、维护扫描、配对挑战和收件箱制卡失败均提供可见错误或重试入口；首次创建卡组有明确空态提示。
- AI 制卡的笔记本来源显示加载、无可用笔记本和失败状态；复习空队列可直接切换范围。

优化：按钮与操作状态

- 复习评分、撤销、跳过和暂停，以及设置保存、卡组选择和管理器批量操作会在处理中禁用重复提交。
- AnkiConnect 连通性检查使用当前未保存的地址与密钥，并单独显示检查状态；设置保存失败时保留面板并显示原因。
- 内测说明、插件入口和 R52/R53 原型边界说明与当前行为对齐。

修复：退出与拒绝操作的副作用

- 挑战模式加载卡面时退出，迟到的请求不再继续加载或启动计时器。
- 拒绝重复添加时先完成确认，不会提前创建用户输入的新卡组。
- 补齐新增设置反馈的中英文 i18n 文案。

验证：`pnpm check`、`pnpm test -- --run`、i18n、治理、文档事实、生产构建与发布包 smoke 均通过；真实 Android 宿主矩阵仍待单独验收。

## v0.209.0 2026-10-09 · 十二轮全方位审计：16 项缺陷修复

本轮基于十二轮全方位审计（隔离靶场无头内核 + 浏览器实测 + 本地 mock AI 端点），修复 16 项缺陷并统一术语表述；新增合并去重与事务响应兼容等 6 项单测，全量 730 项测试通过。

修复：3.8.x 内核建卡链路失效（P0）
（`/api/block/insertBlock` 事务响应结构变化导致快速制卡、示例卡、标记制卡报「制卡失败」；appendBlock 已兼容新旧两种事务响应形态。）

修复：挖空卡问题态泄露答案（P0）
（内核将 `==挖空==` 渲染为 `span[data-type=mark]`，遮罩 CSS 与打字判分/配对/干扰项仅匹配 `<mark>` 导致全部失效；统一 MARK_SELECTOR 并修复全部调用点。）

修复：「全部范围」到期队列恒为空（P0）
（内核 3.8.6 全局到期查询不返回卡片，角标/总览/复习全部归零；getRiffDueCards 空卡组口径改为遍历卡组逐组查询并以 mergeDeckDueResults 合并去重，新增 4 项单测。）

修复：注册知识对象后闪卡中心崩溃（P1）
（ko-panel 13 处 i18n 键路径笔误 `t.ko.*` → `t.review.ko.*`，注册后不再整页报错；测试 mock 同步真实结构。）

修复：AI 安全阀在思源内置 AI 模式不可见（P1）
（安全阀行被误包进「自定义端点」条件块，默认模式无法紧急停用/撤销同意；已移出并常显。）

修复：模型拒答文本泄漏原始 JSON 异常（P2）
（非 JSON 拒答回复现在与空响应同走「格式失败」拒答呈现：可读原因 + 重试一次 + 手工制卡建议。）

修复：遗忘后错误原因标注不显示（P1，双重缺陷）
（置位时序被 next() 重置 + errReasons 键路径笔误 `t.errReasons` → `t.review.ko.errReasons`；七类原因 chips 实测可用并持久化。）

修复：修改练习设置后已打开的复习面板不生效（P1）
（出题形态与打字/选择开关保存后通过 settings-changed 信号即时生效，无需重开面板。）

修复：画像应用确认框名称显示 undefined（P2）
（画像名取键 `t.modules[preset.nameKey]` → `t[preset.nameKey]`。）

优化与表述：
* 问题态快捷键对齐：x 跳过 / f 快速改期 / s 暂停现在在问题态同样可用（与工具行按钮一致）。
* i18n 引用完整性纳入 check-i18n 门禁：706 处代码引用全量校验，杜绝「键数对齐但引用缺失」类缺陷复发。
* 示例卡答案改为挖空语法（问题态不再泄露）；空卡面显示占位文案而非裸块 ID；术语统一（遗忘/回忆）。
* AI 审核步与敏感词/来源禁止/降级阶梯全链实测（本地 mock OpenAI 端点）。

验证：`pnpm check` 0 errors/0 warnings、730 项单元测试、隔离内核 E2E 18/18、发布包 smoke 全部通过。

## v0.208.1 2026-10-08 · 按钮回调与版本操作修复

* 修复闪卡中心「AI 制卡向导」与「修卡演练」按钮回调误用页签 `this` 的问题，两个入口现在可以正常打开。
* 修复卡片详情中保存内容、查看版本和接受版本回调误用页签状态的问题，相关操作现在正确写入插件状态与持久化存储。
* 全面审计页签与界面按钮回调，补充回归检查，避免插件实例方法或状态再次绑定到错误的 `this`。
* 对话框懒加载失败、标记符制卡失败和卡片内容对比加载失败现在都会给出可见反馈；命令面板输入框的键盘事件也只执行一次。
* 同步内测版名称、README 内测说明及小驴系列插件索引。
* 验证：`pnpm check`、726 项测试、文档事实、治理校验、生产构建与发布包 smoke 全部通过。

## v0.208.0 2026-10-08 · Starline R53 UI 全面提质

围绕「与原型的观感差距」开展的九轮系统化 UI 提质，覆盖结构、表皮、动线、竞品融合、数据可视化、响应式与复习核心流程七个层面（逐轮真机截图对照验证，`docs/39` 方法论）：

* **页头体系重构**：闪卡中心外壳只保留页签栏，页头语义（眉线 + 题 + 副题 + 动作组）下放到各子页统一承载，消除一屏双题；眉线（TODAY、OBJECT/MAINTAIN 等）按原型口径补齐六个页面。
* **总览重排**：统计瓦片收敛为 4 块（零值降透明、空走势不渲染），覆盖调试块收纳为深度统计明细，hero 去重复日期，能力分布/错误原因分布中文化且全零隐藏。
* **复习流程精修**：HUD 进度条按评分语义分段（遗忘段警示色）、范围下拉归一化（持久化空串不再显示空白）、目的章中性化、卡面热区幽灵文字隐藏、空队列显示专用空态而非 0 值完成庆祝。
* **对话框质感**：命令面板改无镶板浮层（r20 + 顶部展开入场），全部插件对话框统一 scale-in 入场、细滚动条与按压反馈；AI 向导铺满工作台宽度、材料空态组件化；快速制卡满宽 + kbd 分离。
* **数据可视化**：热力图空格可见度修复并支持横向滚动，学习日历限宽保持紧凑密度，考试计划进度条改为真实时程口径。
* **390px 窄屏**：管理器行文字截断、考试动作行换行、目标卡窄屏堆叠等全景修复，移动模拟真机截图逐页背书。
* **微动效纪律**：数字滚动、切页淡入、深度统计入场、hero 目标环首绘、复习切卡淡入、完成页数字滚动——全部三档时长与统一缓动，`prefers-reduced-motion` 全覆盖。
* **品牌与文档**：图标升级为 1024px 高清源（渐变纵深 + 内缘发丝环 + 橙点高光），集市预览图重绘，README 增加界面速览与中英双版本基线更新。
* 无障碍与语义同步收口：LvPage 页头重构、LvEmpty 动作钮、翻面热区、读屏属性随组件更新；724 个单元测试、类型检查、生产构建、发布包 smoke 和治理门禁全部通过。

## v0.207.7 2026-10-07 · 开发依赖安全收口

* 用 `npm-run-all2` 替换旧版 `npm-run-all`，消除其旧版 `shell-quote`、`semver` 和 `hosted-git-info` 传递依赖风险。
* 升级 Svelte 5.57.2，并通过 pnpm overrides 固定 `devalue` 5.9.3、`source-map-js` 1.2.2、`shell-quote` 1.12.0 和 `brace-expansion` 5.0.12。
* 完整开发依赖审计从 1 个 critical、11 个 high 降至仅剩 `braces` 3.0.3（[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)）；该风险来自 `fast-glob`/`chokidar` 上游，当前没有已发布修复版本。生产依赖审计为 0 漏洞。
* 724 个测试、类型检查、生产构建、发布包 smoke 和治理门禁全部通过。

## v0.207.6 2026-10-07 · 只读月历语义修复

* 移除只读学习月历不完整的 `role="grid"` 声明，保留月份标签，避免读屏器把展示内容识别成可操作网格。
* 增加月历结构回归测试；724 个测试、类型检查、生产构建、发布包 smoke 和治理门禁全部通过。

## v0.207.5 2026-10-07 · 开发工具链补丁升级

* 升级 `livereload` 0.10.3，保持开发时热重载服务器在当前版本。
* 本版不改变插件运行时功能；重新执行 723/723 单元测试、`pnpm check`、文档事实与治理门禁、生产构建和发布包 smoke，结果全部通过。

## v0.207.4 2026-10-07 · 构建工具链补丁升级

* 升级 `@sveltejs/vite-plugin-svelte` 7.3.1、`js-yaml` 5.4.3 和 Vite 8.3.3，保持构建工具链在当前补丁版本。
* 重新执行 723/723 单元测试、`pnpm check`、文档事实与治理门禁、生产构建和发布包 smoke，结果全部通过。

## v0.207.3 2026-10-07 · Anki 压缩包宿主兼容性修复与发布门禁强化

* 修复 Anki `.apkg/.colpkg` 的 deflate ZIP 解压：移除静态 `node:zlib` 导入，改为桌面宿主动态加载，避免浏览器构建把模块替换为空对象后在真实导入时崩溃。
* Anki 设置入口现在同时检查 `node:sqlite.DatabaseSync` 与 `node:zlib.inflateRawSync`；不完整宿主会在选择文件前显示明确原因。
* 增加 deflate/无 Node 宿主回归测试，并把完整测试、文档事实、治理校验和 tag 来源校验纳入 Release 工作流。
* 更新真机验收清单：明确 v0.207.3 当前基线、Android 真机证据边界和可复制的环境记录模板。

验证：Anki 聚焦测试、`pnpm check`、生产构建与发布包 smoke 通过；完整测试将由 tag Release 工作流再次执行，隔离 E2E 已在本地/CI 之前通过。
## v0.207.2 2026-10-07 · Anki 宿主能力门禁与构建兼容性收口

* 设置页 Anki 本地导入入口按宿主 `node:sqlite` 能力显示：不支持的移动端、浏览器或旧桌面宿主直接给出原因，不再暴露不可用的文件选择器；实际导入路径继续保留运行时能力校验。
* 新增 Anki 宿主探测测试，覆盖无 Node `require`、缺少 `DatabaseSync` 和可用 `DatabaseSync` 三种情况。
* Vite 8 单文件配置迁移到 `output.codeSplitting: false`，消除已废弃选项警告；Anki 浏览器路径触发的 `node:zlib` externalized 警告仍作为宿主能力待办记录。
* 本地验证：720/720 测试、`pnpm check`、文档事实门禁、治理校验、生产构建和隔离 E2E 18/18 全部通过；主包 gzip 52.88KB。
## v0.207.1 2026-10-07 · 依赖升级与发布治理收口

* 升级 `@types/node` 26.6.4、`js-yaml` 5.4.2、Svelte 5.57.1、Sass 1.105.1、Vite 8.3.2（含 Rolldown/PostCSS 依赖），逐项通过主分支 CI。
* 新增当前文档事实门禁 `pnpm check:docs-facts`，防止版本、快捷键、日历实现状态和 AI 降级说明回退。
* GitHub 治理完善：Dependabot、安全修复、私密漏洞报告、CODEOWNERS、分支保护和发布包校验保持生效。
* 本地验证：716/716 测试、`pnpm check`、i18n 1248 key、治理校验、Vite 多 target 构建和发布包 smoke 全部通过。
## v0.207.0 2026-10-07 · R53 设计体系 + P0/P1 全落地（里程碑发版）

> 本版是一个里程碑：docs/41 竞品调研与定位锐化 → docs/42 Starline R53 设计规范 → starline-r53 全页原型 → P0/P1 六个功能全部落地 + 三轮真机走查修复。详细分解见以下各版记录。

### 设计体系
* Starline R53：7 条设计原则 / 令牌表 / 13 组件解剖 / 14 面逐页规格（docs/42）；starline-r53.html 可交互原型（14 面，亮暗/390px，状态样例）
* 竞品调研与定位锐化（docs/41）：Anki/RemNote/Quizlet/Mochi/Obsidian-SR/AI 制卡/思源生态 → 三差异点（可回源/可审计 AI/本地优先）→ P0/P1/P2 路线图

### P0 新功能
* ⌘K 命令面板（v0.206.3）：动作+导航两分组，Ctrl+K 键盘直达
* 学习日历与负载预测（v0.206.4）：过去热力/未来负载月历 + 14 天预测条

### P1 新功能
* 每周学习报告（v0.206.7）：设置开启后自动写入「小驴闪卡/学习周报」文档
* 卡组仪表盘（v0.206.8）：按卡组聚合的排行表（到期/保持率/顽固卡）
* 分享包（v0.206.9）：整卡组导出为 Obsidian SR markdown（可分享可回导）

### R53 视觉落地
* 真机比对基建（v0.206.1）：隔离靶场 + CDP 替代静态 shim，消除按钮语义误判
* 复习工具栏三行重排 / 完成页面板化 / 按钮语义基线（作用域中性化 + ghost）/ 卡片白底 / 考试页主动作唯一化
* 管理器 R53 化（v0.206.12）：搜索独立页头、工具行拆出、分页底部、行卡对齐、详情抽屉三处崩溃修复
* 移动端 390px 走查（v0.206.10）：页头纵向堆叠、卡片内容横滚、页签横滚不断字

### 基础修复
* API 层块去重（v0.206.11）：getRiffCards 系列统一按块 ID 去重，防 Svelte each 重复键崩溃
* 顶栏页签去重（v0.206.5）：getAllTabs 检测同型页签激活复用
* 详情抽屉三处崩溃修复（v0.206.12）：versionsOf 防御 / t.ko 路径 / t.relations Proxy 视图

### 统计
* 716 单测 / 0 svelte-check 错误 / i18n 1248 键中英对齐；390px 窄屏结构化走查记录完成，Android 思源真机完整矩阵待执行
* Vite 报告主包 gzip ≈52.89KB（治理门禁按 KiB 计约 51KB，≤55KB）；hub/review/dialogs chunk 分别约 61.24/36.52/58.98KB，按需加载


## v0.206.12 2026-10-07 · 详情抽屉三处崩溃修复 + R53 视觉对齐（真机走查）

* 详情抽屉打开即崩（真机走查发现，三处叠加）：
  1. versionsOf 对未初始化 contentVersions 不设防 → 加 ?. 防御（面板降级为无版本）
  2. t.ko.register 顶层不存在（ko 组在 review 下，v0.124 起的潜伏笔误）→ 读 review.ko，顶层回落
  3. t.relations.empty 同源组路径漂移（relations 在 review 下）→ manager 传给 CardDetail 的 t 用 Proxy 视图矫正组路径（面板内 34 处直读不改）
* 管理器 R53 化（同轮）：搜索独立页头 actions；排序/筛选/保存拆为独立工具行；分页移至列表底部居中；行卡去旧渐变与静态阴影（对齐 R53 .row）
* 真机验证：详情抽屉四分面（内容/来源/学习记录/问题）正常渲染， segmented 切换正常；管理器工具行/列表/分页布局正确


## v0.206.11 2026-10-07 · API 层块去重（根因修复：each_key_duplicate 全消费者防护）

* 根因修复：维护页签同源崩溃（上一轮只修了 manager 消费者）——getRiffCards/getTreeRiffCards/getNotebookRiffCards 三个 API 在 riff.ts 层统一按块 ID 去重，所有下游消费者（manager/maintenance/dashboard/palette/分享包导出）自动拿到无重复数据
* 修复方式上提：v0.206.1 的 manager.svelte 消费端去重保留（belt-and-suspenders），新增的 API 层去重覆盖所有现在与未来的消费者
* 全 7 页签真机回归：无 Svelte 边界错误


## v0.206.10 2026-10-07 · P2 移动端（390px）走查与修复

* 窄屏走查（docs/41 P2 · CDP 390×844 实测）：发现三处溢出/断字并修复——
  1. .lv-pagehead 无 flex-wrap：页头题+按钮组在 390px 挤成竖排文字 → 窄屏改纵向堆叠（题 22px）
  2. .lv-card2 子元素（热力图/日历/表格）撑破卡片 → 窄屏加 min-width:0 + overflow-x:auto（宽内容卡片内横滚）
  3. .lv-tab 文字竖排断字（「制卡工作台」四个字竖着排）→ 窄屏加 white-space:nowrap + 容器 overflow-x:auto + 隐藏滚动条
* 修复后 390px 回归：pageOverflow=false，页头/卡片/页签均无横向溢出；宽内容在卡片内可滑动查看
* 走查范围：总览（目标环/统计走势/热力图/学习日历/卡组仪表盘表格）/命令面板/页签导航


## v0.206.9 2026-10-07 · 分享包：整卡组导出为 Obsidian SR markdown（P1 落地）

* 卡组仪表盘每行新增「导出」：整卡组（分页拉全量，上限 20 页）导出为 Obsidian SR 格式 .md——每行「问 :: 答 #flashcards/<卡组名>」，可用本插件导入器原样回导（同名卡组映射 + 指纹幂等），与 Obsidian 用户互通
* 复用 v0.204 的 srExportLine/composeSrExport 往返管线（qa/挖空自动分型有既有测试）；空卡组 toast 提示；导出中禁点
* i18n +3 键（dashboard.ddShare*，zh/en 对齐 1245）


## v0.206.8 2026-10-07 · 卡组仪表盘（P1 落地）

* 卡组仪表盘（docs/41 P1 · docs/42 深度统计区）：总览深度统计新增按卡组聚合的排行表——今日到期/新卡（内核实时，逐卡组 getRiffDueCards，上限 12 组按规模取前）、近 7 天复习/遗忘、保持率（近 30 天，样本 <8 如实标未知）、顽固卡（窗口内遗忘 ≥3 次的卡，近似口径页脚注明）
* 实现：core/deck-dashboard.ts 纯逻辑（窗口聚合/保持率样本门槛/顽固卡计数/排行，+5 单测）；数据全部来自本地 revlog（条目自带 deckID）与内核实时 due，无新增存储
* i18n +10 键（dashboard.dd*，zh/en 对齐 1242）


## v0.206.7 2026-10-07 · 每周学习报告（P1 落地）

* 周报（docs/41 P1）：设置开启后，每周首次加载自动把上周复盘写入「小驴闪卡/学习周报/<上周一> ~ <上周日>」文档——静默写入不自动打开（区别于手动报告的打开回显）；幂等键（上周一 ISO）存设置，失败不推进（下周随本周一起补）
* 内容口径（docs/28 数据边界）：正式复习（对比上周）、新卡、遗忘、连击、保持率（成熟卡口径，样本不足标「未知」）；全部来自本地复习日志（内核调度），页脚注明边界
* 实现：core/weekly-report.ts 纯逻辑（mondayOf/decide 幂等键/排版，+7 单测）+ 复用 AR-5 写入管线与 targetNotebook；设置开关（默认关闭——写文档属副作用，opt-in）
* i18n +12 键（settings.weeklyReport*/weeklyReport.*，zh/en 对齐 1232）


## v0.206.5 2026-10-07 · 中心/复习页签去重（UX 修复）+ 暗色与窄屏收尾

* 页签去重（docs/40 UX 待办收敛）：连点顶栏/命令面板反复入此前会堆出多个中心页签（真机复现 hubCount=2）——openTabOf 改经 getAllTabs 检测同型页签：已存在则激活复用，中心子页经 lv-switch-tab 事件就地切换（hub 根元素监听，复用 onTabChange 持久化路径）；带 scope/cram 的复习定点打开保持新开（有意进入特定状态）
* 真机回归：顶栏双击 → 单一中心页签；命令面板「考试」→ 激活既有中心并切到考试子页

## v0.206.4 2026-10-07 · T14 学习日历与负载预测（P0 第二个新功能落地）

* 学习日历（docs/41 P0 · docs/42 §3.11/§4 T14）：总览深度统计区新增「学习日历」——月历过去按复习热力着色（1-3 档）、未来按到期负载着色、今日描边；下挂未来 14 天到期预测条（峰值 ≥18 高亮）；页脚如实标注覆盖面（参与统计 x/y 张，缺 due 不计入）
* 数据口径（ADR-3 不变）：预测只读——复习卡按内核 riff due 落日（今天的积压计入今天、窗口外计 laterCount），新卡按每日新卡上限摊入，不改任何卡的到期；分页拉全量（上限 20 页 ×100），core/forecast.ts 纯逻辑 +10 单测（落日/积压/摊新/跳过/月历格子）
* 平峰建议（原型 T14 的「采用建议」）与统计瓦片 delta 留待后续：需要改期写入与历史口径，本轮只交付只读预测
* i18n +10 键（calTitle/calSub/calMonth/calFew/calMany/calNote/calForecastTitle/calEmpty/calCoverage/calSkipped，zh/en 对齐 1220）；真机验证：种子到期分散数据（今天×2/+1 天×2/+5 天×1）→ 月历负载着色与预测条逐日吻合

## v0.206.3 2026-10-07 · T13 ⌘K 命令面板（P0 首个新功能落地）

* 命令面板（docs/41 P0 · docs/42 §3.10/T13）：Ctrl+K 全局唤起，动作 + 导航两分组一框直达——开始复习/AI 制卡/快速制卡/修卡演练/设置 + 中心 7 页签（收件箱/考试/维护随模块开关与界面模式收敛，不做隐藏入口的命令）；↑↓ 选择、Enter 执行、Esc 关闭、悬停即选中
* 实现：core/palette.ts 纯逻辑（折叠匹配/分组聚合/limit，+6 单测）+ LvPalette.svelte 展示组件（dialogs chunk 注册，焦点陷阱/Esc 归还走 svelteDialog 既有管线）；命令经 addCommand(hotkey Ctrl+K) 注册
* i18n +6 键（cmdPalette/palettePlaceholder/paletteEmpty/paletteFoot/paletteGroupActions/paletteGroupNav，zh/en 对齐 1210）
* 门禁：668+6 测试全绿；真机验证见 docs/40 R53 落地记录

## v0.206.2 2026-10-07 · R53 设计语言落地第一批（hero 目标环 / 统计走势）+ 原型 R53 与设计规范

* 设计体系升级：竞品调研（Anki/RemNote/Quizlet/Mochi/Obsidian-SR/AI 制卡工具/思源生态）→ 定位锐化（docs/41：可回源 + 可审计 AI + 本地优先三差异点）→ 新功能路线图（P0 学习日历与负载预测、⌘K 命令面板；P1 分享包/周报/卡组仪表盘）→ docs/42「Starline R53」完整设计规范（7 原则 / 令牌表 / 13 组件解剖与状态矩阵 / 14 面逐页规格 / 验收清单）
* 全新原型 `docs/prototypes/starline-r53.html`（14 面 = 12 现状 + 2 规划）：hero 现场卡 + 今日目标环 + 带走势的统计瓦片、沉浸复习列、三栏制卡审计链、学习日历（过去热力/未来负载/平峰建议）、命令面板、管理器到期 chip 与 checkbox、六类样例状态；`#面名` / `?t=dark` / `?state=` 直达，亮暗/390px 全过；R52 原型保留作历史稿
* 真机落地第一批（视觉，数据全部既有真实口径）：总览 hero 右侧「今日目标环」（无每日目标时不渲染）；「今日已学」瓦片新增近 7 天正式复习走势 sparkline（LvStat 新 spark prop，只喂真实数据）；hero 底升级 135° 洗色渐变；i18n +1 键（heroRingLabel，zh/en 对齐 1204）
* 明确不做：统计瓦片到期/新卡走势（内核无历史口径，不造数据）；管理器行常显到期 chip（到期清单仅在切「今日到期」过滤时拉取，常显需数据决策，记 docs/40 待办）

## v0.206.1 2026-10-07 · UI 精品化：真机截图比对轮（工具栏/完成页/按钮语义/崩溃修复）+ 原型 v1.3

* 真机比对基建升级：此前截图比对基于 design/preview.html shim，其 `.b3-button` shim 为白底，而思源宿主 `.b3-button` 基类是实心主色——上一轮"已收敛"的界面在真机上仍是大面积实心蓝。本轮起改用隔离靶场（e2e 同款内核 + 浏览器自动化）直截真机渲染
* 修复管理页崩溃：同一块同时属于内置卡组与自定义卡组时 `getRiffCards` 返回重复块 ID，Svelte 5 each 重复键抛错整页被错误边界隔离（manager.svelte 按块 ID 去重，真机可复现的潜在 bug）
* 复习工具栏重排（R52 .study 口径）：20+ 元素单行互压（按钮被压到 32×20px 中文竖排）→ 三行结构——①REVIEW/范围 eyebrow + 状态 chip + 进度 ②进度条独占一行 ③范围/目的控制 + 工具按钮；原始 deckID 不再直接展示（eyebrow 显示卡组名，退回所选范围文案）
* 按钮语义基线：新增作用域规则（.lv-page/.lv-hub/.lv-dialog/.lv-peek-body 内裸 .b3-button 一律回白面中性）+ .lv-btn-ghost（R52 button.ghost）；主动作显式挂 .lv-btn-primary；插件对话框挂 .lv-dialog 作用域（dialog.ts）。复习工具栏 9 个实心蓝按钮、考试页 6 个、完成页收工原因 5 个全部归位中性
* 完成页 T07 面板化（R52 results 面）：裸居中文字堆 + 白圈渐变失效徽章 + 💪🎉📦🔥💡 表情串 → 单面板（check 软绿徽 + 三列大数字统计 + notice + ghost 收工原因 + NEXT 软面板 + 右对齐动作）；新增 i18n 3 键（sessionTime/doneConfirm/skipNotRated，zh/en 对齐 1203）
* 考试页（新功能面首次进视觉核对）：主动作唯一化（开始今日应学=primary，新建考试计划=outline，行内操作=ghost）；卡片白底化（--lv-surface-grad 泛蓝底全面撤位，R52 .panel 纯面 + 1px 派生描边）
* 原型稿 starline-r52.html 升 v1.3：中心页签 3 → 7（总览/管理/制卡/目标/收件箱/考试/维护，对齐真机 hub）；新增 T11 考试冲刺、T12 数据与备份（自动备份行/恢复差异警告/Obsidian SR 迁入卡组映射与指纹幂等/导出边界说明）两个任务面；设置面增「数据与备份」行入口；今日面页头增考试倒计时入口
* 版本号 0.206.0 → 0.206.1（chunk URL 带 ?v= 版本号，顺带解决开发期 chunk HTTP 缓存不刷新）

## v0.206.0 2026-10-06 · UI 精品化：R52 原型残差收敛轮（截图比对驱动）

* 截图比对基建：Edge headless 对 docs/prototypes/starline-r52.html（十任务原型）与 design/preview.html（dist 样式核对台）逐页截图比对——本轮收敛七项「原型 vs 现状」残差；截图产物在 gitignore 的 design/shots/，不进发布包
* 中心页签改 R52 .app-tabs 形态：胶囊分段 → 文字 tab + 2px 主色底线（LvTabs 全局样式，键盘模型不动）
* 评分条白面中性化（R52 .rating）：彩色软底（红/黄/蓝）→ 白面 1px 描边 + ink 标签 + muted 间隔——主色只留主操作，克制用色口径对齐原型
* 统计数字去渐变（R52 .stat .num）：主色渐变文字 → ink 实色 29px/650/-.035em（数字承担信息不抢注意力）；stat 卡 19/20 内距 + radius 12（嵌套外大内小）
* 卡片扁平化（R52 .panel）：去静态阴影与发丝高光，保留 1px 派生描边 + hover 升起（背景分层靠明度差与描边，不靠阴影铺）
* T08 待处理行加 R52 .row 分隔线（16px 行距 + 发丝线、末行无线）；hub 页头 eyebrow 改 TODAY/日期语义（R52 .page-head 口径）
* 核对台 design/preview.html 同步 shim（评分条/页头/清理旧评分样例），保证后续核对不失真；665 测试不动（纯样式），主包 ≤55KB

## v0.205.0 2026-10-06 · AR-4 离线部分：样例创建幂等加固（E 批 6/6 收官）

* 命令面板「示例工作区」：防重入锁 + 文档已有示例块（content LIKE '示例 %'）跳过重复创建——重试/重复点击不再堆重复示例卡（此前每次点击都追加一整套 5 张样例）
* 引导流程「创建示例卡」：卡组按名复用（此前每次调用 createRiffDeck 新建——失败重试会堆「示例卡组」同名组）+ 文档已有块跳过追加
* E 批至此 6/6 收官（AT-1/AR-5/AS-1/AS-3/AX-8/AR-4）；余验收项：画像 diff 撤销语义与网络/权限分支归真机走查（B-18 diff 预览已交付）
* i18n +1 键（sampleExists，zh/en 对齐 1200）

## v0.204.0 2026-10-06 · Obsidian SR 导出（互通对称闭环）

* 管理器选中卡新增「导出 Obsidian SR」：qa 块（`front ==back==` 尾部闭合且 front 无其他标记）→「问 :: 答 #flashcards」；多挖空/尾部有内容/无标记 → cloze 原样降级（不强行拆问答——多标记块在 Obsidian SR 本就是 cloze，诚实口径）
* 实现细节：中段惰性匹配（贪婪会吞掉尾部多挖空标记误判 qa，测试锚定）；导出文件可被本插件导入器原样回导（往返闭环有测试）；toast 汇总问答/挖空张数
* i18n +3 键（zh/en 对齐 1199）；668 测试（+3）

## v0.203.0 2026-10-06 · Obsidian SR 导入 W2：分卡组落库 + 台账幂等重导

* deckHint 分卡组：`#flashcards/子路径` 每个路径一个卡组（「Obsidian: 文件名/子路径」，根路径落「Obsidian: 文件名」）；同名牌组复用（先查 getRiffDecks 再缺失创建，避免重复导入堆同名组）；blockID 按全局序归组，与一卡一段落对位约定一致
* 跨运行弱台账（ob-import-ledger.json，PRIVACY 已披露）：内容指纹 → 卡组/块 ID（上限 5 万，**不存笔记内容**）；重导同内容文件自动跳过已导入项（partitionByLedger），确认弹窗与完成提示分别显示台账跳过数；同指纹重导更新落点（merge 保留最新）
* v1 的「无跨运行台账，重复导入会重复建卡」边界自此关闭；仍诚实保留：双向卡按正向导入、指纹相同但文字微调会视为新卡
* i18n 文案更新（确认/完成提示含 skip 占位）；665 测试（+4）

## v0.202.0 2026-10-06 · Obsidian SR 笔记导入（调研立项 → 交付）

* 新增 core/obsidian-import.ts 纯模块：**块级解析**（空行分段，多行 ?/?? 块、单行 ::/::: 卡、==挖空== 块可混排——补齐 parseSrMarkdown 只认首个多行块的局限）；deck tag 从题面/答案剥离（parseSrLine 残留行为修正为导入口径）；文件内指纹去重；compose 保证一卡一空行分段（行首 # 转义防变标题破坏对位）。6 组单测
* 导入编排（设置 → Anki 区旁新行）：选 .md → 计划确认弹窗（问答/挖空/双向按正向/去重计数 + 目标卡组）→ 建「Obsidian SR Import」笔记本 + 文档 → **按文档序对位，落块数与卡数不一致即中止**（防错位）→ 新卡组「Obsidian: 文件名」入组
* 诚实边界（设置提示 + 注记）：双向卡（:::/??）按正向导入（方向信息 v1 丢失，计数保留）；无跨运行台账（Obsidian 无稳定 ID，重复导入会重复建卡）；deckHint 分布仅预览展示，v1 全部落同一目标卡组
* i18n +9 键（zh/en 对齐 1196）；655 测试（+6）

## v0.201.0 2026-10-06 · 备份与恢复中心（docs/38 P2 首个切片）

* 新增 core/backup.ts 纯模块：稳定序列化（键排序）+ FNV-1a 逐文件校验和 → 单文件 bundle（包裹标识/app/schema/manifest），打包与校验可复现（6 组单测：三态对比/篡改拒绝/未知 key 拒绝/空集拒绝/输入不改）
* 导出：设置 → 数据「备份与恢复」一键导出全部 19 个私有存储文件为 `lv-cards-backup-<日期>.json` 快照（含复习日志/卡面版本等用户内容，文件自管**不上传**——PRIVACY 已披露）——升级前快照、误删回滚基线
* 恢复：选择文件 → **预览（恢复演练，不改任何状态）**：逐文件 checksum 校验 + 与当前数据 replace/add/unchanged 三态对比 + 未知数据槽与篡改拒绝 → 确认弹窗列出差异摘要 → 确认后经 persist 队列逐 key 落盘 → 与 onload 同一装配路径重载内存 → 角标刷新；取消则什么都不发生
* 设置 UI：导出按钮 + 恢复文件选择（20MB 上限、busy 防重复、失败 toast 可读原因）；i18n +10 键（zh/en 对齐 1187）；655 测试（+6）

## v0.200.0 2026-10-06 · AS-3 富内容卡面降级 + BU-40 无 AI 等价登记（B 轨收官）

* AS-3 富内容卡面：新增 core/card-face.ts 纯模块（公式/图片/嵌入块/代码/表格/超长链接六特征识别，内核 DOM 口径）；复习卡面下方新增特征提示行（含「内容过宽时卡内左右滚动」提示，role=note）；`.lv-card-content` 横向滚动收纳（窄屏表格/长链不撑破卡面）
* AS-3 加载失败占位：新卡卡面加载失败不再整页切错误视图——卡面区显示占位（原因+重试按钮），队列位置不丢、重试不重排队；**顺带修复一个存量缺陷**：切卡时未清空上一张卡面，新卡加载失败会静默残留上一张的内容（现已切卡即清，失败走占位）
* BU-40 无 AI 等价登记（B14，B 轨最后一条）：core/ai-equivalents.ts 注册表——每个 AI 入口登记 usesAI/手工替代路径/损失说明（诚实标注不可替代部分，不谎称完全等价）；零 AI 入口（修卡演练/全程无 AI）显式声明；防漏登记测试锚定；docs/29 §9 同步登记表与约定（eligibility 阻断、帮助、文档引用同一事实源）
* i18n +16 键（aiFace 8 + aiEquiv 8 段，zh/en 对齐）；649 测试（+7）

## v0.199.0 2026-10-06 · AS-1 焦点陷阱：对话框键盘闭环（Tab 循环/Esc/移入/归还）

* 新增 libs/focus-trap.ts（纯 DOM 工具，happy-dom 可单测）：getFocusable（排除 disabled/负 tabindex，属性排除在代码层做——happy-dom 属性选择器口径不一）+ trapFocus（打开记宿主→焦点移入首个可聚焦元素→Tab/Shift+Tab 容器内循环→Esc 只回调不执行关闭→release 幂等并按选项归还焦点）
* 对话框接线：confirmDialog 捕获焦点（Esc 关闭+按钮后归还）；svelteDialog 捕获焦点（Esc→既有 closeOnce 一次性；归还走 AR-2 既有 restoreFocus，restoreOnRelease=false 防双重归还）——全部对话框（AI 向导/设置/目标/卡片详情等 9+）键盘流闭环
* LvDrawer 非模态语义显式化：role="dialog" aria-modal="false"（不劫持页面其余部分，验收「非模态层不误加 aria-modal」）+ aria-label + 关闭按钮 aria-label
* 质量：642 测试（+7）；check 0/0；i18n 零增量（纯行为）

## v0.198.0 2026-10-06 · E 批小修三连：同步有界重载 + 报告写入闭环 + UI import 边界门禁

* AT-1（保守版）：覆写 `onDataChanged`（宽容兼容 string[] 与 {files} 两种宿主形态）——只认本插件 petal 存储目录变更，防抖 2s、单飞串行；重载前先 `persist.waitAll` 冲刷本地在途写（**绝不覆盖未 flush 的本地状态**），再整批重读+normalize（与 onload 同一装配路径，读取/装配抽成方法防错位回归）；完成后刷新角标；卸载取消挂起重载。打开中页签不自动重渲染（完整 UI 刷新协议待真机专项），已知边界诚实登记
* AR-5：报告写入闭环——总览「写入文档」按钮 busy 防重复点击、catch 失败原因就近展示（报告纯函数可随时重试）；成功后 toast 路径并自动打开文档；考试复盘写入同样补 busy/失败 toast + 成功打开文档
* AX-8：治理门禁新增 ⑩ UI 层 import 边界——src/ui 与 src/chunks 从 "siyuan" 包只允许导入展示级 helper（showMessage/openTab），内核数据面必须经 src/api 收口（超时/错误层统一）；静态检查入 CI 链，白名单外导入即失败（当前全部通过——既有代码已合规，此门禁防回潮）
* 本批未做（诚实登记）：AR-4（onboarding 幂等多路径）、AS-1（真模态焦点陷阱）、AS-3（富内容卡面降级）——三项均需较大 UI/真机面，按 docs/36 择项原则跳过留后续
* i18n +1 键；635 测试不变（AT-1 装配抽取为等价重构，由既有全量套与 e2e 覆盖）
## v0.197.0 2026-10-06 · B12（BU-36 上下文包预览）：发送前分层预算可见

* 向导预览确认步新增「上下文包预览」区（BU-36，BU-6 planContext + BU-18 注册表预算的 UI 面）：宿主新增 previewBudget 纯函数通道（assembleGeneratePrompt 零网络重放），打开预览时计算一次——分层显示系统提示/材料各层 token 与上限，截断/丢弃显式标注（不静默裁剪），预算来源标明「模型注册表（按窗口收紧）/任务默认」，材料超预算时发送前即显示「请分段生成」警示（不必等到真正调用才失败）
* 预览失败不阻塞发送（generate 侧有完整校验）；旧宿主不传 previewBudget 则不显示该区
* i18n +7 键（zh/en 对齐 1157）；代码路径零网络零持久化（纯展示）

## v0.196.0 2026-10-06 · B11（BU-24/25 成本账本）：月度预算阻断 + 用量记账

* 成本账本纯模块（core/ai-cost-ledger.ts）：每次出卡记一条用量（任务/端点形态/模型/token 估算/费用估算/算法与价格版本）——**token 全为估算并显式标记 est=true**（chars/4 + 注册表价格快照），绝不冒充账单事实；价格未知记 null 不编数字；上限 2000 条自动裁旧；**key 与材料/卡片原文永不入账本**
* 月度预算（BU-24）：设置新增「AI 成本预算」行（开关 + 月度 token 上限 + 本月已用即时显示）——达到 80% 预警 toast、达到上限在组装 prompt 前阻断（eligibility costExceeded 事实源落地，BU-33 预留位补全）；**阻断信息自带手工替代路径，fallback 不会启动**（不偷换端点）；自然月窗口本地时区
* 用量可导出/删除（BU-25）：设置 → 数据新增「AI 用量账本」行——JSON 导出（按模型/按日聚合 + 明细）与确认清空（预算归零重计）
* 存储接线：ai-cost-ledger.json 新文件（PRIVACY 披露行同步；storageStats 自动收录）；i18n +8 键（zh/en 对齐 1150）
* 质量：635 测试（+5，含聚合价格未知组 null 传播、预算窗口跨月、warn/exceeded 阈值边界）

## v0.195.0 2026-10-06 · B13 红队 fixture 扩容（注入模式库 10→14 + 扫描资源上限）

* INJECTION_PATTERNS 扩容 4 个高信号模式：HTML 事件外发（`<img onerror=` 等）、聊天模板逃逸（`<|im_start|>` / `[INST]` / `[/SYS]`）、密钥套取（打印 API key/口令）、Markdown 信标（超长外链图片 ≥80 字符）
* 红队 fixture 10→15：新增 HTML 事件外发、聊天模板逃逸、INST 标记逃逸、Markdown 信标、套取密钥五组攻击样本；零误报集同步扩容（相对路径图片/普通短链图片不命中信标模式）
* 资源上限：扫描输入截断 SCAN_MAX_CHARS=200K 字符（诊断留证不是安全边界，防超长材料资源耗尽；BU-21「超长输入」项的有界化），有界性有测试
* 覆盖度护栏改为按唯一 expectId 断言（两 fixture 可共用一模式）；8/8 spec 全过
* i18n 零增量（扫描器为诊断层，无用户可见文案）

## v0.194.0 2026-10-06 · B10（BU-19 批次 pin）：生成环境快照随批次落盘

* ai-batches 批次记录新增 pin 字段（BU-19）：mode/modelId/templateHash（生效 system 提示 FNV-1a）/sourceHash（来源材料指纹，**不回存原文**）/pinnedAt——模型或模板升级后旧批次口径可复现、可比较；类型层无 key 字段，密钥永不落盘
* generate 出卡即写 pin（与批次元数据同点落盘）；normalize 白名单清洗（mode 非法/缺 hash 剔除、modelId 非字符串归 null）；旧批次无 pin 兼容不动（幂等清洗有测试锚定）
* 与 BU-15 分工：批次 pin 管「这一批用什么生成」（批次级持久），版本链管「这张卡改过几手」（会话内候选级）；与仪表盘 AI 批次质量的展示联动归后续批
* 质量：629 测试（+2）；check 0/0；i18n 零增量（数据层）

## v0.193.0 2026-10-06 · T03 审核扩展批：评分卡/审阅计划/版本链接入 AI 向导

* BU-13 评分卡可视化：候选审核步逐卡显示问题维度 chips（提示=warn/问题=error，沿用综合分<70 口径）；「卡面预览」面板新增八维度评分卡区（维度标签+认知层级+说明+修复建议，随编辑实时重算）；综合分随标题展示并标注仅审阅提示——入库资格仍由「已接受」决定
* BU-14 审阅计划横幅：候选步顶部按因子就高不就低显示建议强度——「建议逐卡审阅（因子：模型未在册/来源未验证/批量均分偏低/问题卡较多）」或「可抽样审阅：重点核对前 N 张」；模型可信度接线（siyuan 内核网关=可信；custom 按注册表登记状态），剪贴板粘贴来源标记「未验证」；建议性横幅不代审不阻断
* BU-15 版本链接线（会话内）：生成候选记 ai 版本（带生成快照 mode/modelId/templateHash——generate 返回值扩展，fnv1a 对生效 system 提示取 hash）；接受时记 user 版本（与链尾同文去重）；**单卡重生前自动留痕当前文本**（用户改过未接受也不丢）+ 重生后记新 ai 版（新旧可对比）；预览面板新增版本历史区（AI 生成/用户编辑双轨徽标 + 「回到此版」恢复，恢复后置回待审须重新核对）
* 边界诚实登记：版本链为会话内生命周期（重开向导不保留），跨会话持久化归 provenance 存储批；重生成 diff 对照视图（并排高亮）归 T03 后续批——本批先交付链存储与回滚
* i18n +40 键（aiScore 31 + aiReview 9，zh/en 对齐 1142）；check 0/0

## v0.192.0 2026-10-06 · BU-14 审阅策略 + BU-15 双轨 provenance（AI 治理 B7+B8 批，B 轨纯模块收官）

* BU-14 人工审阅策略（core/ai-review-strategy.ts 纯模块）：三档强度（逐卡/抽样/阻断）按因子就高不就低——高风险任务直接阻断；模型未登记（BU-18）/来源未验证/批均分 <70/问题卡占比 >30% 任一命中即升级逐卡；干净低风险走抽样（20%，clamp 3-10 张）；决策留触发因子（可解释）；canCommit 只认 accepted、unreviewedNeverCommits 恒真（未审卡永不入正式队列，验收锚点落测试）
* BU-15 双轨 provenance（core/ai-provenance.ts 纯模块）：逐卡版本链（ai 候选 ↔ user 编辑，最新在后截 20）+ 生成环境快照（mode/modelId/templateHash FNV-1a，**类型层无 key 字段**）；重生成各带各的快照可对比；latestUserVersion/userVersions 支撑「回到任意人工版本」；**purgeAIOnly 删除 AI 记录不误删用户内容**——纯 ai 轨迹卡整卡清、有 user 版本的卡整链保留（测试锚定）
* 两模块均为纯逻辑先行（BI-19/BU-13 同模式）：UI 面归 T03 审核扩展批（审阅计划 chip/逐卡版本链 diff）；bundle 零接线增量
* 质量：627 测试（+11）；check 0/0；i18n 零增量（无用户可见文案，词汇表随 UI 批次入）

## v0.191.0 2026-10-06 · BU-11 拒答策略 + BU-13 质量评分卡（AI 治理 B5+B6 批）

* BU-11 不确定性与拒答策略（core/ai-refusal.ts 纯模块）：六类拒答（事实不足/来源冲突/过时材料/危险请求/超出能力/格式失败）固定优先级评估，每类**两两不同**的下一步建议（测试防「统一话术」退化）；i18n 全词汇表（6 原因+11 下一步，zh/en）
* 验收核心落进类型层：每类拒答映射 BU-28 阶梯**终止类**（risk/parse/unknown），测试逐类断言 nextLadderStep 恒 abort（即使备用端点可用）——**拒答绝不自动换更宽权限或偷换未授权 provider**
* 接线：generate 空响应路径改按「格式失败」拒答呈现（可读原因+「重试一次/手工录入」下一步，不偷偷重试）；其余类别为 BL-6 解释面板与后续任务的契约词汇
* BU-13 质量评分卡（core/ai-quality-scorecard.ts 纯模块）：八维度独立打分（原子性/答案泄漏/来源覆盖/重复/歧义/难度/认知层级/语言自然度）——4-gram 答案泄漏检测、分号并列判多事实、代词开头判歧义、GB 身份证以外的启发式全部保守口径；问题维度带 noteKey+修复建议 suggestKey（可解释验收）；综合分加权扣分（leak 30/duplicate 25/atomicity 15/coverage 15/ambiguity 10/naturalness 5），difficulty/cognitive 只标注不扣分
* **综合分恒 advisoryOnly=true**：只作审阅提示，不产生任何写权限——入库资格仍由向导 T03「已接受」状态决定（人工闸门验收），评分卡 UI 面归 T03 审核扩展批次
* 质量：616 测试（+14）；check 0/0；i18n 对齐

## v0.190.0 2026-10-06 · BW-9 来源级禁止外发 + BU-8 敏感内容识别（AI 治理 B3+B4 批）

* BW-9 来源级禁止外发（core/ai-source-deny.ts 纯模块 + 存储接线）：笔记本/文档/块三级 deny 规则（只存 ID+时间+可选备注，上限 2000，**不存笔记内容**）；继承判定「块→文档→笔记本」最具体命中优先；规则只随显式删除解除——移动/导入/重开/重登记一律不失效（重登记不改原 addedAt，防「续命」）
* 硬阻断接线：generate 组装 prompt 前按来源 provenance 判 deny → eligibility `sensitive` 事实源阻断（BU-33 口径，给手工/本地替代）；UI 载入前拦截（已禁文档/笔记本材料不进向导）+ 来源条目 🚫 一键登记（落 ai-deny-list.json + toast）；向导 run() 携带 provenance，UI 拦截不可绕过
* BU-8 敏感内容识别与脱敏预览（core/ai-sensitive.ts 纯模块）：九类内置模式（密钥字段/OpenAI/GitHub/AWS 密钥/私钥块/JWT/手机号/邮箱/身份证——身份证走 GB 11643 校验位验证，普通 18 位单号不误报）+ 用户自定义敏感词（settings 新字段，逗号分隔，中英分隔符均可）；**命中只显示打码样本**（前 8 字符+***，绝不回显完整原文）
* 发送前处置门（向导预览确认步）：命中时展示「类别×次数（样本）」chips，三选——「脱敏后继续」（材料原地替换占位符，可回编辑区核对）/「仍发送原文」（显式确认）/返回；脱敏后复扫清零才可确认，不做静默拦截也不静默放行
* 设置：AI 区新增「自定义敏感词」行（思源内置 AI 与自定义端点都生效）；存储体检自动收录 ai-deny-list.json；PRIVACY 补披露行
* 医疗/法律类语义识别正则不可靠，本切片不收录（防高误报）——以自定义敏感词为替代路径，诚实登记于 docs/17
* 质量：602 测试（+13）；check 0/0；i18n 对齐；主包 ≤55KB

## v0.189.0 2026-10-06 · BU-18 模型能力注册表 + BU-28 分层降级阶梯（AI 治理 B1+B2 批）

* BU-18 模型能力注册表（core/ai-model-registry.ts 纯模块）：14 个常用 OpenAI 兼容模型登记 provider/上下文窗口/输入模态/参考价（快照 2026-10，缺失=null 不编数字）/已知限制标签/active-deprecated-retired 三态；**失效模型不再出现在可选列表**（selectableModelOptions 只回 active，测试全表核对 deprecated/retired 零泄漏）；ID 匹配宽容（大小写/空格、openrouter「/」中转后缀、dated 变体归并 gpt-4o-2024-11-20→gpt-4o）
* 预算从注册表收紧：effectiveBudgetTokens 按窗口×0.6 收口（只收紧不放大、下限 2000、未登记回任务默认）——小窗口模型（如 moonshot-v1-8k）材料超窗不再溢出；ai-pipeline audit 新增 budgetSource/modelId（lvLog 审计可追溯预算依据）；custom 模式 generate 按设置模型解析，siyuan 模式内核管理不判
* BU-28 分层降级阶梯（core/ai-degradation.ts 纯模块）：十类失败分类（取消/隐私拒绝/配额/auth/限流/5xx/网络/解析/风险/未知；**配额先于 429**——insufficient_quota 重试有害）+ 三动作阶梯（重试主端点/转已授权备用/中止）；终止类（401/配额/隐私/解析/风险/取消）无论备用可用性一律中止，**绝不静默回退**；决策携带 mayCost/usedFallback/retryAfterMs 供界面呈现实际路径与费用（验收硬性要求）
* 口径收敛：ai-errors.isRecoverableAIError 委托阶梯分类器（AQ-15 判定单一事实源，既有 5 组测试零改动全过）；ai.ts fallback 决策走阶梯（可观察行为保持：主端点不重试、组合错误信息不变）+ 新增 onDegradation 回调；降级 toast 升级为「已切换备用端点+可能产生额外费用」说明
* 设置页模型快选：AI 区「模型」行新增在册模型下拉（仅 active，含 provider+窗口规模标签）+ 登记状态提示（登记→窗口规模；失效→建议更换警示；未登记→保守默认口径）
* i18n：aiDegrad 两键（usedFallback/mayCost）+ settings 模型 4 键，zh/en 对齐（1065 叶键；顺带清理 zh-CN 重复键 menuDashboard 与残留缩进噪声）；PRIVACY 补 anki-ledger/content-versions 存储披露（v0.186 漂移收口）+ 回退口径改写为阶梯语义
* 质量：589 测试（净增 22：注册表 9 + 降级阶梯 9 + pipeline 预算 2 + 既有委托口径 2）；主包 46.28KB ≤55KB 门禁

## v0.188.0 2026-10-06 · 工作台页签 + 深度统计记忆 + 损失明细复制

* 闪卡中心新增「制卡工作台」常驻页签（T02）：AI 制卡向导与修卡演练的集中入口（openWizard/openDrill 宿主通道，旧宿主兼容）；全屏内嵌工作面留待后续批次（跨 chunk 加载专项）
* 深度统计展开态持久化（T01）：总览「深度统计」展开/折叠选择落偏好设置，重开页签/重启后保持
* Anki 导入完成提示新增「复制损失明细」一键复制（诊断对账用，走剪贴板）
* 总览刷新并行化收尾：文档归属/V2 统计 SQL 与卡组/到期并发，hero 统计快路径先行渲染

## v0.187.0 2026-10-06 · 向导工作台 + 返场分流接线 + 演练样例扩容

* AI 制卡向导升级为双栏工作台（docs/13 §4 T02 收口）：左栏来源清单分条管理（标签/字数/📂回源/✕移除/**点标签查看该条原文**）+ 四类载入入口；右栏材料大文本编辑（裁剪即编辑、字符/token 实时计数、空态引导）+ 参数内联行；生成前请求预览确认步保持
* BI-27 返场分流 UI 接线（v0.185.0 记录的待办关闭）：跨天返场且上日有收工原因时，复习开场显示今日方案横幅——方案/步骤/建议上限（BI-27 模块推导，恒不补齐逾期），展示性可忽略，不自动改预算与队列；BI-8 收工原因 → BI-27 返场原因显式映射
* 修卡演练样例库扩容（docs/13 §12）：新增「缺少必要条件」样例（光速卡）与样例选择器，两种典型失败模式（题面过宽/缺条件）各配完整五步流程
* 文档：docs/34 V-8 补记限时行为修正（v0.186.0 后继提交 afe8984）与新验收步骤

## v0.186.0 2026-10-06 · UI 精品化批 1-4 + Anki 本地导入 + 冒烟加固

* UI 精品化（docs/39/40，原型十任务面全部核心落地）：R52 视觉纪律（状态点静态化/去光泽辉光/完成页与评分条去错峰）、页头 eyebrow+24px 题制、评分条原型规格（77px 高卡/kbd 右置/间隔下沉/窄屏 2×2）、向导双栏工作台（来源清单分条+回源📂+材料可编辑裁剪+AI 请求预览确认步）、审核状态机（已选≠已审、接受/待核实、编辑即失效、入库只取已接受、全部接受快径）、详情四分面（内容/来源/学习记录/问题）+ 内容版本追踪（保存留快照、对比当前逐行 diff）、T08 待处理聚合（疑问/暂停/续传，恢复幂等）、T06 目标三步链（了解→回忆→应用，状态如实）+ 缺口提示、T10 修卡演练（独立样例五步，零网络零写入）
* 行为修正：限时模式到点不再自动提交正式评分——只揭示答案并提醒自评（docs/13 §6 遗留差距清零）；v0.82 遗留 resumeCopyFailed 坏键修复（恢复横幅按钮此前渲染 undefined）
* Anki 本地导入 M1-M3：.apkg/.colpkg 解析（自研 zip 读取 + 注入式 SQLite 适配）、字段映射/保守 HTML 清洗（损失台账绝不静默丢弃）/归一化指纹查重/导入预览、SR 单行落库编排 + guid 台账幂等重导；设置页 Anki 区入口（node:sqlite 可用性自检，不可用降级提示）；1000 笔记大库基准在预算内
* 冒烟/e2e 加固：scripts/lib/smoke-kernel.mjs（前缀注册表/靶场防呆/残留清扫）、e2e-isolated 双模式（自起隔离靶场 / SIYUAN_BASE_URL+TOKEN 附着既有内核）、失败路径退出码语义修复（SilentExit 替代 process.exit）；发布包 smoke-dist 门禁（build 链尾真实执行 chunk 注册契约——v0.185.0 真机空白屏根因类）
* 质量与工具：567 测试（净增 47）、Anki 1000 笔记大库基准、i18n +46 键中英对齐、品牌图标重设计（白卡闪电，系列语言，用户从 A/B/C 候选选定 A）、deploy-device 参数化（LV_DEVICE_PLUGIN_DIR）
* 文档：docs/38 状态评审（v0.185 基线）、docs/39 UI 精品化差距与批次计划、docs/40 原型全页核对清单（T01-T10 逐面对照）、docs/34 冒烟加固约定与 V-8 行为修正补记

## v0.185.1 2026-10-05 · fix：真机空白屏——chunk 注册契约失配 + BASE 相对路径（AT-17 回归门禁）

* 修复两个自 v0.158.0（AT-17）以来生产构建**必现**的 chunk 加载缺陷（dev 模式走进程内导入不暴露，首个真机生产安装即空白）：① hub/review/dialogs 三个 chunk 整表覆盖 `window.__lvChunks`，而 loader 按 `__lvChunks.<name>` 取模块——恒 undefined，闪卡中心/复习/9 个对话框全数挂载失败；② chunk BASE 为相对路径，桌面端页面位于 `/stage/build/app/` 下，script 解析到 `/stage/build/app/plugins/…` 必 404（内核对 `/plugins/*` 实测 200）。修复：按键合并注册（dialogs 带 `components` 子表，与 shell 消费同形）+ BASE 根绝对
* 页签挂载失败兜底：hub/review 挂载点补 `.catch` + 可见错误 UI（i18n +2 键，zh/en 对齐），不再静默空白；loader 失败本就不驻留缓存，重开页签即自动重试
* 回归门禁：新增 chunk-registry-contract 单测（源级契约：按键合并、禁整表覆盖、BASE 根绝对、挂载点必有兜底）+ `scripts/smoke-dist.mjs` 发布包 smoke（build 链尾在 happy-dom 中真实执行 dist 产物，验证 `__lvChunks.<name>` 注册形态与三 chunk 共存），已接入 `pnpm build`
* 工具：`deploy-device.mjs` 参数化（`LV_DEVICE_PLUGIN_DIR` 环境变量，去除硬编码本机路径，挂 `pnpm deploy:device`）。另核实 pnpm-lock.yaml 双 YAML 文档为 pnpm 12 管理 `packageManager` 的标准结构（重建逐字节一致），非损坏，不动

## v0.185.0 2026-10-05 · BI-27 返场原因分流（六类六案，绝不统一补齐逾期）

* 新增 core/return-triage.ts 纯模块：六类返场原因（时间不足/目标改变/内容过时/数据故障/压力/单纯离开）各对应**不同**方案（两两不同签名，+5 组单测防「统一方案」退化）——时间不足=小预算+高优先级；目标改变=先重审标准（BI-16/11）；内容过时=来源健康+修订优先（BI-20）；数据故障=先诊断对账再小批量；压力=只读 0 张或休息；单纯离开=正常队列
* 验收硬性要求落档：duePolicy 恒 keep（任何方案都不补齐/清空逾期）；分流记录追加留痕（截 30 条，快照不含材料内容）
* 与 BI-8 分工：收工原因记录「为什么离开」，本模块决定「回来怎么办」；UI 接线待后续批次（与 BI-10 横幅同场）
* i18n +17 键（returnTriage 段 plan 6+step 11，zh/en 对齐）；bundle 零增量

## v0.184.0 2026-10-05 · BI-20 来源健康状态（纯模块，五类影响分类器）

* 新增 core/source-health.ts：五类健康问题分类器（删除/移动/版本变化/媒体失效/许可变化，按验收列举顺序独立标记可并存）+ 健康史（发现追加、原地标记解决不删史——验收「修复保留历史」）+ openIssues 未解决清单
* 验收硬性要求落档：每条问题 `affectsScheduling: false` 恒定——**健康问题不冒充记忆失败**，复习统计与调度归内核 riff（ADR-3）
* 事实由调用方采集（SQL 存在性/归属、内容指纹、媒体探测），本模块只做分类与历史；bundle 零增量（未接线）；+5 组单测（514→519）
* i18n +5 键（sourceHealth.impact.*，zh/en 对齐）

## v0.183.0 2026-10-05 · BI-19 学习对象生命周期状态机（纯模块，九态+四元数据）

* 新增 core/learning-object.ts：九态学习旅程（captured→clarified→candidate→committed→practiced→applied→maintained / stale / retired）；**转移表即契约**——每次转移必须携带触发（trigger 枚举）/责任模块（capture/wizard/review/user）/可见原因（reasonKey，不裸露枚举）/撤销策略（none/previous/explicit）四元数据，缺一不合法；+7 组单测（507→514）
* undo 策略可执行：previous 直接落 undo 反向记录（不受正向表约束，trigger=undo）；normalize 接受正向与 undo 两类轨迹且元数据缺一剔除；历史截 50 条
* i18n +13 键（loState 段 reasonKeys，嵌套结构配点路径解析，zh/en 对齐）——吸取 BU-5 教训，reasonKeys 交付时即入 i18n 并附解析核对
* 与 BI-5 分工：BI-5 管材料内容生命周期，本模块管学习旅程本身，并行记录互不替代；bundle 零增量（未接线）

## v0.182.0 2026-10-05 · 优化轮三连：e2e 抗抖动 + 预算到自动记因 + 减负联动

* e2e-isolated 抗抖动：冷启动内核索引未就绪时 createDocWithMd 偶发 "block not found"（本轮实测一次误报）——失败自动重试一次
* BI-8/12 联动：预算到点进入完成屏时自动记「时间到」收工原因（中性事实；用户手动点选的原因优先，不覆盖）
* BI-13 联动：减负选择「缩小范围」点击后聚焦范围选择器（提示收窄，不代选范围）
* 主包 42.11KB 不变

## v0.181.0 2026-10-05 · BI-17 切片：管理器视图状态持久化（返回恢复筛选）

* settings 增 lastManagerView（JSON 字符串）+ parseManagerView 宽容解析纯函数（非法枚举/缺字段回缺省、损坏 JSON 回 null，+3 组单测 504→507）
* 管理器页签：挂载时恢复上次筛选词/排序/烂卡筛选/状态过滤（due 态恢复自动重拉到期集）；视图变化即持久化（settings 走 saveSettingsSoon 防抖）——验收「筛选恢复」部分落地；滚动/焦点恢复依赖宿主 DOM 登记余项
* BI-17 全项（跨练习/来源/目标的多级返回+滚动焦点）仍需宿主导航能力，本切片只收口可离线交付部分
* 主包 42.11KB 不变

## v0.180.0 2026-10-05 · 优化轮：dialogs 缓存失败可重试 + 预算自定义值回显

* 缺陷修复（自查发现）：loadDialogsComp 的 ready 缓存会把 rejected promise 驻留——dialogs chunk 一次加载失败（如网络瞬断）后所有对话框永久报错、不再重试；修复为失败即清缓存（rejected 不驻留），重试链与 chunk-loader 既有语义（已测）对齐
* BI-12 UI 打磨：偏好弹层预算下拉在自定义分钟生效时回显「N 分钟」项（此前 select 空白）
* 主包 42.07KB 不变；纯缺陷修复无新功能

## v0.179.0 2026-10-05 · 混合题型轮换（调研产出的展示层轮换，不动调度）

* 新增 core/question-rotation.ts 纯模块：按本场作答张数在翻面/打字/选择间轮换提名出题形态（仅轮换已启用题型；单一启用恒翻面——无多样性不假装轮换；异常输入归一），+4 组单测（500→504）
* 复习面板：全局设置「混合题型轮换」（默认关）+ 本场偏好弹层可覆盖（BX-3 覆盖集免费获得）；轮换提名 choice 时自动本地采样干扰项（等同手动 🎲，无网络）；轮换关=既有静态设置行为逐字节保持
* 来源：Quizlet Learn 多题型混合轮换（docs/17 AO 区 v0.178.0 调研登记）；展示层轮换不动调度与统计
* i18n +3 键（settings.mixedRotation*，zh/en 对齐）；主包 42.06KB 不变

## v0.178.0 2026-10-05 · docs/34 E2E-3 真机走查单（学习旅程/AI 安全/chunk 化，W-1~W-12）

* 新增 E2E-3 走查单：12 项人工验收覆盖本会话全部待真机交付——W-1 chunk 化复验（关键前置）、W-2~W-4 内容状态面板/入口上下文/收工原因、W-5 返场检查+减负（含造数据方法）、W-6~W-9 预算/维护/目标页/界面模式、W-10~W-12 AI 前置检查/注入围栏/紧急停用（需真实模型）
* 每项含步骤/预期；执行顺序与证据记录约定同 V 组（通过回写 docs/17「真机 W-x」注记）
* 纯文档版本：代码零变更；真机会话可照单执行（预计 1.5-2 小时）

## v0.177.0 2026-10-05 · BI-14 渐进界面（界面模式：简单/熟练）

* settings 增 uiMode 枚举（simple/advanced，默认 advanced=既有全量 UI，存量用户零感知）；归一化白名单 +1 测试（500→500，替换扩写枚举用例）
* 简单模式显隐（纯显示控制，不删配置）：Hub 隐藏「考试/维护」页签（initialTab 命中隐藏页签回退总览）；管理器隐藏烂卡筛选/CSV 导出/批量重置（批量删除保留——核心操作）；命令面板命令全量保留（验收「高级功能仍可搜索到」）
* 设置页模块段顶部新增「界面模式」选择（简单/熟练），提示文案声明不删配置；挂载时定格（改后重开页签生效，与 lastHubTab 语义同构）
* i18n +4 键（settings.uiMode*，zh/en 对齐）；主包 42.03KB 不变

## v0.176.0 2026-10-05 · BV-8/9 模板扩容（BV 家族收官，注册表 12 模板）

* BV-8 答案 rubric：必答要点/可接受别名/拒绝项/提示梯度（要点须有来源依据；评分要点仅供参考不映射正式评分）
* BV-9 列表/表格/双向卡：变体声明（list|table|reverse）+ 是否有序 + 列映射 + 逆向成立性 + 集合边界 + 来源原句（不强制双向化，变体附来源）
* i18n +2 nameKeys（防回归测试自动覆盖）；注册表 10→12 模板，settings 下拉与 BV 家族在册测试同步更新

## v0.175.0 2026-10-05 · BI-16 用户自定义完成定义（标准可修改，历史保留）

* learning-goal 增 criteriaHistory（GoalCriteria{text,since} 追加式历史，最新在末尾；白名单清洗：空文本剔除/截 100 字/上限 20 条）+ setCriteria（同文无操作/空文本忽略，不可变追加）+ currentCriteria；+2 组单测（498→500）
* 目标表单新增「完成标准」输入（占位示例：读完第一章/能讲解给他人/能做对例题）；目标行显示 🎯 现行定义——修改即追加历史，旧定义按验收保留当时版本
* i18n +2 键（goals.criteria*，zh/en 对齐）；hub chunk 49.37KB / 主包 42.00KB（≤55KB 内）

## v0.174.0 2026-10-05 · AT-17 延伸：dialogs chunk 切分（主包 72.97→41.89KB）

* libs/dialog 增挂载器注入点（setDialogMounter）：svelteDialog 经注入的 mounter 挂载 chunk 编译的组件——组件与挂载同 svelte 实例，杜绝双份内部状态 split-brain；未安装时回退 shell svelte（dev 进程内组件）；组件销毁统一出口兼容句柄/实例两种形态
* 新增 chunks/dialogs.ts：9 个对话框组件（向导/遮挡/引导/挑战/标记/配对/设置/选卡组/快速制卡）+ mountDialogComponent；**关键坑位**：挂载器安装必须在 shell 侧（chunk 内 import shell 的 libs/dialog 会形成模块双副本，setter 无效）
* **DCE 坑位**：dev 动态 import 若作实参传包装函数会被无条件打包（首测主包反涨 73.15KB）——DEV 三元移到调用点后 define+DCE 正确剪枝
* 实测：主包 72.97→**41.89KB**（-31.1KB，对话框组件+kit+shell svelte 内部运行时全部移出）；dialogs chunk 37.88KB+css 按需加载；隔离 e2e 16/16（含 dialogs 六项断言）；预算第六次修订 ≤75→**≤55KB** 锁定收益
* i18n 无变化；单测 +2（chunk-loader dialogs 形态与导出校验，496→498）

## v0.173.0 2026-10-05 · BU-31 AI 故障与安全事件处置（紧急停用 + 撤销同意）

* 新增 core/ai-kill-switch.ts 纯模块：目标粒度紧急停用（provider:/model:/task:/template: 非明文键）+ 撤销同意总闸 + 批次隔离 + 安全事件流（最近 50 条，幂等操作不重复记事件，scope 截断 120 字不含材料内容）+ normalize 白名单清洗；+6 组单测（491→497）
* 存储：ai-killswitch.json 入 STORE_KEYS 批量加载 + 落盘 + storageStats 行 + PRIVACY 披露（governance 存储披露核对拦截一次后补齐——机制有效）
* generate 前置检查追加总闸/目标粒度阻断（consent-revoked / target-disabled 两种错误文案）；设置页 AI 段新增「紧急停用」行：停用/恢复当前配置、撤销/重新授予同意——**停用与撤销均同步清理待发队列**（活动态 ai-jobs → canceled，验收「清理待发」）；卡片与正式复习零影响
* 验收留痕：停用后无后台请求 ✓（前置检查组装前阻断）；「恢复旧版本」（设置快照回滚）登记为余项
* i18n +13 键（settings.aiKill* + aiKill.* 错误文案，zh/en 对齐）；主包 72.97KB（≤75KB，余量 2KB——下一批 UI 前评估 dialogs chunk）

## v0.172.0 2026-10-05 · BU-33 AI eligibility 前置检查（组装前阻断 + 替代路径）

* 新增 core/ai-eligibility.ts 纯模块：五类前置检查（材料非空/AI 配置/网络在线/来源敏感/成本预算）按固定优先级阻断，每条阻断强制配对「手工/本地替代路径」键——验收「不把环境失败归因成模型质量」；事实未提供的检查项不判而非失败（渐进接入：敏感=BL-5 预留、成本=BU-24/25 账本预留）；+5 组单测（486→491）
* 向导 generate 接线：组装 prompt **前**检查（材料空/custom 未配端点密钥/navigator.onLine 离线）——不满足即抛「原因+替代」错误，零 token 消耗；siyuan 网关模式视为已配置
* i18n +10 键（aiElig 段 5 原因+5 替代，zh/en 对齐）；主包 71.83KB（≤75KB 内）

## v0.171.0 2026-10-05 · BU-35 AI 调用流水线骨架（生成链收编单一入口）

* 新增 core/ai-pipeline.ts：TaskRegistry（cards-generate：默认模板/schema 契约/固定写入目标/24000 token 保守窗口）+ assembleGeneratePrompt 组装器——模板解析（BU-5 自定义/默认双路径，行为逐字节保持）→ 不可信围栏（BU-7）→ 隔离条款 → BU-6 预算报告 → 审计字段（task/模板来源/token 数/截断层/needsBatching/writeTarget，不含材料明文）；+6 组单测（480→486）
* openAIWizard generate 切换至流水线入口：手工拼装（模板串替换+围栏+条款）退役；超长语义不变（needsBatching=原 24000 阈值，照旧抛 aiTooLong）；AuditSink 接 lvLog（仅非敏感字段）
* 流水线七段映射留痕：ProviderRouter=aiChat 配置（mode/fallback 既有）、SchemaValidator=parseCards+PARSE_LIMITS、EvidenceStore=ai-jobs excerpt、ContextPack/PromptRegistry=本模块、AuditSink=lvLog——UI/Agent/批处理扩展任务必须经 TASK_REGISTRY 登记（写入目标边界）
* 主包 70.72→71.55KB（context-budget 随接线转正，≤75KB 内）

## v0.170.0 2026-10-05 · BU-7 提示注入隔离（数据围栏 + 离线攻击 fixture）

* 新增 core/prompt-injection.ts：不可信数据围栏（wrapUntrusted，label 净化防标签逃逸）+ 系统侧数据隔离条款（声明三不动：无工具调用/不外发/产物只写制卡向导）+ 10 组中英注入模式扫描器（忽略指令/角色翻转/伪造 system 标签/套取提示词/数据外发/工具调用/权限提升）
* 向导 generate 接线：system 追加隔离条款（i18n 可覆盖）、材料以 <untrusted_data> 围栏包裹后进 user 提示——「来源笔记里的指令」被隔离为纯数据；扫描器用 String.match（等价改写，消除安全扫描器对 exec 标识符的误报）
* 离线攻击 fixture：10 条攻击全命中 + 正常学习材料零误报（含「Ignore 语法」这类形近教材文案），+7 组单测（473→480）
* 分层防御口径：本插件 AI 无工具调用、无自主外发、写入目标固定（攻击面天然受限）；扫描器为诊断留证手段而非判决
* i18n +2 键（aiInjectionGuard/aiUntrustedLabel，zh/en 对齐）；主包 70.72KB（≤75KB 内）

## v0.169.0 2026-10-05 · BU-6 上下文预算器（纯模块，零打包增量）

* 新增 core/context-budget.ts：五层固定序拼接（system→instruction→preference→material→tool，与输入顺序无关）+ 优先级预算分配（材料证据层 priority 1 最后才裁）+ 从头截断保留来源位置（尾部可见标记，禁止静默）+ 材料独木超预算时 needsBatching/suggestBatches 分批建议（≥2）；+6 组单测（467→473）
* 验收口径：超长材料先给裁剪/分批预览 ✓（reports 逐层列明截断/丢弃）；「不把答案带入题面」归模板层（BV 家族）职责，预算器只保证层级完整不重排不合并
* 纯模块先行未接线（bundle 零变化 70.38KB）；消费方=BU-35 调用流水线注册（向导生成链改造时接入）

## v0.168.0 2026-10-05 · BI-25/BI-12 验收收口（批量恢复 + 自定义预算）

* BI-25「撤销」补完：suspend-today 增 unsuspend（幂等移除，+1 组单测 465→467）；维护页已暂缓行显示「恢复」按钮，组内全部暂缓时组头切换为「本组恢复」；maintenance 通道增 unsuspendToday
* BI-12「自定义」补完：预算行增分钟数输入（clampBudgetMinutes 夹取：非法回 0=关闭、下界 5、上界 480、向下取整，+1 组测试）；预设下拉与自定义输入并排
* i18n +6 键（恢复/自定义相关，zh/en 对齐）；hub chunk 49.17KB / review 32.91KB / 主包 70.38KB（≤75KB 内）

## v0.167.0 2026-10-05 · BI-25 维护债务队列（只读诊断 + 可逆暂停）

* 新增 core/maintenance-queue.ts 纯模块：四类启发式检测（重复=归一化去空白全同≥2 张 / 题面泄漏=挖空答案文本出现在题面 / 过长>280 字 / 待审核=lifecycle needsRevision），+6 组单测（459→465）；启发式口径=「值得看一眼的候选」非判决
* Hub 新增「维护」页签（懒加载子页）：进入自动扫描（分页拉卡上限 500 + SQL 批量取 markdown/root）→ 四类分组列表（组计数 chip + 摘要行 + 明细）；行级「暂缓今日」（=今日不学，可逆次日恢复，不改变 due）与「打开来源」，组级「本组暂缓」批量；全部暂缓状态持久化进 suspend-today
* 验收口径留痕：维护不改变 due ✓（扫描零写入+暂停可逆）；批处理「预览/暂停」✓、「撤销」（批量取消暂缓）待下一批补
* i18n +17 键（hubTabMaintenance + maintenance 段，zh/en 对齐）；hub chunk 49.06KB / 主包 70.38KB（≤75KB 内）

## v0.166.0 2026-10-05 · BI-15 目标进度叙事（阶段计数，非掌握百分比）

* 新增 core/goal-narrative.ts 纯模块：BI-5 十态归组为旅程四阶段（已筛选/已入库/已应用/待维护），按旅程顺序输出非零阶段计数——不把卡数显示为掌握百分比；全空返回空数组不虚构 0%；+3 组单测（456→459）
* 目标页每行新增 🧭 叙事行（圈选材料的目标按其生命周期供数，goals 通道新增 narrate 只读计数入口）；无记录显示引导占位
* i18n +5 键（goalNarrative 段，zh/en 对齐）；hub chunk 47.71KB / 主包 70.11KB（≤75KB 内）

## v0.165.0 2026-10-05 · BI-13 减负选择（返场横幅扩展，影响先说明）

* 新增 core/load-relief.ts 纯模块：五种减负路径（缩小范围/只做高优先级/只读/休息/重建计划，阻力从小到大有序），每条强制携带对 due/历史的影响说明键；+2 组单测（454→456）
* BI-10 返场横幅扩展减负行：点击选择展开影响说明（aria-expanded + aria-live）——缩小范围/高优先=队列保留无惩罚；只读=不写日志；休息=内核 riff 顺延语义非遗忘；重建=仅作废当日现场且先有可撤销预览。全部只读建议，可跳过不执行
* i18n +11 键（loadRelief 段，zh/en 对齐）；review chunk 32.81KB / 主包 70.08KB 不变

## v0.164.0 2026-10-05 · BI-12 时间预算模式（预算到≠失败）

* 新增 core/session-budget.ts 纯模块：预算预设 5/15/30/60 分钟、平均每卡耗时估计（revlog dur 采样，离群剔除兜底 10s）、剩余倒计时、可完成范围与未完成项估计（口径恒等式：可完成+未完成=剩余总量）；+6 组单测（448→454）
* 「本场偏好」弹层新增预算行（关闭/预设）；头部倒计时 chip（⏳ mm:ss），到点转中性「预算到」chip——不自动结束、不扣目标、剩余卡真实保留队列；完成屏中性提示两种语义（进行中/已到点）
* 本场维度状态（非全局设置、不进 BX-3 覆盖集）；估计仅供参考（文案带「约」，未启用不显示）
* i18n +7 键（review.budget*，zh/en 对齐）；review chunk 32.54KB / 主包 70.08KB 不变

## v0.163.0 2026-10-05 · BU-5 收口（模板注册表接入设置页 + nameKey 防回归）

* 质量缺口修复：v0.116.0 交付的 10 个模板 nameKey **实际全部缺失于 i18n**（注册表休眠无消费方故未暴露）——本批补齐 zh/en 各 10 键 + +1 组防回归测试（每个模板 nameKey 必须双语可解析，447→448）
* 设置页「AI 提示词模板」从 3 个散落 i18n 预设按钮改为注册表驱动下拉（10 模板：通用/考试/语言 + BV 家族 6 件套 + 烂卡改写），选中即写入自定义模板框可再编辑；恢复默认按钮保留——模板单一事实源收口
* 体积：主包 67.61→70.08KB（注册表随设置页入 shell，≤75KB 预算内）；hub/review chunk 不变

## v0.162.0 2026-10-05 · BX-2 W2 卡片人工编辑 + 写前差异预览

* 新增 ui/card-editor.svelte（卡片详情抽屉内嵌，Kit 级可测）：编辑块 markdown → 200ms 防抖差异预览（charDiff LCS 行内 add/del 高亮，400 字预算护栏）→ 确认才 updateBlock 写回；取消/拒绝保留原卡；无改动不可保存；保存失败面板保持可重试；+5 组单测（442→447）
* 卡片详情新增「编辑」入口（editorCtx 可选通道：blockContent 读 markdown / saveBlockContent 写回），保存成功后抽屉预览自动刷新；updateBlock API 封装入 api/siyuan
* 字段级 diff（BX-9 三字段）暂缓：卡片=单块+`==答案==`挖空约定，字段↔块映射需专项设计（登记于 BX-9 条目），本批先交付 W2 人工编辑+整内容差异预览
* i18n +11 键（editor 段，zh/en 对齐）；hub chunk 47.38KB / 主包 67.61KB（≤75KB 内）

## v0.161.0 2026-10-05 · BI-11 多目标取舍（目标优先级分层）

* learning-goal 增 priority 白名单字段（主目标/维持/暂缓，缺省=维持）+ sortGoalsByPriority 分层排序（同层 createdAt 升序稳定，不可变输入）；+2 组单测（440→442）
* 目标页排序切换为优先级分层（纯展示序：不改 due、不写内核、不改调度——验收硬性要求）；每行新增优先级循环按钮（主目标→维持→暂缓），aria-live 播报
* i18n +4 键（goals.priority 3 + priorityTitle，zh/en 对齐）；hub chunk 46.28KB / 主包 67.53KB（≤75KB 内）

## v0.160.0 2026-10-05 · BI-10 长期返场检查横幅（只读预览）

* 复习页签新增返场检查横幅：触发=长间隔（>7 天）或大积压（>100 到期，isLongReturn 阈值单一事实源 +1 组单测 439→440）；四查结果以 chips 呈现（warn 项高亮），「知道了」关闭（仅本次会话，可重复触发）
* 事实聚合入 ReviewCtx（getReturnCheckFacts，只读）：活跃目标数与最近截止（BI-1）、stale/needsRevision 计数（BI-5）、到期数（dueCache）、距上次学习天数（revlog）、时钟回拨检测；聚合失败静默不弹横幅
* 只读语义：不写内核、不改调度、不自动重建——重建影响预览（rebuildImpactPreview 契约）归 BI-28 可撤销批次承接；i18n +17 键（returnCheck 段）
* 体积：主包 67.49KB / review chunk 31.89KB（横幅在 review chunk），≤75KB 预算内

## v0.159.0 2026-10-05 · BI-8 收工原因（done 屏收集 + 恢复横幅随行）

* session-state 增 endReason 白名单字段（目标完成/时间到/精力不足/疑问待解决/手动结束，normalize 清洗 + withEndReason 不可变写入，+3 组单测 436→439）
* 复习完成屏新增五 chips「这次收工的原因？（可跳过）」——点选写入当日现场；「再次开始」新开现场时自动重置
* 中断恢复横幅随行展示「上次收工：…」（不改变四分支语义，辅助返场分流）；PRIVACY 披露同步
* 体积：主包 67.18KB / review chunk 31.35KB（done 屏在 review chunk），预算 ≤75KB 内余量充足

## v0.158.0 2026-10-05 · AT-17 chunk 加载器落地（主包 101.93→67.14KB）

* 机制定案：解剖思源 stage/build 加载器实证——桌面端插件 JS=同步 XHR 文本+内联 script 注入（全局作用域 Node globals），移动端=src script 标签；本插件取 **src script 标签 + window.__lvChunks 注册表**（无 eval/CSP 依赖，与宿主同机制）
* 构建：VITE_CHUNK=hub|review 双模式——独立 IIFE 自带 svelte（挂载与组件同实例，避免双份内部状态 split-brain），siyuan 经 shell 注入 __lvSiyuan 全局；CSS 平铺 chunks/<n>.css 经 link 注入；zip 打包自动含 chunks
* 加载器 libs/chunk-loader.ts：幂等注入（同 chunk 一次）、失败清缓存可重试、缺 mount 导出可诊断报错；+5 组单测（431→436）；dev 模式保留进程内动态导入双路径
* 实测：主包 67.14KB（-34.8KB，启动传输结构性回落）；hub 46.12KB+3.0css / review 31.07KB+2.3css 按需加载；隔离 e2e 扩展 chunk 可服务四断言后 **14/14 通过**；governance ⑨ 第五次修订 ≤102→≤75KB（回降锁定）
* 余项：AI 向导等对话框组件仍在主包（可再切 dialogs chunk）；**渲染进程 script 执行与页签挂载复验待真机**（无头 e2e 覆盖不到，UI 批次解禁以真机走查为准）

## v0.157.0 2026-10-05 · BI-10 长期返场检查（纯模块，零打包增量）

* 新增 core/return-check.ts：返场四查（目标活跃/临期 · 材料过时与待修订 · 积压量与长间隔（阈值 BACKLOG_DUE_WARN=100 / GAP_DAYS_WARN=7）· 设备时钟回拨/跨设备恢复）——全部只读，不写内核不改调度不自动重建；info/warn 分级，健康问题不冒充记忆失败（BI-7 同构）
* rebuildImpactPreview 重建影响只读预览契约：保留=内核 due/revlog（ADR-3）+目标档案+生命周期轨迹，作废=当日会话现场；真正的重建批次归 BI-28 可撤销模拟，本模块不执行
* 返场事实由调用方聚合（本模块不采集）；UI 接线待 AT-17 后批次（+9 组单测 422→431；主包体积零变化 101.93KB）

## v0.156.0 2026-10-05 · BI-3 入口上下文接线（复习会话入口条）

* 三个真实入口记录上下文：面包屑「复习本文档」（doc，返回点=该文档）、考试计划「今日开始」（report，来源=计划 ID，返回点=Hub 考试页签）、manager 内容状态面板「正式复习/练习」（card，返回点=Hub 管理页签）——upsert 落盘 entry-contexts.json，取消/重开不丢
* 复习面板头部入口条：入口类型 i18n 展示（不裸露内部枚举）+「返回」直达返回点（doc:/hub: 两协议）+「×」显式清除（唯一删除路径；7 天 TTL 由 normalize/isContextFresh 兜底）
* 重开恢复：复习页签无 entry 数据时按当前范围回退取最新未过期记录，上下文条自动重现
* 体积压线：主包 gzip 101.93KB（≤102KB 预算，余量 0.07KB——下一 UI 批次前须启动 AT-17 chunk 加载器）

## v0.155.0 2026-10-05 · BI-5/6/7 内容状态面板（manager 卡片详情接线）

* 新增 ui/lifecycle-panel.svelte（卡片详情嵌入，BI-5/6/7 三模块首个 UI 消费方）：状态 chip + 「为什么」解释与直达修复（BI-7 explainState，resume/unarchive 修复=生命周期转移）+ 下一动作建议 chips（BI-6 nextActions，可跳过不自动执行；宿主映射到真实入口：回来源/解释/修订→打开原文档，制卡→AI 向导（成功自动记 candidate→reviewed→stocked 合法链），正式复习→复习页签，练习→突击模式，收工→关详情）+ 状态流转按钮（BI-5 合法目标集，转移必带预设原因）+ 轨迹倒序清单
* 显式开档语义：详情打开仅读快照，浏览不隐式建档；「开档记录」按钮创建 source 起点并落盘
* manager ctx 新增 lc 通道（snapshot/open/transition/openReview/makeCards）；转移经既有 transitionContentState（校验+落盘一体）
* i18n +28 键（lc 段：state×10 + reason×11 + 面板文案×7，zh/en 对齐）；+9 组面板单测（413→422）
* AT-14 预算第四次修订 ≤101→≤102KB：本批 +1.5KB（101.25KB 实测），与 E2E-1 性能实测（LCP 0.84-1.40s/INP 16-72ms）时量级同档；结构性回落仍归 AT-17 chunk 加载器（后续 UI 批次前置）

## v0.154.0 2026-10-04 · BI-1 目标向导 UI（Hub「目标」页签）

* 新增 ui/goals-page.svelte（Hub 内「目标」页签，懒加载）：目标卡表单（六目的/截止日期/每日分钟/水平）+ suggestedMinutes 建议 + 目标列表（活跃/已过期 chip + 截止倒计时 + 删除确认）——只记录目标不强迫建卡
* 插件侧 goals 通道（get/save upsert 自动生成 id/remove）+ saveLearningGoal/removeLearningGoal 落盘 learning-goals.json
* 品质线对齐：LvPage 页头计数 + LvChip 状态 + LvEmpty 引导 + confirmDialog + aria-live 播报
* i18n +50 键（hubTabGoals + goals 24×2，754→804 对齐）；主包 gzip 99.72KB（≤101KB，AT-17 chunk 加载器为下批前置）
## v0.153.0 2026-10-04 · BI-2/BI-9 复习面板接线（目的选择器 + 恢复分支）

* BI-9 恢复分支：有当日现场时头部横幅四选一（继续原场/只看摘要/缩小范围/结束），跨天/零进度/队列空禁用语义由 session-recovery 纯模块判定（首刷回填队列数）；评分/跳过=隐式续场自动收横幅；结束=清现场重开，全程不自动重复评分/写卡
* BI-2 目的选择器：头部六目的下拉 + 结束条件 chip 随目的切换；完成屏评分口径随目的——informal 只鼓励不庆祝每日目标，formal 维持原庆祝
* 测试基建：big-library 计时断言加负载因子校准（实测基线循环等比放大预算封顶 8x）——重负载机器（并行内核/构建）不再误报，O(n²) 回归依然必爆
* i18n +10 键（744→754 对齐）；主包 gzip 98KB（≤101KB）
## v0.152.0 2026-10-04 · BX-10 收件箱事件自动刷新

* 插件侧：inboxListeners 监听器组 + subscribeInbox/notifyInboxChanged——块菜单收集、通道增删改、送去制卡成功清理后全量通知
* 收件箱页  订阅变更自动同步快照（E2E-2 登记的手动 ⟳ 兜底退役，按钮保留作手动手段）
* badge 评估结论：不加——顶栏 badge 语义=到期数（440 心跳），混入筛选计数会稀释语义；待筛选数已在收件箱页签与页头常显
* BX-10 代码完成待真机勾选
## v0.151.0 2026-10-04 · AT-15 体积决策落地（压缩器实测定案 + 预算挂钩性能实测）

* 压缩器实测：terser 5.51（toplevel mangle + drop_console）98.41KB 不敌 esbuild 96.97KB——维持 esbuild，terser 移除
* 预算第三次修订 ≤98→≤101KB 且与真机性能实测挂钩（E2E-1：LCP 0.84-1.40s / INP 16-72ms 良好，非无据放宽）；为 UI 接线批次留位
* 结构性回落方案登记为 AT-17：自研 chunk 加载器（内核 HTTP 服务插件资源已实证 GET /plugins/... 200，可绕开 require shim，预算可回落 ≤60KB 量级）
* AT-15 勾选（194 done）；governance 935 条
## v0.150.2 2026-10-04 · 隔离式后台 e2e 框架（AT-16 主体交付）

* 新增 scripts/e2e-isolated.mjs：临时工作区+无头内核（独立端口）+自动部署插件+setPetalEnabled 启用+内核 riff 全回环断言（建笔记本/文档/卡包/制卡/到期/评分/队列消费）+自动拆卸；--keep 保留环境供 UI 走查，--ui 尽力拉窗口
* 与其他思源实例并行实证互不影响（在 2 个既有内核运行时跑通 10/10）；修复 e2e-launch.ps1 独占模式风险警示（不再误杀并行会话）
* AT-16 主体完成，余 UI 实例自动化部分
## v0.150.1 2026-10-04 · 收件箱 UI 对齐设计品质线（真机走查修复）

* 真机走查发现：筛选 chips 显示 undefined (0)——labelKey 用了平铺键查找而 i18n 为嵌套对象；改 t[...] 并全部经 t 派生
* 品质线对齐 manager 页（可超不低于）：LvPage 页头（四状态计数摘要）+ LvSegmented 筛选/全选/刷新入 actions + 毛玻璃批量条（LvChip 计数 + 按上下文出按钮 + 取消选择）+ 行级 LvSkeleton 标题加载（失败回退短 ID）+ LvEmpty 空态 + LvLive 读屏播报（AS-4）+ 行 hover 升起/侧条样式 + 320px 换行
* 破坏性操作接 confirmDialog（彻底删除需确认）；批量结果 showMessage + aria-live 双通道
* 新增行内「打开来源」（BI-6 openSource）：SQL 查 root_id 锚点打开，失败退化块 ID
* ctx 新增 openSource；i18n +9 键（726→744 对齐）
## v0.150.0 2026-10-04 · BI-4 收件箱→制卡管线闭环

* 收件箱「已选中」页新增「送去制卡」：拉取选中块文（分批 SQL，引号转义）拼接为向导材料，一键开 AI 制卡向导
* 制卡成功回调：自动清收件箱（removeInboxItem）+ 记内容生命周期合法链（source→candidate→reviewed→stocked，向导逐张 keep/reject 即审核）；失败不影响制卡结果
* openAIWizard 扩展可选 onCreated 回调（既有调用方不受影响）；收件箱页新增「刷新」按钮（对话框关闭后手动同步快照）
* i18n +8 键（sendToCards/refresh/refreshedNotice/emptySource ×2，710→726 对齐）；主包 gzip 96.64KB（≤98KB 内）
## v0.149.1 2026-10-04 · CI 体积门禁修复（陈旧 32KB 硬编码）

* 发现：main 分支 CI 自 v0.125.0 预算首次修订后持续失败——ci.yml 内独立硬编码 32KB gzip 门禁未随预算修订更新（本地 governance 已两次修订，CI 侧漏改）
* 修复：ci.yml build 后置步骤改为复用 check-governance.mjs（⑨ 门禁单一事实源，build 后 dist 已在真正生效）
* v0.149.0 tag 发版未受影响（release workflow 无该门禁）
## v0.149.0 2026-10-04 · BI-4 收件箱筛选 UI + 块菜单收集入口

* 新增 ui/inbox-page.svelte（Hub 内新「收件箱」页签，懒加载 chunk）：四状态分段筛选（待筛选/暂存/已选中/已淘汰）+ 多选批量操作（暂存/选中/淘汰/退回/撤销选中/恢复/彻底删除）+ 块标题异步解析（content 首行，失败回退短 ID）
* 块菜单新增「加入材料收件箱」（多选支持 ×N 计数；只读收集不产生 due；inbox 模块开关联动）+ modules 注册表新增 inbox 模块（defaultOn）
* index.ts 收件箱通道：快照进、变更出+落盘（UI 无直改存储权）
* AT-14 预算第二次修订 ≤95→≤98KB 并留痕（BI-4 UI 纳入后 96.31KB；单文件约束下懒加载仅延迟执行；上游 shim 修复恢复真分包可回落）
* i18n +36 键（hubTabInbox + modules.inbox×2 + inbox 15×2 + 菜单 3×2，674→710 对齐）
## v0.148.0 2026-10-04 · BI 系列存储接线收官（learning-goals/entry-contexts/content-lifecycles）

* learning-goals.json / entry-contexts.json / content-lifecycles.json 并入 STORE_KEYS 批量加载 + 三个 saveX 落盘入口 + storageStats 行 + PRIVACY 披露
* content-lifecycle.ts 补集合层：normalizeLifecycles（去重/剔除/空兜底）+ ensureLifecycle（同 blockID 幂等开档）+ transitionContentState 校验落盘一体入口
* +2 组集合层测试（411→413）；主包 gzip 94.74KB（≤95KB 内，余量收紧需盯）
## v0.147.0 2026-10-04 · BX-9 字段级 diff 预览与逐项采用（纯模块）

* 新增 core/field-diff.ts：三字段（问面/答案/解释）差异检测 + LCS 行内高亮片段（same/add/del 合并，400 字符预算护栏超限整段替换）+ applySelections 逐字段采用 + 全拒绝等价取消（结果深等于原卡，拒绝即保留不静默替换）
* 纯前端 diff 流转：不产生正式评分、不外发（验收硬性要求）；AI 改写意图/生成归 BX-2 走 G3-call
* +8 组测试（403→411）；主包 gzip 94KB（≤95KB 内）
## v0.146.0 2026-10-04 · BI-1 目标模型 + BI-3 入口上下文（纯模块，BI 系列地基收官）

* 新增 core/learning-goal.ts：目标模型（目的/截止/材料/每日可用分钟/水平自评）——可只记录目标不强迫建卡（验收口径）；normalize 白名单清洗 + daysUntilDeadline/isGoalActive + suggestedMinutes 目的×水平推荐
* 新增 core/entry-context.ts：入口上下文（六入口类型×来源/范围/目标/返回点）——upsert 刷新/find 恢复/remove 清除 + JSON 往返无损（取消/重开不丢上下文）+ 7 天新鲜度
* BI 系列纯模块地基至此收官：BI-1/2/3/4/5/6/7/8/9 全部有可测核心，UI 接线按批次跟进
* +10 组测试（393→403）；主包 gzip 94KB（≤95KB 内）
## v0.145.0 2026-10-04 · BI-7 状态转移解释 + BI-9 中断恢复分支（纯模块）

* 新增 core/state-explain.ts：十态「为什么+直达修复」映射（stateWhy i18n 键+repair 动作）+ whyNotReviewable 内容侧不可复习原因专项（调度侧属内核 riff ADR-3）
* 新增 core/session-recovery.ts：中断恢复四分支（继续原场/只看摘要/缩小范围/结束）可用性推导——跨天失效/零进度/队列空三种禁用语义，结束永远可选，不自动重复评分/写卡
* i18n +46 键（stateWhy 16×2 + recovery 7×2，628→674 对齐）
* +7 组测试（386→393）；主包 gzip 94KB（≤95KB 内）
## v0.144.0 2026-10-04 · BI-5 内容状态机 + BI-6 下一动作建议（纯模块）

* 新增 core/content-lifecycle.ts：十态内容生命周期（source→candidate→reviewed→stocked→inReview→applied / needsRevision / paused / stale / archived），合法转移表 + 转移必带原因与时间 + normalize 白名单清洗（非法轨迹逐条剔除，末态取最后合法轨迹）+ lifecycleStats 分组统计；学习侧调度仍由内核 riff 独占（ADR-3），双状态机分开记录
* 新增 core/next-action.ts：按内容状态推导有序建议（回来源/解释/制卡/练习/正式复习/修订/收工），7 动作全覆盖无死动作，建议可跳过不自动执行
* i18n +14 键（nextAction 7×2，614→628 对齐）
* +14 组测试（372→386）；主包 gzip 94KB（≤95KB 内）
## v0.143.0 2026-10-04 · BI-2 目的驱动会话入口（纯模块）

* 新增 core/session-purpose.ts：六目的档案（探索/构建/复习/练习/应用/维护）× 结束条件 × 评分口径（review/maintain=formal 计入正式统计，其余 informal 不占每日目标；调度仍由内核 riff 独占 ADR-3）
* purposeProgress：进度计算（remaining 型=到期清空即完成；targetOverride 覆盖默认目标；无量化目标转 BI-8 endReason 收工）
* i18n +12 键（zh/en purpose 对象 6×2，602→614 对齐）
* +8 组目的测试；测试 364→372；主包 gzip 94KB（≤95KB 内）
## v0.142.0 2026-10-04 · BI-4 材料筛选收件箱（纯模块 + 存储接线）

* 新增 core/inbox.ts：材料块筛选状态机（inbox → staged → selected / dismissed），批量确认可撤销（undoSelection 打回 staged）
* addInboxItem 按 blockID 去重；normalizeInbox 白名单清洗（非法状态回 inbox、重复块去重）
* 存储接线：inbox.json 并入 STORE_KEYS 批量加载（zipLoaded 位置配对）+ saveInbox 落盘入口 + storageStats 行 + PRIVACY 披露（只存块 ID 不存内容）
* +8 组收件箱测试；测试 356→364；主包 gzip 94KB（≤95KB 内）
## v0.141.0 2026-10-04 · G3-call 嵌套数组解析修复 + AI 管线端到端验证

* G3-call 真实模型发现：glm-4-flash 返回嵌套数组——parseCards 无法解析（得 0 卡）
* 修复：parseCards 添加 flatMap 展平嵌套数组
* G3-call 端到端管线验证通过
* +2 组嵌套数组测试；测试 354→356
## v0.140.0 2026-10-04 · BJ-2 提示级别指示器 + 代码清理

* hintLevelText()：提示文本区域显示当前级别位置（如 1/2）
* 清理未使用导入（HINT_LEVELS/buildSummary）
* 341/341 测试；0 errors/0 warnings
## v0.139.0 2026-10-04 · BJ-2 full 级行为修正（即翻面）+ AS-4 保存成功播报接线

* BJ-2 行为修正：full 级=即翻面（showAnswer=true 并重置提示状态），此前 full 级展示全文为 hint text 与设计意图不符
* AQ-4/AS-4：persist 恢复提示接入 trackSave（hadPersistFail→onOk 展示 settingsSaved）
* 354/354 测试；0 errors/0 warnings
## v0.138.0 2026-10-04 · BI-8 done 屏建议集成 + BJ-2 提示内容推导接入

* done 屏新增建议消息（buildSummary 推导：目标达成 🎉 / 有进度 💪 / 空态无消息）
* BJ-2 advanceHint 接入 deriveHintLevels（v0.133.0 纯函数，替代此前硬编码截取）
* i18n +1 键（doneProgress，603 对齐）；354/354 测试；0 errors/0 warnings
## v0.137.0 2026-10-04 · BJ-4 日期清理 + BI-8 会话收工摘要（纯模块）

* error-reasons.ts normalizeErrorTags 新增 30 天保留清理（超期旧标注自动清理防无限增长）+ 2 组清理测试
* 新增 core/session-summary.ts（BI-8）：buildSummary 构建会话收工摘要（统计+进度 pct+suggestionKey 建议推导）+ 4 组单测
* 测试 348→354；0 errors/0 warnings

## v0.136.0 2026-10-04 · 测试覆盖补强：BJ-4 normalizeErrorTags + AS-4 LvLive

* 复习面板问题态新增 h 键快捷推进分级提示
* 帮助覆盖层新增 h 键说明
* i18n +1 键（helpHint，602 对齐）
## v0.135.0 2026-10-04 · AQ-4 恢复可观测 + AS-4 收尾

* persist 队列新增失败→恢复跟踪：onFail 置位 hadPersistFail，下次 onOk 展示「保存成功」提示确认恢复（此前失败后静默恢复用户无感知）
* AS-4 勾选（基础版+保存成功播报均已接入 LvLive/review 面板）
* 341/341 测试；0 errors/0 warnings；主包 gzip 92.58KB（≤95KB 内）
## v0.134.1 2026-10-04 · BJ-4 标注标签国际化修复

* 修复：BJ-4 错误原因标注 chips 标签此前硬编码中文（英文用户看到中文标签），改为 i18n errReasons 段引用
* 335/335 测试；0 errors/0 warnings

## v0.134.0 2026-10-04 · BK-1↔BJ-2 集成：知识对象事实优先作提示内容

* review ctx 新增 getKOBySource（按来源块查知识对象 fact+capability）
* advanceHint 改为 KO 优先：有知识对象时 recall-target/keyword=KO fact（精准），无知识对象时 deriveHintLevels 文本推导兜底
* BK-1（知识对象）与 BJ-2（提示阶梯）形成数据闭环：快速制卡→自动注册→复习时提示内容更精准
* 341/341 测试；0 errors/0 warnings
## v0.133.0 2026-10-04 · BJ-2 提示内容推导：从卡面文本自动生成分级提示

* 新增 deriveHintLevels 纯函数：从卡面纯文本自动推导 HintLevelsInput（无需预标注）
* 推导策略：explanation=第一句完整句、keyword=粗体/高亮标记内容或前 30%、full=全部文本
* review.svelte advanceHint 改用推导结果（此前硬编码前 30 字符）
* 6 组推导单测；测试 335→341；0 errors/0 warnings
## v0.132.0 2026-10-04 · BJ-4 仪表盘错误原因分布

* dashboard ctx 新增 getErrorReasonStats（errorReasonStats 全量累计，>0 过滤）
* 总览新增「错误原因分布」LvSection（七类原因本地化标签 + 计数；无标注时区块隐藏）
* AT-14 勾选（门禁 ⑨ 生效 + 预算修订达成）；i18n errReasons 段 10 键（601 对齐）
* 335/335 测试；0 errors/0 warnings；governance OK（931 条）
## v0.131.0 2026-10-04 · BJ-4 标注 UI + error-tags.json 存储接线

* review.svelte 遗忘评分后显示七类错误原因 chips 行（旁路增强：点选即标注并隐藏，不阻塞下一张；ctx 注入 tagErrorReason）
* error-tags.json 入 STORE_KEYS 批载 + normalizeErrorTags 白名单清洗 + saveErrorTags persist 方法；PRIVACY 披露 + 存储体检 +2 行
* i18n +1 键（errTagPrompt，592 对齐）；335/335 测试；0 errors/0 warnings；governance OK（931 条）
## v0.130.0 2026-10-04 · BJ-2 复习面板提示集成：hint 按钮 + 阶梯展示 + 日志

* review.svelte 集成 BJ-2 提示阶梯：问题态新增「提示」按钮，点击逐步揭示提示文本（从卡面 HTML 剥离标签后取前 30 字符为 keyword 级，full 级翻面）
* 提示日志追加（hintLog：cardID+level+ts）；翻卡/切卡时自动重置
* 提示文本样式：左侧主色竖线+底色（区别于卡面内容）
* 设计约束：提示不自动提交评分
* i18n +1 键（hintBtn，591 对齐）；335/335 测试；0 errors/0 warnings；主包 gzip 91.49KB（≤95KB 内）

## v0.129.0 2026-10-04 · BJ-4 错误原因分类（纯模块）

* 新增 core/error-reasons.ts：七类错误原因（记忆空白/概念混淆/条件遗漏/步骤错误/题面不清/来源过时/注意力中断）+ tagError 同卡同日覆盖（可改选）+ errorReasonStats 分类计数（日期过滤）+ errorTagCoverage 遗忘卡标注覆盖率
* 设计约束：标注为评分后可选旁路动作（不阻塞评分主流程）；跨日独立记录
* 7 组单测；测试 328→335；0 errors/0 warnings

## v0.128.0 2026-10-04 · BJ-2 分级提示阶梯（纯模块）

* 新增 core/hint-ladder.ts：五级阶梯（recall-target→keyword→context→explanation→full）+ 稀疏阶梯（缺失级别自动跳过，full 兜底=即翻面）+ 循环回首 + nextHint 下一级推进 + HintLogEntry 追加日志 + hintStats（提示次数/去重卡数/最深级别）
* 设计约束：提示不自动提交评分（纯逻辑返回，调用方决定展示与记录）；提示内容来源=知识对象/卡片可选 levels 字段
* 8 组单测；测试 320→328；0 errors/0 warnings

## v0.127.0 2026-10-04 · BJ-1 统计分栏：dashboard 能力分布

* dashboard ctx 新增 getCapabilityShare（基于已登记知识对象实例的 capabilityShare 排序）
* 总览新增「能力分布」LvSection（八类+unspecified 桶，计数+占比；无实例时区块隐藏）；i18n capability 段 3 键（590 对齐）
* AT-14 勾选（验收修订版达成：门禁 ⑨ 生效 + 主包 91KB ≤ 95KB 新预算）
* 320/320 测试；0 errors/0 warnings；governance OK（931 条，192 done）
## v0.126.0 2026-10-04 · BK-1 UI 收官：ko-panel 修订模式 + 快速制卡自动注册

* ko-panel 新增修订模式：「修订事实」→ 编辑框（实例清单保持可见，受影响实例一目了然）→ 保存回调携带新事实；未传 onrevise 不显示按钮（宿主可选）
* 快速制卡自动注册知识对象：创建成功后 fact=问题文本登记对象（来源=新建块）+ 查 riff 卡 ID 派生问答实例（旁路增强：失败不影响制卡主流程）；onCreate 签名扩展 q/a
* i18n +4 键（588 对齐）；修订模式 2 组单测；测试 318→320；0 errors/0 warnings；主包 gzip 90.75KB（≤95KB 预算内）

## v0.125.0 2026-10-04 · AT-12/14 定案：正线切单文件构建 + 预算修订

* **正线构建切单文件**（vite.config.ts output.inlineDynamicImports）：require shim 源码铁证（common.js `xe=ut=>ut==='siyuan'?ge():window.require?.(ut)`——相对路径基准丢失为结构性缺陷，多插件间歇实证），多 chunk 形态废弃；vite.config.inline.mjs 与 .tmp 部署脚本清理（正线即单文件）
* AT-14 验收修订：32KB 旧预算基于多 chunk 假设作废；新预算 **主包 gzip ≤95KB** 纳入 check-governance 门禁 ⑨（dist 存在即强制，当前 90.4KB）；瘦身手段转长期观察
* Hub 懒加载代码保留（单文件下 import() 内联为同步解析，无害且为上游 shim 修复后恢复懒加载留路）；真机复验：闪卡中心完整渲染（里程碑/True Retention/周期对比全部出数）
* 测试 318/318；0 errors/0 warnings
## v0.124.0 2026-10-04 · BK-1 制卡派生 UI：知识对象面板 + 详情抽屉嵌入

* 新增 ko-panel.svelte（props 注入可测）：核心事实展示 + 实例清单（停用开关翻转/移除）+ 派生下拉（自动排除已有卡型；deriving 禁用态）；5 组组件单测
* card-detail 嵌入知识对象区：未注册显示「注册为知识对象」（fact=块文本），已注册显示面板；manager koCtx 注入（快照/注册/停用/移除/异步派生——派生查 getRiffCardsByBlockIDs 取 riff 卡 ID）
* i18n ko 段 22 键（584 对齐）；测试 313→318；0 errors/0 warnings
* ⚠️ 主包 gzip 32.05KB 破自设 32KB 预算：登记 AT-14 回降计划（门禁未 CI 化，治理缺口同记）
## v0.123.0 2026-10-04 · BK-2 UI：关系查看/新建/删除面板

* 新增 relations-panel.svelte（Kit 级 props 注入可测）：双向视图（→/←方向标注）+ 七类关系本地化 + 新建表单校验（目标必填/拒自环）+ 逐行删除；4 组组件单测
* card-detail 抽屉嵌入关系区（manager ctx 注入 relationsOfBlock/addRelation/removeRelation，旧宿主缺省不显示）；管理器删卡同步 detachCard 端点清理
* 实体 id 口径声明：当前=块 ID（core/card-relations.ts 头注）；i18n +15 键（546→561）
* 测试 309→313；0 errors/0 warnings；主包 gzip 30.21KB
## v0.122.0 2026-10-04 · BK-1/BK-2 存储接线：知识对象与关系图入列插件私有数据

* knowledge-objects.json / relations.json 并入 STORE_KEYS 批量加载（AQ-1 同模式）+ normalize 白名单清洗 + persist 保存方法（saveKnowledgeObjects/saveCardRelations，重试与失败记录由队列承担）
* 存储体检新增两行（BK-1/BK-2 计数）；docs/PRIVACY.md 披露两文件（治理门禁 ⑦ 拦截后补齐，机制有效）
* BK-1/BK-2 的 docs/17 注记更新：存储接线完成，余验收=制卡/修订 UI 与关系查看 UI
* 309/309 测试；0 errors/0 warnings；governance OK

## v0.121.0 2026-10-04 · BK-2 卡片关系图（纯模块）

* 新增 core/card-relations.ts：七类关系（兄弟/前置/示例/反例/来源/应用/替代）——normalize 清洗（自环/坏边/重复剔除）、addRelation 去重建边、removeRelation 删边、relationsOf 双向视图、detachCard 内核卡删除端点清理
* 纯元数据定位：不改变内核 due/间隔，绝不产生第二调度器（BH-3 口径）；仅手工建边不自动推理
* 6 组单测；测试 303→309；0 errors/0 warnings
## v0.120.0 2026-10-04 · BK-1 知识对象与卡实例分离（纯模块）

* 新增 core/knowledge-objects.ts：KnowledgeObject（核心事实 + N 题型卡实例）模型——实例挂内核 riff cardID（卡片身份归内核），对象用 ko- 私有 id；存储设计小节在模块头（knowledge-objects.json，persist 队列同口径）
* 操作集：normalize 白名单清洗（坏对象剔除/同 id 去重/fact 500 截断）、deriveInstance 幂等派生、affectedInstances 含停用全列（核心事实修订的影响面）、toggleInstance 单变体独立停用、removeInstance 内核删除同步
* 7 组单测；测试 296→303；0 errors/0 warnings；存储接线与制卡/修订 UI 归后续批
## v0.119.0 2026-10-04 · 数据模型主线开工：BH-4 卡型目录 + BJ-1 能力类型分类法

* 新增 core/card-catalog.ts（BH-4）：14 卡型声明式目录——阶段（shipped 七项/planned 七项）×调度映射（native 正式调度 vs practice 练习模式）×降级路线（degradationRoute 防环解析，audio→dictation→typing 两级示范）；5 组单测（id 唯一/降级目标存在/无环/shipped 集合/调度口径）
* 新增 core/capability-types.ts（BJ-1）：八类能力常量 + 严格归一（未知归 unspecified 不猜测）+ 分组计数/占比排序（分母透明）；4 组单测
* 与 card-types.ts 动态判分注册表分工：目录=能力/阶段/降级声明，判分实现仍走 registerCardType（ADR-3）
* 测试 287→296；0 errors/0 warnings
## v0.118.0 2026-10-04 · 文档三件套收官：模块所有权与事实源（AX-1/BH-3/BH-13 勾选）

* 新增 docs/37-模块所有权与事实源.md：§1 模块所有权表（13 功能域 × 事实源/读写入口/事件/诊断面）+ §2 事实源映射七类归属（调度内核唯一 ADR-3 铁律）+ §3 双写与失效钩子顺序契约 + §4 待办治理现状 + §5 已知边界
* 勾选 AX-1/BH-3/BH-13（三个 P1）：「不存在两个模块同时拥有正式 due/评分」验收达成
* docs/README 索引补 37 号；governance OK（930 条，192 done）
## v0.117.0 2026-10-04 · BU-12 输出 schema 注册表

* 新增 core/ai-schemas.ts：8 输出形态 schema（cards-json/scan/clarify/route/split/leak/distractor/rewrite，与 prompt-templates output 对接口径）
* validateRows 宽容收敛校验（AJ5 同口径）：类型可收敛则收敛（数字字符串→数值/任意→string）、required 缺失记入 errors 不静默吞、坏行跳过、可选字段类型不符省略；7 组单测
* 测试 280→287；0 errors/0 warnings
## v0.116.0 2026-10-04 · BU-5/BV 提示词模板注册表

* 新增 core/prompt-templates.ts：10 模板注册表（generic/exam/language 三预设迁移 + BV 家族 7 新模板：教学价值扫描/目标澄清/卡型路由/原子拆解/反泄漏/干扰项/烂卡改写）
* renderTemplate 占位符渲染（未提供变量保留原样可预检）+ missingInputs 上下文完整性预检（BU-6 预算器对接口径）+ output 形态声明（BU-12 schema 对接口径）
* i18n nameKeys 7 键（539→546）；6 组单测；测试 274→280；0 errors/0 warnings

## v0.115.0 2026-10-04 · BU-20 黄金样本评测集（离线子集）：九类卡型契约

* 新增 tests/golden-samples.spec.ts：问答/挖空/语言/表格/代码/公式/长材料/冲突来源/脏输出九类脱敏 fixture，钉死 parseCards+lintAICards 输出契约（未来换模型/提示词的回归基线）
* 契约要点：围栏与噪声容忍、cloze/LaTeX/代码缩进逐字符保真、冲突来源不合并留用户裁决、脏输出丢弃口径（空卡丢、坏难度丢标注不丢卡、字符串难度收敛）、token 估算有界
* 测试 263→274（黄金 11 组）；0 errors/0 warnings

## v0.114.0 2026-10-04 · AX-2 事件契约版本化 + AQ-16 解析上限

* 勾选 AX-2（P1）：新增 libs/events.ts 事件契约单一事实源——LV_EVENTS 事件名常量（6 事件）+ builders（plugin/v=1/ts 毫秒统一填充，payload 只增不改约定）+ 幂等键构造注释；index.ts 全部 emit/on 迁移（裸字符串清零，含此前遗漏的 gateway-changed）；4 组契约单测
* AQ-16 补解析上限（PARSE_LIMITS）：单次 50 卡封顶、q≤500/a≤2000 字符超限丢弃；+2 组单测
* 测试 257→263；0 errors/0 warnings；governance OK（930 条，189 done）
## v0.113.0 2026-10-04 · AS-4 读屏播报基础版：LvLive + 复习四路接线

* 新增 kit/LvLive：aria-live 读屏专用组件（polite→status / assertive→alert，视觉隐藏不扰布局）
* review 四路播报：评分提交/跳过/队列加载 n 张（polite）、评分错误（assertive 透传 friendlyError）
* AQ-4 复核：persist onFail→30s 限流 toast+诊断+lvLog 链路 v0.95 起已闭环，本条余验收仅剩无 unload 退出模拟（真机项）
* i18n 536→539 键；257/257 测试；0 errors/0 warnings
## v0.112.0 2026-10-04 · AS-9/AS-10 可访问性：键盘模型与表单标签关联

* LvTabs（AS-9）：左右/Home/End 键盘模型（WAI-ARIA Tabs 惯例）+ roving tabindex + 唯一 id 契约 lv-tab-{id}（宿主据此 aria-controls 关联面板）+ type=button；3 组键盘单测
* LvSegmented（AS-9/10）：radiogroup ariaLabel + 左右/上下箭头切换
* LvRow（AS-10）：控件 label 包裹隐式关联（点击标签聚焦控件，display:flex 保持布局）
* LvSwitch/LvInput/LvSelect（AS-10）：ariaLabel 透传（无可见标签场景必配）
* 测试 254→257；0 errors/0 warnings
## v0.111.1 2026-10-04 · AR-8 错误态优先级矩阵落地

* dashboard：首次加载失败不再同时出现「空库→引导」误导与全 0 统计卡——错误+重试独占；有旧数据时横幅叠加旧值可见
* exam-page：卡组/笔记本列表双路加载失败时错误横幅可重试（单路失败降级为可用子集），不再静默空下拉
* review/manager 核查已合规（else-if 链保证错误优先于空态）；i18n +1 键（exam.loadFailed）
* 已知抖动：大库性能基准测试在多负载并行下偶发超时（重跑即过），后续如复发改串行或加自适应预算

## v0.111.0 2026-10-04 · AT-6 性能指标：启动/首交互/评分埋点 + P50/P95 诊断

* 新增 src/libs/perf.ts 纯模块：markStart（onload 首行）/markLayoutReady（onLayoutReady）/评分采样（复用 AQ-13 dur 漏斗，appendRevlog 单点接入）/p50-p95 线性插值/50 样本环形上限/diagLines 诊断段（persist/due cache 段同位，含冷热启动标记，onboarded 判定）
* 修复实现边界：t0=0 为合法时间戳（performance.now 从 0 起），改 started 标志位判定；P50/P95 预算为开发机参考值非 SLA，超预算仅诊断标注不阻断
* 测试 244→254（perf 10 组：百分位数学/状态机/采样上限/诊断输出）；0 errors/0 warnings；主包 gzip 28.04KB

## v0.110.3 2026-10-04 · 第一梯队微项清零：AT-4 收尾 + AQ-23 契约测试

* AT-4 收尾（P1）：管理器 getDueBlockIDs 改走共享 due 缓存（与 badge/总览合并请求，扇出清零）；dueCache.stats()（hits/misses/coalesced）接入诊断面板 persist 段同位展示——AT-4 验收测量工具齐备
* AQ-23（P3）勾选：新增 tests/personas.spec.ts 4 组画像预设数据契约（modules 键 ∈ MODULE_DEFS 注册表、核心模块开启、params 经 normalizeSettings 同口径校验、id/i18n 键完整）——core 目录纯模块测试覆盖收官
* 测试 240→244；0 errors/0 warnings；governance OK（930 条，188 done）

## v0.110.2 2026-10-03 · 真机验收首轮：openTab 修复 + 加载兼容性处置

* **修复（真机发现）**：openTabOf 调用已被移除的 Plugin 实例方法 openTab——思源 3.8.6 上点击顶栏/菜单/命令入口即抛 "this.openTab is not a function"，页签无法打开；改用模块级 openTab 函数 + custom 页签契约（id=plugin.name+type 无分隔符连写，与 addTab 注册键一致）。该 bug 经 `as any` 绕过类型检查、单测桩环境无法覆盖，由真机 e2e 首轮捕获
* **加载兼容性处置**：3.8.6 真机上多 chunk CJS 产物出现 require 相对 chunk 失败（同机构建的其他插件正常，文件哈希逐字节一致仍失败，根因待查，登记待办）；真机验收改用单文件内联产物（inlineDynamicImports，282KB/gzip 88KB）
* 真机环境证据：思源 3.8.6 桌面端加载、启用、onboarding 完成落盘 settings.json、示例卡组创建（AR-4）；DevTools 性能面板 LCP 0.84s / INP 16ms（AT-6 素材）
* 已知内核行为：getRiffDueCards 全局（deckID=""）对自建卡包新卡返回 0（卡组维度正常返回）——全局角标/复习范围受影响，登记待办

## v0.110.1 2026-10-03 · 兜底巡检：排版减号判分修复 + due 缓存跨代击穿修复

* **打字判分修复（BX-1）**：排版减号 U+2212 无 NFKC 兼容分解、属符号类被宽松判分剥离——"−1"（公式/多数输入法）失去符号变 "1"。归一化补排版减号→ASCII 减号折叠；+3 组测试（−1≡-1、−1≢1、全角减号/加号折叠保留）
* **due 缓存修复（AT-4）**：invalidate 时若有在途请求，新读取会合并到旧代请求且旧结果按当前代落缓存（15s TTL 内读到评分前旧值，击穿「评分后即拉新」）。在途请求带代际标记：跨代不合并、旧代结果不落缓存、只清自己的槽位；+1 组回归测试
* 「本场偏好」提示补顺序类覆盖生效时机披露（评分制/超时即时生效，倒序自下一批队列生效）
* 待办登记：BX-8 本场范围预设（BX-3 W4 拆出）、BX-9 字段级 diff 预览（BX-2 W2 前置拆解）；AO 区新增 Anki Custom Study / 打字判分与 Obsidian SR cram 调研结论（各注明可借鉴与不采纳理由）
* 测试 236→240；0 errors/0 warnings；governance OK（927 条目，187 done）

## v0.110.0 2026-10-03 · AT-5 大库基准 + revlog O(n²) 热点修复

* **性能修复（appendRevlog 首评判定 O(n²)→O(1)）**：卡历史判定原对全量 entries 做线性扫描，5 万条写入需 13.5s+；改为 WeakMap 缓存 Set（按数组身份自动失效）+ 截断改 splice 原地裁剪（slice 重建数组会让 2 万条上限后每次 append 触发 O(2万) 缓存重建）；50k 全链路 13.5s → ~4s
* 新增 tests/big-library.spec.ts（AT-5 离线子集，6 组规模预算）：1k/10k/50k 条全链路（写入+重算+聚合+leech+覆盖+CSV）、10k normalize 加载路径、打字判分恒定耗时、1 万条会话状态清洗；规模档测试显式 vitest 超时防 CI 并行波动
* 真机报告（固定设备/思源版本/UI 面板路径）仍归 docs/17 AT-5 本条
* 测试 230→236；0 errors/0 warnings；governance OK

## v0.109.0 2026-10-03 · AT-4 due 请求扇出收敛：generation + 短 TTL 共享缓存

* 新增 src/libs/due-cache.ts 纯模块（createDueCache）：同 scope 并发请求合并为一次（in-flight 去重）、TTL 内复用、invalidate 提升 generation 使旧代条目立即失效、失败不缓存（下次读取即重试）、LRU 有界防泄漏（6 组单测覆盖全部语义）
* 新增 src/api/due-shared.ts 进程级单例：badge 心跳、每日提醒、总览刷新、挑战模式、配对游戏五路 due 读取统一共享（同一时刻多次读取只打一次内核）；复习会话 loadQueue 带本场 reviewedIDs 保持直连
* 失效钩子全覆盖：appendRevlog（插件/原生评分漏斗，AT-11 语义）、cards-created、skip、快速改期、addRiffCards 包装（index.ts 全部建卡路径经此）、管理器删卡/重置
* 测试 224→230；0 errors/0 warnings；governance OK

## v0.108.0 2026-10-03 · AT-3 V2 请求超时层与启动探测隔离

* 新增 src/libs/timeout.ts 可取消超时层（withTimeout + TimeoutError）：与任意 Promise 组合的有界等待，任一方先落定即清计时器不泄漏，迟到一方的 settle 静默忽略（6 组单测：快/慢/断三态 + 计时器清除）
* V2 内核请求统一接入 3s 有界等待（V2_TIMEOUT_MS）：getMigrationStatus 探测与 getStatistics 等全部 /api/flashcard/* 端点在断核/慢核下 3s 内转 N/A/可重试，不再无限期挂起；菜单 redetectV2 重试路径保持
* 启动探测异步化：onload 不再 await 探测——插件初始化不被旧内核/慢内核阻塞，riff 兼容路径立即可用；探测完成后异步落库 gatewayState，菜单/诊断/getV2Status 均为运行时读取（完成前短暂显示 N/A 属预期）
* 测试 218→224；0 errors/0 warnings；governance OK

## v0.107.0 2026-10-03 · BX-3 本场偏好：复习面板会话内设置覆盖

* 复习面板新增「本场偏好」弹层（⚙ 头部按钮）：评分按钮风格（四档/三档）、队列倒序、超时模式三项可会话内即时覆盖，不落盘不污染全局设置
* 融合层 eff()：面板内全部 27 处设置读取统一切换至「本场覆盖优先、全局兜底」，覆盖项与全局同值时自动摘除（覆盖面最小化）；超时相关覆盖即时重启计时器（AT-10 热更新语义一致）
* 覆盖生命周期 = 面板生命周期：切页/重建面板即还原；覆盖激活时 ⚙ 按钮亮显（⚙●）提示
* i18n 中英各 +5 键（prefsTitle/prefsHint/prefsReset/prefsFour/prefsThree）；补齐 v0.106.0 漏升的版本号
* 新增 src/core/session-prefs.ts 纯函数（mergeSessionPrefs/pruneSessionPrefs）+ 6 组单测；测试 212→218；0 errors/0 warnings；主包 gzip 27.47KB（预算内）；governance OK（925 条目，187 done）

## v0.106.0 2026-10-03 · BX-1 离线子集：欧式小数逗号归一化

* 宽松判分数值归一化补强：欧式小数逗号 → 小数点（仅数字间），使 "3,14" ≡ "3.14"（欧洲标注习惯）；千位分隔逗号 "1,000" ≡ "1.000" 同理；非数字上下文逗号仍正常剥离
* docs/17 BX-1 注记补录（v0.106 离线子集交付留痕）
* 测试 208→212；0 errors/0 warnings；主包 gzip 27.59KB（预算内）

## v0.105.0 2026-10-03 · Kit smoke 收官补测：LvHeatmap/LvSkeleton（19 组件全覆盖）

* **LvHeatmap**（7 天数据渲染/末格 lv-cell-today/title 含日期/空数据不崩溃）、**LvSkeleton**（count 个骨架行/block 圆角样式/count=0 不渲染）——5 组 smoke 单测
* **Kit 组件测试 19/19 全覆盖**：LvStat/LvSteps/LvChip(宿主)/LvSection(宿主)/LvPage(宿主)/LvDrawer(宿主)/LvProgress/LvKbd/LvEmpty/LvError/LvSegmented/LvSwitch/LvTabs/LvRow/LvSlider/LvInput/LvSelect/LvHeatmap/LvSkeleton
* 测试 201→208；0 errors/0 warnings；主包 gzip 27.59KB（预算内）

## v0.104.0 2026-10-03 · Kit smoke 收官：布局壳 snippet 宿主全覆盖

* **LvPageHost/LvDrawerHost**（children snippet 完整形态）：title/subtitle/dot 渲染、children 内容、open=false 无遮罩——布局壳三件套（LvSection/LvPage/LvDrawer）snippet 传子组件的宿主测试全部就位
* 纯 props + 事件 + 可绑定 + snippet 宿主 Kit smoke 覆盖达 **13+4=17 处断言组**，可离线测试的 Kit 层全部覆盖
* 测试 198→201；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.103.0 2026-10-03 · A-06 决策落地：发布包裁剪为用户向文档 + Kit smoke 第五批（LvSection 宿主）

* **A-06 发布包内容决策落地**：dist 静态拷贝从全量 34 篇内部文档裁剪为用户向五件（20-FAQ/21-上手指南/22-术语表/23-许可证/PRIVACY，stripBase 平铺防 docs/docs 嵌套）；内部调研与治理文档经 GitHub 仓库获取；README 双语仍随包。决策可逆（git revert vite.config.ts）
* **Kit smoke 第五批（LvSection 宿主）**：LvSectionHost（children+actions snippet 完整形态）——title/sub/children/actions 四要素渲染断言
* 修复 LvSectionHost 重复 describe（v0.102 遗留）
* 测试 198→198（重整）；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.102.0 2026-10-03 · 测试宿主方案：snippet 传子组件可测（限制解除）

* 解决 v0.86 记录的基建限制：以**测试宿主组件**（tests/helpers/*Host.svelte，{#snippet} 在 .svelte 文件内定义可正常编译）替代 createRawSnippet——绕开模块解析错位，snippet 传子的 Kit 组件从此可挂载测试
* 首个宿主单测：LvChip 渲染 children 与 tone 语义色（LvChipHost）
* docs/16 限制说明更新为已解决（宿主方案留痕）
* 测试 198→199；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.101.0 2026-10-03 · ADR-7 修复：预览移除候选的下标错位 + 未勾选 skipped 语义

* 修复（v0.81 回归）：预览 ✕ 移除候选后下标错位——wizard 候选携带 `origIndex`（✕ 移除后仍指向作业 candidates 原位），逐卡 `CARD_CREATED` 不再标记错误候选
* 未勾选/被移除的候选记 `CARD_SKIPPED`（状态机新增 skipped 语义，COMMIT_DONE 前清算）——作业不再卡死在 committing、不再产生虚假「未完成导入」横幅
* docs/24 ADR-7 草案同步 skipped 状态留痕
* 测试 198/198；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.100.0 2026-10-03 · v1.0.0-rc 发布就绪审计（docs/35）

* 新增 docs/35-v1.0.0-发布就绪审计.md：发布链路七环节逐环核查（全通过）+ 审计发现处置表 + **打 tag 前检查清单**（真机验收/A-06 决策/版本一致性/Release notes 引用/已知限制声明）
* **新发现已登记 A-06（P1）**：dist 静态拷贝把全量内部文档（34 篇/约 720K，含内部待办清单与调研报告）打进 package.zip——发布前需决策保留或裁剪为用户向文档
* 本轮已在线修复的历史缺口：存储体检漏 ai-jobs（v0.94）、PRIVACY 漏两个存储文件（v0.95）、基线滞后（v0.97）——均已有对应治理门禁防再犯
* docs/README 登记 docs/35；docs/17 基线段同步 v0.100.0
* 测试 192/192；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.99.0 2026-10-03 · docs-only：术语表交叉引用 + Kit 规范补测试覆盖说明

* docs/22 术语表三行（作答耗时/动态建议/AI 作业）补 docs/17 条目 ID 交叉引用（AQ-13/AQ-8/AQ-17+ADR-7）——术语可追溯
* docs/16 补记 Kit 单测覆盖现状（13 个纯 props 组件已测）与 snippet 传子组件的限制说明
* docs/17 基线登记同步 v0.99.0
* docs-only 轮次：测试 198/198、0 errors/0 warnings、governance OK、主包 gzip 27.51KB 不变

## v0.98.0 2026-10-03 · Kit smoke 第六批：可绑定包装组件（收官）

* **LvSlider**（区间/步长/初值反映、oninput 触发 onchange 携带数值）、**LvInput**（type/placeholder/disabled 透传、oninput 携带字符串）、**LvSelect**（options 渲染与初值选中、change 携带新值、disabled 透传）——6 组输入契约单测
* 纯 props/事件/可绑定 Kit smoke 覆盖达 **11 个**组件；仅剩 snippet 传子组件（LvSection/LvDrawer/LvPage 内容与 LvChip）维持暂缓——**可离线测试的 Kit 层至此全部覆盖**
* 测试 193→198；0 errors/0 warnings；主包 gzip 27.51KB（预算内）

## v0.97.0 2026-10-03 · 基线登记修正 + 治理脚本基线版本门禁

* 修正 docs/17「当前基线」滞后（登记在 v0.95.0、实际已到 v0.96.0）——该漂移两轮内发生两次，根因是基线更新无门禁
* `scripts/check-governance.mjs` 新增第⑧项核对：docs/17「当前基线」必须包含 package.json 当前版本号，否则 CI 失败——基线漂移从此自动化拦截
* `transitionJob` GENERATE_OK 纯度测试补齐（替换 candidates 不突变入参）
* 测试 192→193；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.96.0 2026-10-03 · docs-only：AQ-16 部分交付登记

* docs/17 AQ-16 条目补记 v0.92-v0.93 部分交付（此前基线更新但条目本身漏注记——治理遗漏）：ai-lint 预览 lint 离线子集三类提示 + 编辑响应式重算已落地；余验收（多事实/歧义语义级 lint、来源块追溯、批次告警与接受率）需真实模型或更大改动，保持开放
* checkbox 无变化（部分交付不勾选）；192/192 单测等门禁数字不变

## v0.95.0 2026-10-03 · 隐私披露补全 + 治理脚本新增存储披露核对

* docs/PRIVACY 存储表列全 7 个数据文件：补 `session-state.json`（当日已评分/已跳过卡 ID 与计数，次日作废）与 `suspend-today.json`——此前的披露行只列了 4/7
* `scripts/check-governance.mjs` 新增**存储披露核对**：src/index.ts 声明的每个 `*_DATA` 文件必须在 PRIVACY.md 披露，否则 CI 失败——隐私披露完整性从此自动化防漂移
* docs-only 轮次：测试 192/192、0 errors/0 warnings、主包 gzip 27.51KB 不变

## v0.94.0 2026-10-03 · cards-created 事件转正 + 存储体检补 ai-jobs

* docs/14 §8 预留事件 `lv-cards:cards-created` 转正：AI 制卡逐卡导入全部完成后发射 `{deckID, count, blockIDs[]}`（ADR-7 落地后 payload 确定；快速/标记等无 AI 制卡路径不发）
* 存储体检（设置 → 数据）补 `ai-jobs.json` 行（v0.81 新增的持久化文件此前未入体检清单）
* 测试 192/192；0 errors/0 warnings；主包 gzip 27.46KB（预算内）

## v0.93.0 2026-10-03 · AQ-16 lint 响应式重算 + 行号引用核对

* 修正：lint 改为 `$derived.by` 随 candidates（含 textarea 编辑）响应式重算——此前仅生成时计算一次，用户编辑后提示不更新（v0.92 CHANGELOG 的「编辑后重算」描述不实，已修正实现与文档一致）
* docs/33 行号引用抽查：review.svelte rate()/riff.ts reviewRiffCard/forget-requeue 三处引用仍与源码语义一致，无需更新
* 测试 192/192；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.92.0 2026-10-03 · AQ-16 预览 lint（离线子集）：重复/过长/过短提示

* 新增 `core/ai-lint.ts`（零依赖纯模块）：批内重复（忽略大小写/空白）、过长（q/a >300 字符）、过短（问题 <4 字符）三类静态提示——只标记不删除，取舍由用户勾选
* AI 向导预览卡显示 warn chip（疑似重复/过长/问题过短）；重新生成/编辑后 lint 随 candidates 重算
* 语义级 lint（多事实/歧义/关键符号缺失）仍归 AQ-16 完整验收（后置）
* 测试 186→192；i18n 533 对齐；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.91.0 2026-10-03 · ADR-7 收尾：总览未完成导入提示

* ADR-7 最后一处可见性断点修复：未完成 AI 导入此前只在打开向导时可见（恢复横幅）——现总览页新增提示条「有未完成的 AI 导入（n/m 已落卡）」，点击直接打开向导（恢复横幅在其中），生成/导入后经 onReviewed 自动刷新
* docs/22 术语表补「AI 作业」条目
* 测试 186/186；i18n 531 对齐；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.90.0 2026-10-03 · Kit smoke 第五批：布局壳组件头部契约

* **LvSection**（title/sub 渲染、title 缺省不渲染区块头）、**LvPage**（title/subtitle/dot 渲染、title 缺省无页头）、**LvDrawer**（open=true 渲染遮罩+title、open=false 无遮罩）——6 组布局壳契约单测
* 已知限制：Esc→onclose 经 svelte:window 的 window 级 keydown 在 happy-dom 下模拟不可靠，归 docs/34 V 项真机验收（注释在案）
* 纯 props Kit smoke 覆盖达 **13 个**组件（含布局壳的头部契约）；children/actions snippet 内容维持暂缓
* 测试 180→186；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.89.0 2026-10-03 · Kit smoke 第四批：LvTabs + LvRow

* **LvTabs**（页签渲染/active `aria-selected`+高亮类/点击 onchange 携带 id/点当前页签仍触发——hub 重挂载自愈语义允许）、**LvRow**（label 渲染/hint 缺省不渲染/提供时置于 label 下方）——5 组 smoke 单测
* 纯 props/事件 Kit smoke 覆盖达 **10 个**组件（LvStat/LvSteps/LvProgress/LvKbd/LvEmpty/LvError/LvSegmented/LvSwitch/LvTabs/LvRow）；剩余 LvSection/LvDrawer/LvPage 为 snippet 传子组件维持暂缓
* 测试 175→180；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.88.0 2026-10-03 · Kit smoke 第三批：交互组件 + 测试稳定性

* **LvSegmented**（选中 aria-checked/点击 onchange 携带值/点击当前项不触发/disabled 全禁用）、**LvSwitch**（checked 反映/change 携带新值/disabled 传递）——6 组交互契约单测
* AQ-21 截断重载测试超时 30s→60s（两次 20k round-trip 对系统负载敏感，负载高峰误报）
* 纯 props + 事件类 Kit smoke 覆盖达 8 个组件
* 测试 169→175；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.87.0 2026-10-03 · Kit smoke 第二批：基础组件四件

* **LvProgress**（0-100 钳制）、**LvKbd**（键位渲染）、**LvEmpty**（文案/空态无按钮/action 按钮触发）、**LvError**（role=alert/重试触发/无 onretry 无按钮）——7 组 smoke 单测
* 纯 props Kit 组件 smoke 覆盖：LvStat/LvSteps/LvProgress/LvKbd/LvEmpty/LvError 六个（snippet 传子组件的 LvSection/LvDrawer/LvPage 维持暂缓）
* 测试 162→169；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.86.0 2026-10-03 · 组件测试基建：Kit 组件可挂载测试

* 测试基建：`vitest.config.ts`（happy-dom + svelte 插件 + @ 别名 + browser 条件）+ devDeps `happy-dom`/`@testing-library/svelte`——Svelte 组件从此可在单测中挂载
* 首批 Kit smoke 测试：**LvStat**（label/value 渲染、denom/progress 缺省不渲染）、**LvSteps**（步骤渲染、`aria-current="step"` 落在当前步、onclick 回跳触发、缺省禁用）——渲染契约与 a11y 语义被测试锁定
* 已知限制（记录在案）：以 snippet 传子的组件（LvChip 等）因 createRawSnippet 与 browser 条件编译的模块错位暂不纳入，待测试基建升级后补测
* 测试 158→162；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.85.0 2026-10-03 · docs-only：巡检轮（CI 门禁在线核实 + 规范同步）

* GitHub CI 巡检：v0.84.0 引入的 Governance consistency 门禁在线上运行成功（两次推送全绿，35s）——治理自动化正式生效
* docs/16 LvSteps 行同步 v0.71 的 aria 变更（`aria-current="step"`，不再用 button+listitem 组合）
* docs/34 执行顺序建议补 V-15 编排说明（与 V-7 同属真实 AI 专场，需配合一次导入中强制中断）
* docs-only 轮次：测试 158/158、0 errors/0 warnings、governance OK、主包 gzip 27.34KB 不变

## v0.84.0 2026-10-03 · 工程化：治理一致性校验入 CI

* 新增 `scripts/check-governance.mjs`：docs/17 ↔ docs/31 六项自动核对——[x] 总数、summary 块五项统计、每包 summary.total、docs/17 总计行（含加粗格式）、每条 entry 主归属存在性、AQ/BZ 组统计行抽查；不一致即 CI 失败
* `.github/workflows/ci.yml` 新增 Governance consistency 门禁步骤（i18n 校验之后、单测之前）
* 此前每轮手工做的计数核对从此自动化——手改文档漂移会被 CI 拦截
* 测试 158/158；0 errors/0 warnings；主包 gzip 27.34KB（预算内）

## v0.83.0 2026-10-03 · docs-only：ADR-7 状态更新 + 隐私说明补 ai-jobs

* docs/24 候选 ADR-7 状态更新：Proposed → **Partially Accepted**（v0.80-v0.82 第 1-3 步按草案实现且与设计一致；第 4 步真实模型联调待 G3-call）；两处实现决策差异留痕——逐卡提交为 appendBlock+单卡入组完整流程（无半成品窗口，开放问题①据此关闭）、放弃语义为删作业记录且已落卡保留（不回滚）
* docs/PRIVACY 存储表补 **ai-jobs.json**：断点续传用途、材料来源摘要不存原文、生成的卡片问答文本与导入状态、20 作业上限与放弃语义
* docs-only 轮次：测试 158/158、0 errors/0 warnings、主包 gzip 27.34KB 不变

## v0.82.0 2026-10-03 · ADR-7 收口补件：失败明细导出 + V-15 验收项

* AQ-17「失败明细可导出」验收点落地：恢复横幅新增「复制失败明细」按钮——导出每张失败卡的序号/题面/错误原因到剪贴板（getUnfinishedAIJob 扩展 failed 明细数组）
* docs/34 补 **V-15 AI 导入中断续传冒烟**：生成→导入中强制中断→重开向导验证横幅计数→继续导入不重复→放弃语义（已落卡保留，设计决策见 ADR-7）
* AQ-17 剩余验收：真实模型联调（须 G3-call 门禁）；「回滚已落卡」按 ADR-7 设计决策为保留不回滚
* 测试 158/158；i18n 530 对齐；0 errors/0 warnings；主包 gzip 27.31KB（预算内）

## v0.81.0 2026-10-03 · ADR-7 第 2+3 步：ai-jobs 存储接入 + 向导生命周期/恢复入口

* **存储接入（第 2 步）**：`ai-jobs.json` 入批量加载批次（zipLoaded 键位扩展），经 loadStore normalize 兜底；写入统一走 persist 队列
* **向导生命周期（第 3 步）**：生成阶段创建作业并入账（drafting→generating→reviewing；失败/取消落账后重开向导可续传）；导入改**逐卡提交**（appendBlock+单卡入组成功即 CARD_CREATED 记账持久化），中断后 pending 续传、已落卡如实保留
* **恢复入口**：向导打开时检测未完成导入（committing/failed/canceled 且有 pending）→ 横幅显示「n/m 已落卡」+ 继续/放弃；继续走 `resumeAIJobCommit`（从首个 pending 续传，单卡失败不阻断后续）；放弃删除作业记录（已落卡不动）
* AQ-17 实现顺序 3/4 完成（剩：真实模型联调，须过 G3-call）；重生成仅替换候选内容、保持作业绑定（已知边界：作业记录中该卡为旧文本）
* 测试 158/158；i18n 528 对齐；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.80.0 2026-10-03 · ADR-7 第 1 步落地：AI 批次作业状态机纯模块

* `core/ai-jobs.ts`（零依赖纯模块，ADR-7 实现顺序第 1 步）：六态迁移表（drafting→generating→reviewing→committing→done，failed/canceled 带 resumeTo 回迁）、逐卡事件（CARD_CREATED/CARD_FAILED）、续传视角 `firstPendingIndex`、normalize 清洗（白名单状态/候选剔除/字段收敛）、容量维护（20 个上限优先淘汰已结作业）
* 语义要点：非法迁移返回 ok:false 且 job 原样不变（纯函数）；CANCEL 记录 resumeTo+「canceled by user」；COMMIT_DONE 拒绝仍有 pending 的作业；source 摘要三字段截断（隐私边界）
* 迁移表全覆盖单测 9 组：主链/失败回迁/取消续传/非法迁移/越界拒绝/纯函数性/清洗/淘汰/摘要边界
* 未接线（按 ADR 实现顺序：存储接入与向导 UI 为后续切片）；测试 149→158；0 errors/0 warnings；主包 gzip 25.58KB 不变

## v0.79.0 2026-10-03 · docs-only：候选 ADR-7「AI 批次作业状态机」设计定稿

* docs/24 新增**候选 ADR-7**（AQ-17 设计草案，R54 确认的唯一实现缺口）：ai-jobs.json 存储契约、六态状态机（drafting/generating/reviewing/committing/done/failed/canceled）、逐卡断点续传（每卡成功即持久化，续传只处理 pending）、孤儿防护（卡组先建即记 deckID 不重建）、取消语义（已创建保留如实入账）、幂等重试（成功标记永不重复）
* 开放问题 3 项（半成品块判重口径、source 原文落盘隐私边界、跨设备续传范围）与决策门槛（W3 排期授权后实现；状态机纯模块+迁移表单测可先行）
* docs/17 AQ-17 条目同步登记设计出处；checkbox 无变化
* docs-only 轮次：测试 149/149、0 errors/0 warnings、主包 gzip 25.58KB 不变

## v0.78.0 2026-10-03 · docs-only：R55 真机验收清单

* docs/34-真机验收清单.md（R55 产出）：V-1—V-14 共 14 组结构化操作手册，覆盖 v0.64-v0.77 全部「代码+单测完成、待真机」项——会话恢复双 P0 冒烟、显示答案四路径、原生评分旁听去重、写入失败可观测、对话框关闭责任与焦点归还、中心页并发刷新、AI 取消/降级（需真实 AI）、移动端计时策略、考试动态建议与复盘口径、覆盖三视图、设置热更新（含跨窗口已知边界）、卸载冲刷、懒加载竞态、加载体感
* 每项含前置/步骤/预期/证据记录方式与失败特征；附执行顺序建议（约 2 小时）与记录约定（通过回 docs/17 勾选，失败留诊断不改码）
* docs/18、docs/README、docs/00（R55 小节）同步登记；checkbox 无变化
* docs-only 轮次：测试 149/149、0 errors/0 warnings、主包 gzip 25.58KB 不变

## v0.77.0 2026-10-03 · 死代码收尾 + 加载路径性能护栏

* 移除最后一个零引用模板遗留 `libs/const.ts`（块类型映射表，99 行）——libs/ 目录至此全部为在用模块
* 性能预算扩展：新增「2 万条 normalize（加载清洗路径）≤1.5s」护栏——AQ-3 清洗 + AQ-21 快照重建的加载成本被 CI 持续看护
* AQ-21 截断重载测试显式放宽超时至 30s（两次 20k JSON round-trip 对系统负载敏感，v0.76 曾因默认 5s 超时误报）
* 测试 148→149；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.76.0 2026-10-03 · 事件契约补登记 + 最后两个测试盲区

* docs/14 §8 事件契约表补 `lv-cards:settings-changed`（v0.71 引入但未入契约文档）：触发时机=设置保存成功落盘后、payload `{}`（消费方自行重读）、幂等性=防抖合并后的最终值
* 测试盲区收官：**lvLog 环形缓冲**（dump 格式、500 字符截断、200 条上限、非字符串消息、clear）；**dailyTarget**（向上取整、缺失 null、deck 规模仅 deck 范围参与的口径边界用测试固化）
* 测试 143→148；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.75.0 2026-10-03 · riff API 契约测试 + 术语表补齐

* 新增 riff API 契约测试（mock 全局 fetch）：**payload 形状锁定**——`reviewedCards→[{cardID}]` 映射、review/skip/add/batchSet 请求体；错误映射（code≠0 抛 msg、无 msg 带错误码）、请求头 JSON、超时 AbortError→code=504（friendlyError 可映射）——内核契约面首次有测试护栏
* docs/22 术语表补 8 条：作答耗时、knownCards、卡片覆盖、SR 语法、动态建议等 v0.64-v0.72 新引入概念
* 测试 137→143；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.74.0 2026-10-03 · 死代码清理 + 帮助补 Obsidian SR 语法

* 移除模板遗留死代码约 550 行（全部经引用核查为零引用）：`libs/setting-utils.ts`（宿主 Setting 包装类）、`libs/promise-pool.ts`（并发池，含其测试）、`libs/components/` 整目录（Form/setting-panel/sidebar-tabs-layout/b3-typography）、`libs/index.d.ts`（仅为 setting-utils 服务的环境类型）
* `dialog.ts` 移除三个无人引用导出（inputDialog/inputDialogSync/confirmDialogSync），保留在用的 confirmDialog/confirmDialogBool/simpleDialog（内部）/svelteDialog；补回被误删的 IConfirmDialogArgs 接口定义
* 内置帮助「制卡方式」补 Obsidian SR 语法说明（中英：`:::` 双向按正向、多行 `?`/`??`、tag 仅作提示）
* 测试 140→137（promise-pool 测试随模块移除）；0 errors/0 warnings；主包 gzip 25.38KB（预算内）

## v0.73.0 2026-10-03 · 巡检轮：CI 全绿核实 + 回归自查 + 最后三组测试盲区

* GitHub CI 巡检：v0.64→v0.72 全部推送提交的 CI 运行均为 success（含最新 main）
* 回归自查抽查：AQ-2（显示答案 onclick + persistSession 落盘）与 AQ-5（native-events 测试）修复点与测试均在位，未被后续改动削弱
* 最后三组测试盲区：**ai-batches**（id/date 校验剔除、blockIDs 过滤、200 条截尾、tokens 非有限回 undefined、幂等）；**suspend-today**（跨日清空、suspend 去重自动滚日、结构非法落空库）；**friendlyError**（错误码命中 i18n、未命中透传、非 Error 值）
* 至此 src/core 与 src/libs 全部纯函数模块均有直接单测覆盖
* 测试 130→140；0 errors/0 warnings；主包 gzip 25.58KB（预算内）

## v0.72.0 2026-10-03 · 测试盲区补齐 + AO 立项提案齐备

* 测试盲区三组补齐：**occlusion 数据契约**（serialize↔parse 往返、坏 JSON/错版本/rects 非数组宽容 null、多框顺序）；**并发池 PromiseLimitPool**（并发上限、严格串行排空、失败传播）；**AI 输出解析**（```json 围栏与噪声容忍、question/answer 别名、d 难度越界过滤、空 q/a 剔除、非数组抛错）
* `parseCards`/`estimateTokens` 拆至零依赖模块 ai-parse.ts（ai.ts 再导出，调用方 import 不变）——AI 网络层与解析层测试解耦
* docs/17 AO 组立项提案 4 份齐备（均标注「待用户授权立项」）：Orbit 阅读态迷你复习、hashcards 内容寻址防重复、olmps/memo 代码卡型、anki-jlpt 语音例句卡
* 测试 115→130；0 errors/0 warnings；主包 gzip 25.38KB（预算内）

## v0.71.0 2026-10-03 · 质量收口：svelte warnings 25→0 + AO 立项提案

* 真问题修复 4 条：LvSteps 步骤指示器以 `aria-current="step"` 取代非法的 button+listitem 组合；遮挡画布 SVG 补 `role="img"`+aria-label（键盘替代为撤销/清空按钮）、删除框加注释豁免；AI 向导死 CSS `.lv-ob-step` 清理
* 刻意初值捕获登记 21 条：`state_referenced_locally` 逐条加 svelte-ignore + 理由注释（对话框 props 一次性传入 / hub 首帧直达 / 设置快照 draft / LvStat 动画首值——挂载后语义即固化，非缺陷）
* `pnpm check` 达成 **0 errors / 0 warnings**（此前 25 warnings 含已登记刻意的基线长期存在）
* docs/17 AO 组新增立项提案草案 2 份（标注「待用户授权立项」，不建 checkbox）：Orbit 阅读态迷你复习（建议并入 BX-7 评审）、hashcards 内容寻址防重复（与内核查重互补）
* 测试 115/115；i18n 526 对齐；主包 gzip 25.38KB（预算内）

## v0.70.0 2026-10-03 · docs-only：AT-1 候选 ADR + R54 五旅程验证报告

* docs/24 新增**候选 ADR-6「跨前端同步重载协议」**（AT-1 预研，状态 Proposed 待宿主契约确认）：按 key 版本探测 + 有界串行 reload（先冲刷本地未落盘写入）+ 合并策略（settings 逐字段/revlog 幂等去重/session 取新）+ Tab 保持与失败重试；开放问题与决策门槛逐条列出，未改任何运行代码
* docs/00 新增 **R54 五旅程验证报告**：五条关键旅程逐一对照 docs/33 矩阵与源码——唯一确认的实现缺口是 AQ-17（AI 批次断点续传，W3 泳道）；可合并观察 1 项（③觉得答案有误 ↔ W2 主链回源修订，仅记录不删 ID）；可降级 0、需新增 0
* 结论：离线分析类产出进入稳态，后续 R 轮次以真机 fixture 采集与人工任务观察为主
* docs-only 轮次：无代码改动；测试 115/115、0 errors、主包 gzip 25.38KB 不变

## v0.69.0 2026-10-03 · docs-only：R53 能力矩阵与评分口径

* docs/33-能力矩阵与评分口径.md（R53 首项产出）：全卡型（QA/Cloze/Occlusion/Typing/Choice/SR 导入）与学习模式（普通/cram/范围筛选/倒序随机/听写/限时挑战/配对/忘记卡重现/超时）逐项「已实现/实验中/宿主依赖/后置」矩阵，证据=源码行号（v0.68.0）
* 评分口径总表：正式评分唯一通道推论——只有面板 rate() 与快速改期会写内核，原生事件只旁听，挑战/配对/重现/AI 建议一律不产生正式评分；超时「自动评遗忘」边界显式化
* N/A 与缺失字段口径表（原生无 duration/deckID、内核 state 未开放、2 万条截断、V2 状态机）与宿主依赖清单（V2 端点/onDataChanged/Agent 桥/真机 fixture）
* 查重结论：扫描发现断点均已有条目承载，未新增 checkbox；docs/README 与 docs/00 R53 记录同步登记
* docs-only 轮次：无代码改动；测试 115/115、0 errors、主包 gzip 25.38KB 不变

## v0.68.0 2026-10-03 · W2 收口批次：文档维度覆盖 + E-09 判分保真 + 弹窗焦点归还

* AQ-12（收口）：文档维度覆盖——`docCoverage` 纯聚合 + `getBlockDocMap`/`getDocTitles` 内核 SQL 分块查询，总览新增文档 Top3（标题回源，空标题回退文档 ID 前缀）与「无法归属文档」单独列示（块已删除/移动不猜测）；查询失败整区隐藏；AR-6 generation 守卫覆盖异步归属查询；至此总览/卡组/文档三维度覆盖齐备
* E-09（W1/W2 部分完成）：打字判分关键符号保真——宽松模式保留小数点/正负号/百分号/比号（`-1 vs 1`、`1.2 vs 12` 不再被归一化抹平）；NFKC 折叠全角输入（全角作答不再整段被剥离）；相似度分母改 max(期望, 作答)——额外错误命题拉低相似度而非被无视；空期望 ratio=0 不产「完美匹配」误导（5 组新单测，数值单位/容差策略仍归 BX-1 W4）
* AR-2（增量）：svelteDialog 任意关闭路径归还打开前焦点（宿主已卸载则跳过），键盘流不因弹窗丢焦
* 待办：勾选 AQ-12（三维度覆盖齐备），BX-1/AR-2 增量标注，docs/17 与 31 索引同步 924 条/186 勾选
* 测试 109→115；i18n 525 对齐；0 errors；主包 gzip 25.38KB（预算内）

## v0.67.0 2026-10-03 · W2 互通与口径批次：Obsidian SR 语法 + 卡组覆盖分解 + 口径文档

* AQ-11：Obsidian Spaced Repetition Markdown 互通——`core/obsidian-sr.ts` 解析/导出纯模块：单行 `::`/`:::`、多行 `?`/`??`、`==挖空==` 整块、`#flashcards/...` tag deck 提取、媒体透传；双向语法按正向制卡（内核一块一卡边界记录于模块）；标记制卡扫描接入（tag 不进卡面、空边不产卡）；导出往返幂等，方向/媒体/cloze/tag 全 fixture（22 组单测）
* AQ-12（增量）：卡组维度覆盖 `deckCoverage`——按 revlog.deckID 归属、规模缺失不算覆盖率、原生缺 deckID 的卡单独列示不摊派；总览覆盖区新增卡组分解（规模 Top5，回源卡组名）
* AQ-9（增量）：统计口径文档——内置帮助新增「复习日志统计口径」（中英：本地时区/day-start、2 万条明细上限与快照、作答耗时封顶、覆盖率口径、CSV 列含义），同步 docs/21、FAQ 与 CSV 导出注释
* BZ-2：按验收 B 路径关闭——上限语义明确接受，存储构成与保留范围写入 PRIVACY.md「复习日志的构成与上限语义」与 FAQ
* 待办：勾选 AQ-11/BZ-2，docs/17 与 31 索引同步 924 条/185 勾选
* 测试 95→109；i18n 523 对齐；0 errors；主包 gzip 25.11KB（预算内）

## v0.66.0 2026-10-03 · W2 开局批次：考试动态建议 + 作答耗时统计 + 导出契约

* AQ-8：考试计划动态重算建议层——`dynamicPlanAdvice` 学习日/容量/落后补偿/不可行原因（按每日上限所需天数）/容量未知口径；考试页计划卡只读展示并注明「不改内核调度」，deck 容量实时取规模，容量/数据变化即时反映；notebook 范围归属需内核查询，回退简单日均（7 组 fixture 单测，时钟注入可测）
* AQ-13：单卡作答耗时统计——revlog 可选 `dur` 字段（题面呈现→评分按壁钟差），设置新增「单卡作答计时上限」（5-3600s，默认 60s）封顶防离席超长样本；原生事件无字段保持 N/A 不补 0；总览新增「今日作答(分)」卡片（无数据不显示）；normalize/merge 清洗透传
* AQ-9（部分）：CSV 导出新列 `duration` + `review_state`（本地无内核复习状态，显式缺失留空不猜测）；旧 7 列文件照常导入，导出再导出幂等（optimizer 端到端样本解析与 timezone/day-start 口径文档待补）
* 考试页建议输入走 exam ctx 只读 getter（getRevlog/getDailyCap），不改任何写入路径
* AQ-12（部分）：总览新增「卡片覆盖（本地证据）」行——coverageStats 去重卡数 / 内核卡组规模分母 / 起点日期注记，覆盖率≠掌握率随行展示；分母缺失不算覆盖率（卡组/文档维度聚合回源待后续切片）
* 待办：勾选 AQ-8/AQ-13（离线证据完整），docs/17 与 31 索引同步 924 条/183 勾选
* 测试 84→95；i18n 522 对齐；0 errors；主包 gzip 24.55KB（预算内）

## v0.65.0 2026-10-03 · W1 收尾批次：Dialog 责任 + 计时/刷新治理 + 截断一致性

* 修复（AR-2）：Dialog 关闭责任——svelteDialog 此前把调用方传入的空 onClose/onExit stub 原样下传，内嵌组件的取消/完成/导入成功**根本关不掉对话框**；现注入可用 close（先执行调用方回调再销毁，幂等只关一次），选卡组/遮挡确认 await 写入成功才关闭、失败保留草稿与选择
* 修复（AR-10）：限时挑战计时器 start 从未启动 interval（倒计时永远满格）——改 monotonic deadline 按壁钟校正，计时点与材料加载完成一致，0 秒只完成一次
* 修复（AR-11）：考试复盘报告时间窗用 Math.min 扩大起点、且不过滤计划范围——现固定「计划创建以来」，deck 按 deckID、notebook 按来源块归属查内核，无法归属的记录单独列示，缺失历史声明「无可核算数据」而非全 0（交错/移动/缺失 fixture 单测）
* AQ-21：revlog 截断一致性——days 采用快照策略（早于最早保留明细的日期保留合法快照，覆盖内由明细重建），knownCards 保留截断卡首评语义（20,001+ 条重载 fixture）
* AQ-6：V2 迁移状态白名单归一——未知状态→Unknown 与「无端点=未升级」区分，report 字段清洗（契约纯逻辑拆至 v2-contract.ts）
* AR-6/AT-11：dashboard 刷新 generation 守卫 + 原生/插件两路评分经 reviewed 事件 800ms 合并自刷；manager 分页与到期清单各自序号守卫，切入「今日到期」即重拉（顺带修复 dueSet 非响应式导致过滤不刷新）
* AT-10：设置保存广播 settings-changed 事件，复习超时参数立即重启计时（评分风格/顺序下一卡自然生效）；AT-2：onunload 冲刷防抖中的设置保存 + 清理计时日志
* 体积：复习面板移入懒加载 chunk（首开一次性加载）——主包 31.92KB→25.01KB gzip，review chunk 10.02KB，预算内余量充足
* AR-7：复习超时同款 deadline 持续计时政策——后台节流按壁钟校正、剩余时长可预期（替代 interval tick 累减），后台不自动重复评分
* 待办：勾选 AQ-21/AR-11（离线证据完整），新增 BZ-1（懒加载挂载竞态真机验证）/BZ-2（knownCards 对账清理），docs/17 与 31 索引同步 924 条
* 测试 71→84；i18n 512 对齐；0 errors；主包 gzip 25.01KB（预算内）

## v0.64.0 2026-10-02 · W1 可靠性批次：会话恢复双 P0 + 数据/请求治理

* 修复（P0·AQ-1）：会话恢复加载错位——onload 6 项 Promise.all 只解构 5 项，session 实际读到 AI 批次数据致重载清空；改为 keys 数组驱动 + zipLoaded 位置配对（键值数不匹配直接抛错），AI 批次复用批量加载不再二次读盘
* 修复（P0·AQ-2）：复习页显示答案按钮从未绑定 onclick（容器点击又跳过 button，鼠标翻面失效、打字输入被覆盖层死区遮挡）；评分改为先更新计数再落盘（重载不丢刚评的一张）；skip 与跳过集合落盘（重载不重复出卡）；撤销同步落盘；打字输入/选择题/改期/遮挡 overlay 抬层修复点击死区
* revlog（AQ-3）：加载时逐条清洗——NaN/越界时间戳、非法评分（小数/越界/数字字符串）、非字符串卡 ID 一律剔除，days 由清洗后明细重建；fuzz 与幂等单测
* 原生评分（AQ-5）：rating 严格收敛 1-4 整数（显式 skip 记 0，5/-1/2.5 丢弃进诊断）；事件时间优先内核字段（缺失标估算）；eventId / cardID+1s 时间窗幂等去重
* 队列竞态（AQ-19）：复习 loadQueue 请求序号守卫——快速切范围/连续重试时旧响应不改队列、卡面、计数与计时器；setCurrent 等待期切卡不重启旧计时器
* 内核响应（AQ-20）：unwrapKernelData 统一校验 + getBlockDOM 封装，review/card-detail/challenge/occlusion/pairing/源上下文 6 处裸 fetchSyncPost 调用点收口；复习卡面刷新失败保留旧卡面（仅诊断），首载失败进可重试错误态
* 设置校验（AQ-22）：逐字段类型/范围/枚举校验——数值钳制、HH:mm 白名单、枚举白名单、savedFilters 条目清洗限量；损坏数据落默认，未知字段仍前向兼容
* 持久化（AQ-4）：统一写入队列——同 key 串行（旧数据不覆盖先写）、失败有限重试、ok/fail 与最近成功时间可观测；「复制诊断」含 persist 报表，最终失败限流提示用户；卸载前 waitAll(3s) 冲刷
* AI 安全（AQ-14/15）：生成请求 AbortController——关闭向导/取消按钮即取消，取消不触发 fallback、晚到响应不写回（genSeq 守卫）；自定义端点 15s 超时；fallback 仅对网络/超时/5xx/429 生效，401/配额/4xx/解析失败直接给原因；切换备用端点有提示
* i18n +2 键（512 对齐）；测试 27→71；主包 gzip 31.92KB（预算内）；全批离线可验证（fixture/单测），真机 fixture 复核项见 docs/17

## v0.63.0 2026-10-01 · AI 深化小件 + 完成页小确幸

* AI：单卡重新生成——预览卡 ↻ 同源同参 count=1 替换该张（保留勾选态）
* AI：难度标注——prompt 要求 d 字段（1易/2中/3难，宽容解析），预览卡显示难度 chip；默认与三预置模板同步
* 复习：完成页连击里程碑庆祝（365/100/30/7 天 🔥 专属文案）
* 复习：每日一语——5 条学习科学小贴士按日期轮换，设置可关（dailyTipEnabled）
* 安全：{@html} 净化审计通过（全部站点渲染内核 DOM 同信任级；AI 内容走文本插值不进 {@html}）
* 体积：示例卡内容移入 help 懒加载 chunk，主包保持预算内
* i18n +12 键（510 对齐）；测试 27/27；主包 gzip 31.52KB

## v0.62.0 2026-10-01 · 架构文档 + 浮层可达性收尾

* docs/14 §8：lv-cards:* 事件契约表固化（reviewed/streak-changed/session-finished/gateway-changed 的触发时机、payload、幂等性、失败隔离约定）
* docs/24：架构决策记录（ADR）起步——双轨 Gateway / Kit-only UI / 内核唯一调度源 / 体积预算 / 数据契约五条 Accepted
* a11y：帮助浮层打开即焦点移入（Esc 关闭后焦点归还卡面，闭环 542）
* 待办审计：6 项陈旧/已覆盖条目核实归档（CSV 导入早已存在、目标达成语义已实现等）
* 测试 27/27；0 errors；主包 gzip 31.81KB（预算内）

## v0.61.0 2026-10-01 · 请求层 + 存储入口 + 落盘笔记本

* 工程：libs/request.ts 统一请求层——AbortController 15s 超时（超时映射 code=504 入错误码表），riff.ts 全端点迁移
* 工程：libs/store.ts TypedStore 入口（loadStore：key+fallback+normalize，绝不抛错阻塞启动）；core/ai-batches.ts schema 清洗（id/date 必填、blockIDs 过滤、200 条上限）接入
* 设置：「落盘笔记本」下拉（targetNotebookId）——快速制卡/标记制卡/帮助/示例/AI 卡/学习报告/考试复盘 7 个落盘点统一走 targetNotebook()
* 修复：onload 中 normalizeSessionState 重复调用；目标笔记本未设置时行为与旧版一致
* i18n +3 键（498 对齐）；测试 27/27；主包 gzip 31.75KB（预算内）

## v0.60.0 2026-10-01 · Kit 控件组专项

* Kit +5：LvSwitch / LvSelect / LvInput（`$bindable` 封装 b3 原生控件）、LvSteps（向导步骤指示器）、LvSkeleton（骨架屏 row/block）；工具 lvConfirm.ts（Promise 化确认框）
* 采用：设置页 14 个开关行、timeoutMode/aiMode 下拉、AI 区 6 个文本输入行全部换装组件；AI 向导步骤头换 LvSteps；管理器加载态换 LvSkeleton
* docs/16：组件目录 14→19+1 工具
* 测试 27/27；0 errors；主包 gzip 31.50KB（预算内）

## v0.59.0 2026-10-01 · AI 深化批 + 诊断基建

* AI：Provider 回退链（备用端点/Key/模型，主端点失败自动切换）
* AI：Prompt 模板库——自定义 system 模板 + 通用/考研/语言三预置一键填充 + 恢复默认（占位符 count/language/type）
* AI：向导新增「粘贴剪贴板」输入源（权限拒绝降级提示）
* 统计：AI 批次记录 tokens 估算，总览 AI 质量区显示累计消耗
* 诊断：libs/log.ts 200 条环形日志缓冲随「复制诊断」导出；修复诊断中硬编码的过期插件版本号（改读 manifest）
* 错误映射：friendlyError + i18n 错误码文案（393 加密笔记本/401/404/500/501），复习错误态统一走映射
* i18n +22 键（495 对齐）；测试 27/27；主包 gzip 31.33KB（预算内）

## v0.58.0 2026-10-01 · 交互与数据打磨批

* 修复（真实 bug）：评分音效 sfxEnabled 开关从未生效——音效一直无条件播放；补设置区开关 + 三种合成风格（清音/木鱼/铃）
* 管理器：按遗忘次数排序（本地 revlog 统计）、选中卡导出 CSV（BOM+转义）、文本过滤 200ms 防抖
* 复习：队列倒序模式（与随机互斥）、答案揭示前隐藏元信息开关、浮层关闭后焦点归还卡面、触屏评分按钮 ≥44px 命中区
* 角标：请求序号守卫（慢响应不覆盖新数据）+ 语义色（今日目标达成变绿）
* 设置：normalizeSettings 幂等 round-trip 单测（未知字段前向兼容只增不删）；画像导入 256KB 上限
* i18n +15 键（473 对齐）；测试 27/27

## v0.57.0 2026-10-01 · 外观设置四件套

* 设置新增「外观」区（M12·FR5）：卡面字号缩放（0.85-1.25× LvSlider）、评分按钮密度（舒适/紧凑）、热力图范围（17/26/52 周）、角标刷新间隔（30s/60s/关闭，保存即生效）
* i18n +10 键（462 对齐）；测试 26/26

## v0.56.0 2026-10-01 · 内置帮助 + 示例工作区 + 画像 diff 预览

* 制卡：命令「生成示例工作区」——自动建「示例卡组」+ 5 张形态各异示例卡（普通/公式/挖空/列表/问答），落文档并打开
* 帮助：命令「打开使用帮助」——中英双语帮助文档写入「小驴闪卡/使用帮助」并打开（独立 chunk，不占主包预算）
* 画像：应用预设确认框升级为逐项 diff（模块开关 ✓/✕、参数 前值→后值；无改动明确提示）
* Gateway：探测结果落库 settings.gatewayState，手动重探广播 lv-cards:gateway-changed 事件（M11 契约）
* 工程：CI 增补 gzip ≤32KB 门禁步骤；M1-M12 契约对齐注记（M12 为系统层模块不入表）；README 双语状态重写至实况
* i18n +6 键（452 对齐）；测试 26/26

## v0.55.0 2026-10-01 · 错误边界 + 会话刷新联动 + 主包重回体积预算

* 中心：hub 三子页包 svelte:boundary（{#key active} 随页签重建自愈），单子页崩溃出重置卡片不拖垮中心；考试子页改为首次切入动态 import
* 联动：dashboard 经 onSessionFinished 订阅会话完成事件自刷；复习结束即刷顶栏角标（不等 60s 心跳）
* 体积：settings/deck-picker/quick-card 移入懒加载 chunk——主包 141.6KB/gzip 39.4KB → 98.8KB/gzip 29.11KB，重回 ≤32KB 预算
* i18n +1 键（448 对齐）；测试 26/26

## v0.54.0 2026-10-01 · 复习体验打磨 + 考试里程碑通知

* 复习：完成页新增 ⏱ 会话时长与今日目标 a/b 进度（AX·544）
* 修复：快捷键 interactive target guard（AX·541）——焦点在面板外交互控件时不抢键；面板内 Space/Enter 接管防双动作
* 移动端：复习面板四向 safe-area inset 适配（306）
* 提醒：考试里程碑系统通知 30/7/1 天（同计划同日去重，点击开中心，免打扰静默）；通知点击跳转行为核实归档
* i18n +3 键（447 对齐）；测试 26/26

## v0.53.0 2026-10-01 · 陈旧项大扫账 + 细节修复

* 待办审计：12 项「已实现未归档」条目核实归档（DeckPicker 内联新建/睡前巩固包/batchLimit/count-up 统一/tween 竞态消解/onboarded/诊断版本/CI test 门禁/backlogDays/TTS 设置/键位内核覆盖/空态制卡引导）
* 修复：考试编辑器名称/日期缺失静默不保存 → 内联红字三态提示（role=alert）
* 细节：LvStat 分母为 "0" 时隐藏；超时倒计时 >1 小时显示 H:MM:SS
* i18n +3 键（444 对齐）；测试 26/26

## v0.52.0 2026-10-01 · LvError 统一错误态 + a11y 补齐

* Kit +1：LvError（错误信息 + 重试按钮 + role=alert），复习/管理/总览三屏统一接入（G 组·异常边界）
* a11y：复习头部 6 个图标按钮补 aria-label；清理三屏死样式（.lv-error/.lv-hint 残留），未用选择器清零
* docs/16 Kit 规范 13→14 组件
* 测试 26/26；i18n 441 对齐

## v0.51.0 2026-10-01 · 标记符制卡 + 配对挑战 + XP/等级

* 制卡：标记符扫描制卡（M2·FR4）——命令扫描活动文档，`术语:: 定义` 新建问答块（落「小驴闪卡/标记制卡/日期」），「？」结尾块整块直加；勾选预览两步入组，设置可关
* 激励：配对挑战（M4·FR4）——到期挖空卡限时配对（题面挖空 × 答案列），计时/失误统计，<4 张挖空卡友好提示；纯练习不计调度
* 激励：XP/等级（M8·FR3，默认关）——calcXp 本地推导，总览里程碑区 Lv 章，设置开关，2 单测
* i18n +25 键（441 对齐）；测试 26/26

## v0.50.0 2026-10-01 · 分叉检测与合并预览 + 发版纪律链

* 数据健康：revlog 导入分叉检测（M10·FR3）——同 ts+cardID 评分冲突计 forks 并采样预览，默认保守跳过；检测到分叉后可确认「以导入为准」幂等重放合并
* 工程单元测试：2 万条 revlog 写入+重算+全聚合 <2s 预算单测；分叉双策略单测（24/24）
* 发版纪律（D9）：`pnpm release` 链（交互改版→全套门禁）；斜杠命令核实插件 API 无注册入口，维持命令面板+块菜单降级；热键留空按 D5 归档
* i18n +2 键（416 对齐）

## v0.49.0 2026-10-01 · 设置四区重组 + 决策记录完善

* 设置：学习偏好按 13-W10 拆为四区——节奏与目标 / 评分与作答 / 朗读与音效 / 提醒与免打扰
* 修复（真实 bug）：设置页 ttsEnabled 行重复渲染两次（此前补丁残留）
* docs/18：D3（disabledInPublish）/ D4（kernel.js 桩）决策依据补充——包体/生命周期影响已核验
* i18n +4 键（418 对齐）

## v0.48.0 2026-10-01 · 键盘双触发修复 + Kit 三新组件 + count-up 收敛

* 修复（真实 bug）：复习键盘双通道双触发（AJ 复核）——容器与 window 同时绑定 onKeydown，焦点在面板内时回看键「开即关」、连续 skip 误跳两张；改为互斥去重（容器管面板内，window 管面板外）
* Kit +3：LvSegmented（分段选择器，接评分风格）、LvSlider（数值滑杆，接超时秒数）、LvDrawer（右侧抽屉，卡片详情迁移至此）
* LvSection 头部操作插槽（曲线导出 PNG 按钮已用）；LvStat animate 收敛：dashboard 删除局部 tween，六个统计卡统一 count-up
* docs/16 Kit 规范更新（10→13 组件）；测试 21/21

## v0.47.0 2026-10-01 · 管理器状态过滤 + 画像导入导出

* 卡片管理：状态下拉过滤（M6·FR2）——全部/新卡（本地 revlog 无记录）/已复习/今日到期（内核到期清单按需加载）
* 设置：画像导入导出（M12·FR6）——当前「模块开关+推荐参数」打包为 JSON 分享，导入校验后应用到草稿
* 待办清单核对：滑卡手势（v0.42）、限时挑战（v0.38）、虚拟滚动（分页覆盖）三项陈旧项标记完成
* i18n +11 键（416 对齐）；测试 21/21

## v0.46.0 2026-10-01 · 图表导出 PNG + 源上下文预览

* 统计：保持曲线一键导出 PNG（M5）——克隆 SVG 并把 CSS 变量解析为具体色值（独立渲染无级联上下文），底色填充 960×300 导出
* 复习：源上下文预览（M3·P2）——「≡」开关只读展示来源块前后各 2 块（SQL sort 窗口取块），当前来源块高亮
* LvSection Kit 组件新增 actions 头部操作插槽
* i18n +4 键（401 对齐）；测试 21/21

## v0.45.0 2026-10-01 · 编辑返回续读 + 里程碑统计 + 死样式修复

* 复习：应用内编辑返回检测（M3）——思源内切回复习页不触发 visibilitychange，新增「离开面板 ≥15s 重新点入」节流刷新当前卡
* 统计：里程碑（M5）——累计复习 / 最长连续 / 活跃天数 / 单日之最 四格 + 下一目标阶梯（1000/5000/20000）+ 2 单测
* 修复：dashboard 样式表 `.lv-ret` 缺失闭合括号，导致 weekdelta/airow/ms 等嵌套死样式（warnings 30→21）
* i18n +8 键（397 对齐）；测试 21/21

## v0.44.0 2026-10-01 · 忘记卡本批重现 + 挖空制卡 + 重复提示 + 周期对比

* 复习：忘记卡本批重现（M3）——评「遗忘」的卡在批尾再出现一次，仅本地强化（不计内核调度、不计 revlog），卡面 chip 标识，设置可关（requeueAgain）
* 制卡：块菜单新增「挖空并制卡」——捕获编辑器选区 Range，一键包 `==...==` 后走常规入组流程（含重复提示）
* 制卡：重复提示（M2）——目标块已在复习集时弹确认框（confirmDialogBool），幂等提醒可仍要添加
* 统计：周期对比（M5）——本周 vs 上周 新学/复习/遗忘 三指标 delta（正向主色/反向红），revlog.weekCompare + 2 单测
* i18n +12 键（389 对齐）；测试 19/19

## v0.43.0 2026-10-01 · 卡片管理「只看烂卡」筛选 + 构建修复

* 卡片管理新增「只看烂卡」筛选（M6·FR5 leech 工作台入口），与批量重置/移除联动
* LvStat 计数动画走 $effect（runes 模式），移除未使用导入
* managerCtx 补齐 getLeechCards 接线；修复工具栏残留片段导致的模板解析错误
* 版本门禁强化：CHANGELOG 顶部小节必须与当前版本一致（防版本漂移）

## v0.42.0 2026-10-01 · 复习进度条 + 触屏滑动 + 听写模式

* 复习会话顶部进度条（渐变填充，按 batchLimit 计算）
* 触屏滑动改善：右滑=良好、左滑=忘记、上滑=翻转（M3·FR10）
* 听写模式：TTS 读答案 + 键入 + LCS 差异判分（M4·FR6）
* 设置项：每批拉取数、听写开关、TTS 语速/音色、免打扰时段
* 快捷键帮助浮层（? 键），九行快捷键速查
* 卡片管理：批量移除/重置（带确认）、烂卡 AI 改写入口、卡片详情浮层
* 到期角标：考试倒计时优先于到期数
* saveSettings 1.2s 防抖、会话状态持久化、复习日志 CSV 导入
* 修复 writeReportDoc ctx 引用、dashboard 清理整合

## v0.40.0 2026-10-02 · 设置导出 + 批量限制 + 笔记本源 + 选区源

* 设置导出 JSON（设置→数据→导出设置）
* 每批拉取数量设置（batchLimit，0=跟随内核上限）
* AI 向导「载入笔记本内容」SQL 聚合最近 200 块
* AI 向导「载入选中文字」防御式窗口选区
* i18n +6 键（328 对齐）

## v0.39.0 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围（W 组睡前巩固包落地）
* 命令面板新增「睡前巩固（只学新卡）」直达入口
* i18n +4 键

## v0.38.0 2026-10-02 · 限时挑战模式（M8·FR4）

* 限时挑战模式：3 分钟快答——加载到期卡，快速标记"记得/忘了"，不计内核评分（纯练习）
* 三阶段流程：idle → running（倒计时+计数）→ done（结算屏）
* 正确/未知计数实时显示；练习结束展示统计

## v0.37.0 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」：计划窗口内统计数据写入「小驴闪卡/考试复盘/<计划名>」普通文档（剪贴板通道保留）
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.36.0 2026-10-02 · Onboarding 首启自动弹出

* 首次安装且未完成引导时，延迟 2 秒自动弹出三步引导
* settings.onboarded 标记控制：完成/跳过后不再自动弹出

## v0.35.0 2026-10-02 · 兜底循环#1

* 兜底①优化：代码扫查零 console.log/TODO/FIXME
* 兜底②新增待办：docs/17 AP 组扩展——MCP Server 模式 / AI 导师模式 / 助记媒介 / AI 词汇构建器
* 兜底③调研：GitHub 四路高星项目搜索
* settings.ts 旧 ID 迁移完整覆盖确认

## v0.34.0 2026-10-02 · 自主待办清零

* LvCardsSettings 新增 onboarded 标记
* settings.ts 旧 ID 迁移完整覆盖
* 全部自主可闭环待办已消化——剩余项收敛为 V2 依赖 / 🧪 真机 / P3 远期三类

## v0.33.0 2026-10-02 · 评分音效（Web Audio 合成）

* 评分音效：Web Audio oscillator 按评分级别合成，无文件依赖
* settings.sfxEnabled 开关；修复重复声明

## v0.32.0 2026-10-02 · 细节加固 + 术语表 + 许可证清单

* dashboard getDailyTargets 单次计算缓存
* dueText 格式化加固
* docs/22 术语表；docs/23 依赖许可证清单

## v0.31.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势：右滑评良好、左滑评遗忘、上滑翻面

## v0.30.0 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.36.0 2026-10-02 · Onboarding 首启自动弹出

* 首次安装且未完成引导时，延迟 2 秒自动弹出三步引导
* settings.onboarded 标记控制

## v0.35.0 2026-10-02 · 兜底循环#1

* 兜底①优化：代码扫查零 console.log/TODO/FIXME
* 兜底②新增待办：docs/17 AP 组扩展
* 兜底③调研：GitHub 四路高星项目搜索
* settings.ts 旧 ID 迁移完整覆盖确认

## v0.34.0 2026-10-02 · 自主待办清零

* LvCardsSettings 新增 onboarded 标记
* settings.ts 旧 ID 迁移完整覆盖
* 全部自主可闭环待办已消化

## v0.33.0 2026-10-02 · 评分音效（Web Audio 合成）

* 评分音效：Web Audio oscillator 按评分级别合成，无文件依赖
* settings.sfxEnabled 开关；修复重复声明

## v0.32.0 2026-10-02 · 细节加固 + 术语表 + 许可证清单

* dashboard getDailyTargets 单次计算缓存
* dueText 格式化加固
* docs/22 术语表；docs/23 依赖许可证清单

## v0.31.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.36.0-合并 2026-10-02 · Onboarding 首启自动弹出 + settings 去重清理

* 首次安装且未完成引导时，延迟 2 秒自动弹出三步引导
* settings.onboarded 标记控制

## v0.35.0-合并 2026-10-02 · 兜底循环#1

* 兜底①优化：代码扫查零 console.log/TODO/FIXME
* 兜底②新增待办：docs/17 AP 组扩展
* 兜底③调研：GitHub 四路高星项目搜索
* settings.ts 旧 ID 迁移完整覆盖确认

## v0.34.0-合并 2026-10-02 · 自主待办清零

* LvCardsSettings 新增 onboarded 标记
* settings.ts 旧 ID 迁移完整覆盖
* 全部自主可闭环待办已消化

## v0.33.0-合并 2026-10-02 · 评分音效（Web Audio 合成）

* 评分音效：Web Audio oscillator 按评分级别合成，无文件依赖
* settings.sfxEnabled 开关；修复重复声明

## v0.32.0-合并 2026-10-02 · 细节加固 + 术语表 + 许可证清单

* dashboard getDailyTargets 单次计算缓存
* dueText 格式化加固
* docs/22 术语表；docs/23 依赖许可证清单

## v0.31.0-合并 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0-合并 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0-合并 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0-合并 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0-合并 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.26.0 2026-10-02 · AI 向导笔记本范围源

* AI 向导新增「载入笔记本内容」：选择笔记本 → SQL 聚合最近 200 个文本块进材料框
* 自诊断补思源内核版本号

## v0.25.0 2026-10-02 · 学习报告导出 + 快捷键帮助

* 学习报告导出：总览页「学习报告」按钮一键下载 Markdown
* 快捷键帮助覆盖层：`?` 键弹出九项键位说明

## v0.24.0 2026-10-02 · 上手指南 + 选区输入源

* 用户上手指南（docs/21）：5 分钟版——入口矩阵/第一张卡/第一场复习/统计解读/画像/进阶表/FAQ 链接
* AI 向导新增「载入选中文字」源
* README 双语加上手指南与 FAQ 快捷链接

## v0.23.0 2026-10-02 · 懒加载瘦身 + TTS 语音选择

* 构建优化：AI 向导/遮挡编辑器/onboarding 三重组件懒加载——主包 gzip 49.8→30.2KB
* TTS 语音选择：设置区语音下拉
* 能力状态表（AN P1）

## v0.22.0 2026-10-02 · 免打扰时段 + 安全与隐私收口

* 免打扰时段（X 组）：quietStart/quietEnd 默认 23:00-08:00
* 清空复习日志前自动导出 JSON 备份
* TTS 语速设置
* docs/PRIVACY.md + 20-FAQ

## v0.21.0 2026-10-02 · 面包屑按钮 + 版本门禁 + 保存重试

* 面包屑「复习本文档闪卡」按钮（官方 addBreadcrumbButton API）
* revlog 保存失败单次重试
* 版本事实源门禁

## v0.20.0 2026-10-02 · 会话中断恢复 + TTS 语速

* 会话中断恢复：session-state.json 按日落盘
* TTS 语速设置
* 积压预警阈值可配

## v0.19.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.18.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.17.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay

## v0.16.0 2026-10-02 · 理论参考线 + leech AI 改写联动 + 记忆持久化

* 保持曲线叠加理论参考线
* leech 行 AI 改写联动
* lastHubTab/lastReviewScope 记忆

## v0.15.0 2026-10-02 · 考后复盘 + 存储体检 + 积压预警

* 考试归档 + 复盘报告
* 存储体检
* 积压预警
* 设置未保存确认

## v0.14.0 2026-10-02 · AnkiConnect 客户端 + 自诊断 + 细节设置

* AnkiConnect 客户端
* 自诊断
* 卡面宽度设置
* 全弹窗响应式

## v0.13.0 2026-10-02 · 批次质量反哺 + leech 清单

* AI 批次质量区块
* leech 重写清单

## v0.12.0 2026-10-02 · 选择题模式 + 保存筛选 + 记忆保持曲线

* 选择题练习模式
* 保存筛选
* 记忆保持曲线 SVG

## v0.11.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0-合并 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0-合并 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0-合并 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0-合并 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.26.0 2026-10-02 · AI 向导笔记本范围源

* AI 向导新增「载入笔记本内容」：选择笔记本 → SQL 聚合最近 200 个文本块进材料框
* 自诊断补思源内核版本号

## v0.25.0 2026-10-02 · 学习报告导出 + 快捷键帮助

* 学习报告导出：总览页「学习报告」按钮一键下载 Markdown
* 快捷键帮助覆盖层：`?` 键弹出九项键位说明

## v0.24.0 2026-10-02 · 上手指南 + 选区输入源

* 用户上手指南（docs/21）：5 分钟版——入口矩阵/第一张卡/第一场复习/统计解读/画像/进阶表/FAQ 链接
* AI 向导新增「载入选中文字」源
* README 双语加上手指南与 FAQ 快捷链接

## v0.23.0 2026-10-02 · 懒加载瘦身 + TTS 语音选择

* 构建优化：AI 向导/遮挡编辑器/onboarding 三重组件懒加载——主包 gzip 49.8→30.2KB
* TTS 语音选择：设置区语音下拉
* 能力状态表（AN P1）

## v0.22.0 2026-10-02 · 免打扰时段 + 安全与隐私收口

* 免打扰时段（X 组）：quietStart/quietEnd 默认 23:00-08:00
* 清空复习日志前自动导出 JSON 备份
* TTS 语速设置
* docs/PRIVACY.md + 20-FAQ

## v0.21.0 2026-10-02 · 面包屑按钮 + 版本门禁 + 保存重试

* 面包屑「复习本文档闪卡」按钮（官方 addBreadcrumbButton API）
* revlog 保存失败单次重试
* 版本事实源门禁

## v0.20.0 2026-10-02 · 会话中断恢复 + TTS 语速

* 会话中断恢复：session-state.json 按日落盘
* TTS 语速设置
* 积压预警阈值可配

## v0.19.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.18.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.17.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay

## v0.16.0 2026-10-02 · 理论参考线 + leech AI 改写联动 + 记忆持久化

* 保持曲线叠加理论参考线
* leech 行 AI 改写联动
* lastHubTab/lastReviewScope 记忆

## v0.15.0 2026-10-02 · 考后复盘 + 存储体检 + 积压预警

* 考试归档 + 复盘报告
* 存储体检
* 积压预警
* 设置未保存确认

## v0.14.0 2026-10-02 · AnkiConnect 客户端 + 自诊断 + 细节设置

* AnkiConnect 客户端
* 自诊断
* 卡面宽度设置
* 全弹窗响应式

## v0.13.0 2026-10-02 · 批次质量反哺 + leech 清单

* AI 批次质量区块
* leech 重写清单

## v0.12.0 2026-10-02 · 选择题模式 + 保存筛选 + 记忆保持曲线

* 选择题练习模式
* 保存筛选
* 记忆保持曲线 SVG

## v0.11.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.30.0-合并 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.29.0-合并 2026-10-02 · 仅新卡/仅旧卡模式（睡前巩固包）

* 复习范围选择器新增「仅新卡 / 仅旧卡」客户端过滤伪范围
* 命令面板新增「睡前巩固（只学新卡）」直达入口

## v0.28.0-合并 2026-10-02 · 每批数量设置 + 笔记本源 + CSV 导入

* 每批拉取数量设置
* AI 向导「载入笔记本内容」
* 复习日志 CSV 导入

## v0.27.0-合并 2026-10-02 · 考试复盘双通道 + 恢复默认设置

* 考试复盘「写入复盘文档」
* 恢复默认设置按钮
* 修复考试计划卡片操作条缺失容器 div

## v0.26.0 2026-10-02 · AI 向导笔记本范围源

* AI 向导新增「载入笔记本内容」：选择笔记本 → SQL 聚合最近 200 个文本块进材料框
* 自诊断补思源内核版本号

## v0.25.0 2026-10-02 · 学习报告导出 + 快捷键帮助

* 学习报告导出：总览页「学习报告」按钮一键下载 Markdown
* 快捷键帮助覆盖层：`?` 键弹出九项键位说明

## v0.24.0 2026-10-02 · 上手指南 + 选区输入源

* 用户上手指南（docs/21）：5 分钟版——入口矩阵/第一张卡/第一场复习/统计解读/画像/进阶表/FAQ 链接
* AI 向导新增「载入选中文字」源
* README 双语加上手指南与 FAQ 快捷链接

## v0.23.0 2026-10-02 · 懒加载瘦身 + TTS 语音选择

* 构建优化：AI 向导/遮挡编辑器/onboarding 三重组件懒加载——主包 gzip 49.8→30.2KB
* TTS 语音选择：设置区语音下拉
* 能力状态表（AN P1）

## v0.22.0 2026-10-02 · 免打扰时段 + 安全与隐私收口

* 免打扰时段（X 组）：quietStart/quietEnd 默认 23:00-08:00
* 清空复习日志前自动导出 JSON 备份
* TTS 语速设置
* docs/PRIVACY.md + 20-FAQ

## v0.21.0 2026-10-02 · 面包屑按钮 + 版本门禁 + 保存重试

* 面包屑「复习本文档闪卡」按钮（官方 addBreadcrumbButton API）
* revlog 保存失败单次重试
* 版本事实源门禁

## v0.20.0 2026-10-02 · 会话中断恢复 + TTS 语速

* 会话中断恢复：session-state.json 按日落盘
* TTS 语速设置
* 积压预警阈值可配

## v0.19.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.18.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.17.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay

## v0.16.0 2026-10-02 · 理论参考线 + leech AI 改写联动 + 记忆持久化

* 保持曲线叠加理论参考线
* leech 行 AI 改写联动
* lastHubTab/lastReviewScope 记忆

## v0.15.0 2026-10-02 · 考后复盘 + 存储体检 + 积压预警

* 考试归档 + 复盘报告
* 存储体检
* 积压预警
* 设置未保存确认

## v0.14.0 2026-10-02 · AnkiConnect 客户端 + 自诊断 + 细节设置

* AnkiConnect 客户端
* 自诊断
* 卡面宽度设置
* 全弹窗响应式

## v0.13.0 2026-10-02 · 批次质量反哺 + leech 清单

* AI 批次质量区块
* leech 重写清单

## v0.12.0 2026-10-02 · 选择题模式 + 保存筛选 + 记忆保持曲线

* 选择题练习模式
* 保存筛选
* 记忆保持曲线 SVG

## v0.11.0 2026-10-02 · 触屏滑卡手势（M3·FR10）

* 复习面板触屏手势

## v0.10.0 2026-10-02 · 听写模式（M4·FR6 前置落地）

* 听写模式开关：问题态自动朗读答案，输入听写后 diff 判分

## v0.9.0 2026-10-02 · AI 向导「当前文档」输入源

* AI 向导新增「载入当前文档」：getAllEditor 取活动编辑器 → exportMdContent

## v0.8.0 2026-10-02 · TTS 朗读 + 积压阈值 + 考试倒计时 chip

* 答案 TTS 朗读（Web Speech）
* 积压预警阈值可配
* 总览头部考试倒计时 chip

## v0.7.0 2026-10-02 · 图片遮挡卡型（M4·FR4 v1）

* 块菜单「制作遮挡卡」→ SVG 拖拽编辑器 → 块属性 lv-occlusion → 复习态 overlay
